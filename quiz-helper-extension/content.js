// Content script - main functionality

class QuizHelper {
  constructor() {
    this.isEnabled = true;
    this.observerActive = false;
    this.processedQuestions = new Set();
    this.init();
  }

  // Debug logging method
  async debugLog(message, type = 'log', data = null) {
    try {
      await chrome.runtime.sendMessage({
        action: 'addDebugLog',
        log: {
          timestamp: new Date().toISOString(),
          message,
          type,
          data,
          url: window.location.href
        }
      });
    } catch (error) {
      console.error('Failed to send debug log:', error);
    }
  }

  async init() {
    await this.debugLog('🚀 Quiz Helper initializing...', 'info');
    
    // Check if extension is enabled
    const result = await chrome.storage.sync.get(['extensionEnabled']);
    this.isEnabled = result.extensionEnabled !== false;
    
    await this.debugLog(`Extension enabled: ${this.isEnabled}`, 'info');
    
    if (this.isEnabled) {
      this.startObserver();
      this.processExistingQuestions();
    }
    
    // Listen for extension toggle
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.extensionEnabled) {
        this.isEnabled = changes.extensionEnabled.newValue;
        this.debugLog(`Extension toggled: ${this.isEnabled ? 'ON' : 'OFF'}`, 'info');
        if (this.isEnabled) {
          this.startObserver();
          this.processExistingQuestions();
        } else {
          this.stopObserver();
          this.removeAllButtons();
        }
      }
    });

    await this.debugLog('✅ Quiz Helper initialized successfully', 'info');
  }

  startObserver() {
    if (this.observerActive) return;
    this.debugLog('🔍 Starting DOM observer...', 'info');
    
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.checkForQuestions(node);
          }
        });
      });
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    this.observerActive = true;
    this.debugLog('✅ DOM observer started', 'info');
  }

  stopObserver() {
    if (this.observer) {
      this.observer.disconnect();
      this.observerActive = false;
      this.debugLog('🛑 DOM observer stopped', 'info');
    }
    
    // Also clean up individual question observers
    document.querySelectorAll('[data-quiz-helper-observer]').forEach(el => {
      if (el._quizHelperObserver) {
        el._quizHelperObserver.disconnect();
        delete el._quizHelperObserver;
        delete el.dataset.quizHelperObserver;
      }
    });
    this.debugLog('🧹 Question observers cleaned up', 'info');
  }

  processExistingQuestions() {
    this.checkForQuestions(document.body);
  }

  checkForQuestions(container) {
    // Look for question panels based on the HTML structure
    const questionPanels = container.querySelectorAll ? 
      container.querySelectorAll('.question-panel, [id^="question"]') : [];
    
    if (container.classList && (container.classList.contains('question-panel') || 
        container.id?.startsWith('question'))) {
      questionPanels.push(container);
    }
    
    this.debugLog(`🔎 Searching for questions in container: ${container.tagName}${container.className ? '.' + container.className : ''}${container.id ? '#' + container.id : ''}`, 'log');
    
    if(questionPanels.length === 0) {
      this.debugLog('❓ No question panels found', 'log');
      return;
    }
    
    this.debugLog(`📝 Found ${questionPanels.length} question panel(s)`, 'info');
    questionPanels.forEach(panel => this.processQuestion(panel));
  }

  async processQuestion(questionPanel) {
    try {
      const questionId = this.extractQuestionId(questionPanel);
      this.debugLog(`🔍 Extracted questionId: "${questionId}" from panel`, 'info', { 
        panelId: questionPanel.id, 
        panelClass: questionPanel.className 
      });
      
      if (!questionId || this.processedQuestions.has(questionId)) {
        this.debugLog(`⏭️ Skipping question: ${questionId || 'no-id'} (already processed or no ID)`, 'warn');
        return;
      }

      this.debugLog(`🔄 Processing question: ${questionId}`, 'info');
      this.processedQuestions.add(questionId);
      
      const questionData = this.extractQuestionData(questionPanel);
      if (!questionData) {
        this.debugLog('❌ Failed to extract question data', 'warn');
        return;
      }

      this.debugLog(`📊 Question data extracted:`, 'info', {
        hash: questionData.questionHash,
        question: questionData.question.substring(0, 50) + '...',
        answersCount: questionData.allAnswers.length
      });

      // Always check for saved answer and highlight if found first
      await this.checkAndHighlightSavedAnswer(questionPanel, questionData);

      // Set up observer for this specific question to watch for correct answer appearance
      this.watchForCorrectAnswer(questionPanel, questionData);
      
      // Also check immediately if correct answer is already visible
      if (this.hasCorrectAnswer(questionPanel)) {
        this.debugLog('✅ Correct answer already visible, adding save button', 'info');
        this.addSaveButton(questionPanel, questionData);
      } else {
        this.debugLog('⏳ Correct answer not yet visible, watching for changes', 'log');
      }
      
    } catch (error) {
      this.debugLog('💥 Error processing question:', error, 'error');
    }
  }

  extractQuestionId(questionPanel) {
    // Extract question ID from various possible attributes
    let questionId = questionPanel.id || 
           questionPanel.querySelector('[id^="question"]')?.id ||
           questionPanel.dataset.questionId ||
           questionPanel.querySelector('[data-question-id]')?.dataset.questionId;
    
    // If still no ID, try to generate one from content
    if (!questionId) {
      const questionText = this.extractQuestionText(questionPanel);
      if (questionText) {
        // Generate a simple ID from question text
        questionId = 'q_' + questionText.substring(0, 50).replace(/\W/g, '').toLowerCase();
      }
    }
    
    return questionId;
  }

  extractQuestionData(questionPanel) {
    try {
      // Extract question text
      const questionText = this.extractQuestionText(questionPanel);
      if (!questionText) return null;

      // Extract all answer options
      const answers = this.extractAnswers(questionPanel);
      if (answers.length === 0) return null;

      // Generate a hash for the question
      const questionHash = this.generateQuestionHash(questionText, answers);

      return {
        questionHash,
        question: questionText,
        allAnswers: answers,
        url: window.location.href
      };
    } catch (error) {
      console.error('Error extracting question data:', error);
      return null;
    }
  }

  extractQuestionText(questionPanel) {
    // Try multiple selectors to find question text
    const selectors = [
      '.question-content',
      '.question-text',
      '.content-display',
      '[class*="question"]'
    ];

    for (const selector of selectors) {
      const element = questionPanel.querySelector(selector);
      if (element) {
        const text = element.textContent?.trim();
        if (text && text.length > 10) {
          return text;
        }
      }
    }

    return null;
  }

  extractAnswers(questionPanel) {
    const answers = [];
    
    // Look for radio buttons and their labels
    const radioInputs = questionPanel.querySelectorAll('input[type="radio"]');
    
    radioInputs.forEach((radio, index) => {
      const label = this.findAnswerLabel(radio);
      if (label) {
        answers.push({
          index,
          text: label.trim(),
          value: radio.value
        });
      }
    });

    return answers;
  }

  findAnswerLabel(radioInput) {
    // Try to find the associated label text
    const parent = radioInput.closest('.mc-text-question__radio-answer') ||
                   radioInput.closest('[class*="answer"]') ||
                   radioInput.parentElement;
    
    if (parent) {
      const label = parent.querySelector('label, .content-display');
      if (label) {
        return label.textContent?.trim();
      }
    }
    
    return null;
  }

  generateQuestionHash(questionText, answers) {
    // Create a simple hash based on question and answers
    const content = questionText + answers.map(a => a.text).join('');
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  hasCorrectAnswer(questionPanel) {
    // Check if this question shows the correct answer (after user clicked an answer)
    return questionPanel.querySelector('.correct-answer-box, .default-match, [class*="correct"], .question-panel--incorrect, .question-panel--correct') !== null;
  }

  watchForCorrectAnswer(questionPanel, questionData) {
    this.debugLog('👀 Setting up watcher for correct answer revelation', 'info');
    
    // Create a specific observer for this question panel to watch for answer revelation
    const questionObserver = new MutationObserver((mutations) => {
      let shouldCheck = false;
      
      mutations.forEach((mutation) => {
        // Check if any new nodes were added that might contain the correct answer
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.classList.contains('correct-answer-box') || 
                node.classList.contains('question-panel--incorrect') ||
                node.classList.contains('question-panel--correct') ||
                node.querySelector && node.querySelector('.correct-answer-box, .default-match, [class*="correct"]')) {
              shouldCheck = true;
              this.debugLog('🎯 Detected correct answer element added', 'info');
            }
          }
        });

        // Check if class changes indicate answer was revealed
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const target = mutation.target;
          if (target.classList.contains('question-panel--incorrect') || 
              target.classList.contains('question-panel--correct') ||
              target.classList.contains('default-match')) {
            shouldCheck = true;
            this.debugLog('🎯 Detected class change indicating answer revelation', 'info');
          }
        }
      });
      
      // If we detected changes that might indicate correct answer is now visible
      if (shouldCheck && this.hasCorrectAnswer(questionPanel)) {
        this.debugLog('💾 Correct answer now visible! Adding save button', 'info');
        // Add save button if it doesn't exist yet
        if (!questionPanel.querySelector('.quiz-helper-save-btn')) {
          this.addSaveButton(questionPanel, questionData);
        }
      }
    });

    // Observe this specific question panel
    questionObserver.observe(questionPanel, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });

    // Store observer reference to clean up later if needed
    if (!questionPanel.dataset.quizHelperObserver) {
      questionPanel.dataset.quizHelperObserver = 'active';
      questionPanel._quizHelperObserver = questionObserver;
      this.debugLog('👁️ Question observer activated', 'log');
    }
  }

  addSaveButton(questionPanel, questionData) {
    // Check if save button already exists
    if (questionPanel.querySelector('.quiz-helper-save-btn')) {
      return;
    }

    // Find the footer or next button area
    const footer = questionPanel.querySelector('#practice-question-footer-pc, .question-footer, [class*="footer"]') ||
                   questionPanel;

    // Create save button
    const saveButton = document.createElement('button');
    saveButton.className = 'quiz-helper-save-btn';
    saveButton.textContent = '💾 Lưu đáp án';
    saveButton.type = 'button';
    
    saveButton.addEventListener('click', () => {
      this.saveCurrentAnswer(questionPanel, questionData, saveButton);
    });

    // Add button next to existing buttons
    const buttonContainer = footer.querySelector('.d-flex, .btn-group') || footer;
    if (buttonContainer) {
      buttonContainer.appendChild(saveButton);
    }
    this.debugLog('💾 Save button added successfully', { questionHash: questionData.questionHash }, 'info');
  }

  async saveCurrentAnswer(questionPanel, questionData, saveButton) {
    try {
      this.debugLog('💾 Starting to save answer...', 'info');
      saveButton.textContent = '⏳ Đang lưu...';
      saveButton.disabled = true;

      // Extract correct answer
      const correctAnswer = this.extractCorrectAnswer(questionPanel);
      if (!correctAnswer) {
        throw new Error('Không tìm thấy đáp án đúng');
      }

      this.debugLog('✅ Correct answer extracted:', correctAnswer, 'info');
      questionData.correctAnswer = correctAnswer;

      // Save to storage via background script
      const response = await chrome.runtime.sendMessage({
        action: 'saveAnswer',
        questionData
      });

      if (response?.success) {
        saveButton.textContent = '✅ Đã lưu';
        saveButton.classList.add('saved');
        this.debugLog('💾 Answer saved successfully!', questionData, 'info');
        setTimeout(() => {
          saveButton.textContent = '💾 Lưu đáp án';
          saveButton.disabled = false;
          saveButton.classList.remove('saved');
        }, 2000);
      } else {
        throw new Error('Lỗi khi lưu đáp án');
      }
    } catch (error) {
      this.debugLog('💥 Error saving answer:', error, 'error');
      saveButton.textContent = '❌ Lỗi';
      setTimeout(() => {
        saveButton.textContent = '💾 Lưu đáp án';
        saveButton.disabled = false;
      }, 2000);
    }
  }

  extractCorrectAnswer(questionPanel) {
    // Look for the correct answer in various ways
    const correctAnswerBox = questionPanel.querySelector('.correct-answer-box');
    if (correctAnswerBox) {
      const text = correctAnswerBox.textContent;
      // Extract answer after "Câu trả lời chính xác là:"
      const match = text.match(/Câu trả lời chính xác là:\s*(.+)/);
      if (match) {
        return match[1].trim();
      }
    }

    // Look for selected correct answer
    const correctOption = questionPanel.querySelector('.default-match input[type="radio"]');
    if (correctOption) {
      const label = this.findAnswerLabel(correctOption);
      if (label) {
        return label;
      }
    }

    return null;
  }

  async checkAndHighlightSavedAnswer(questionPanel, questionData) {
    try {
      this.debugLog('🔍 Checking for saved answer...', 'log');
      const response = await chrome.runtime.sendMessage({
        action: 'getAnswer',
        questionHash: questionData.questionHash
      });

      if (response?.found && response.data?.correctAnswer) {
        this.debugLog('💡 Found saved answer! Highlighting...', response.data.correctAnswer, 'info');
        this.highlightCorrectAnswer(questionPanel, response.data.correctAnswer);
        this.showSuggestionNotice(questionPanel);
      } else {
        this.debugLog('❓ No saved answer found for this question', 'log');
      }
    } catch (error) {
      this.debugLog('💥 Error checking saved answer:', error, 'error');
    }
  }

  highlightCorrectAnswer(questionPanel, correctAnswerText) {
    this.debugLog('🎨 Highlighting correct answer:', correctAnswerText, 'info');
    const radioInputs = questionPanel.querySelectorAll('input[type="radio"]');
    let highlighted = false;
    
    radioInputs.forEach(radio => {
      const labelText = this.findAnswerLabel(radio);
      if (labelText && this.isAnswerMatch(labelText, correctAnswerText)) {
        const answerContainer = radio.closest('.mc-text-question__radio-answer') ||
                               radio.closest('[class*="answer"]') ||
                               radio.parentElement;
        
        if (answerContainer) {
          answerContainer.classList.add('quiz-helper-suggested');
          
          // Add suggestion icon
          if (!answerContainer.querySelector('.quiz-helper-icon')) {
            const icon = document.createElement('span');
            icon.className = 'quiz-helper-icon';
            icon.textContent = '💡';
            icon.title = 'Đáp án được gợi ý';
            answerContainer.appendChild(icon);
            highlighted = true;
          }
        }
      }
    });

    if (highlighted) {
      this.debugLog('✨ Answer highlighted successfully', 'info');
    } else {
      this.debugLog('⚠️ Failed to highlight answer - no matching option found', 'warn');
    }
  }

  isAnswerMatch(labelText, correctAnswerText) {
    // Normalize text for comparison
    const normalize = (text) => text.toLowerCase()
      .replace(/^\d+[-.)]\s*/, '') // Remove numbering
      .replace(/\s+/g, ' ')
      .trim();
    
    return normalize(labelText) === normalize(correctAnswerText);
  }

  showSuggestionNotice(questionPanel) {
    // Add a small notice that this question has a saved answer
    if (questionPanel.querySelector('.quiz-helper-notice')) {
      return;
    }

    const notice = document.createElement('div');
    notice.className = 'quiz-helper-notice';
    notice.innerHTML = '💡 <strong>Gợi ý:</strong> Đáp án được đánh dấu dựa trên lần trả lời trước';
    
    const header = questionPanel.querySelector('.question-panel__header') ||
                   questionPanel.querySelector('[class*="header"]') ||
                   questionPanel.firstElementChild;
    
    if (header) {
      header.appendChild(notice);
    }
  }

  removeAllButtons() {
    // Clean up observers
    document.querySelectorAll('[data-quiz-helper-observer]').forEach(el => {
      if (el._quizHelperObserver) {
        el._quizHelperObserver.disconnect();
        delete el._quizHelperObserver;
        delete el.dataset.quizHelperObserver;
      }
    });

    // Remove UI elements
    document.querySelectorAll('.quiz-helper-save-btn, .quiz-helper-notice, .quiz-helper-icon')
      .forEach(el => el.remove());
    
    document.querySelectorAll('.quiz-helper-suggested')
      .forEach(el => el.classList.remove('quiz-helper-suggested'));
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new QuizHelper();
  });
} else {
  new QuizHelper();
}

console.log("✅ Content script for Quiz Helper loaded successfully.");

