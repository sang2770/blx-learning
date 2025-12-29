// Content script - main functionality
class QuizHelper {
  constructor() {
    this.isEnabled = true;
    this.observerActive = false;
    this.processedQuestions = new Set();
    this.addSaveButtonInterval = null;
    this.init();
  }

  async init() {
    // Check if extension is enabled
    const result = await chrome.storage.sync.get(['extensionEnabled']);
    this.isEnabled = result.extensionEnabled !== false;
    
    if (this.isEnabled) {
      this.startObserver();
      this.processExistingQuestions();
    }
    
    // Listen for extension toggle
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.extensionEnabled) {
        this.isEnabled = changes.extensionEnabled.newValue;
        if (this.isEnabled) {
          this.startObserver();
          this.processExistingQuestions();
        } else {
          this.stopObserver();
          this.removeAllButtons();
        }
      }
    });
  }

  startObserver() {
    if (this.observerActive) return;
    
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
  }

  stopObserver() {
    if (this.observer) {
      this.observer.disconnect();
      this.observerActive = false;
    }
  }

  processExistingQuestions() {
    this.checkForQuestions(document.body);
  }

  checkForQuestions(container) {
    // Look for question panels based on the HTML structure
    const questionPanel = container.querySelector('[id^="question-wrapper-id"]');
    if (questionPanel) {
      this.processQuestion(questionPanel);
    }
  }

  async processQuestion(questionPanel) {
    try {
      const questionId = this.extractQuestionId(questionPanel);
      if (!questionId || this.processedQuestions.has(questionId)) {
        return;
      }

      this.processedQuestions.add(questionId);
      
      // Always add save button
      this.addSaveButtonInterval && clearInterval(this.addSaveButtonInterval);
      this.addSaveButtonInterval = setInterval(() => {
        this.addSaveButton(questionPanel);
      }, 1000);

      // Try to extract basic question data for checking saved answers
      const questionData = this.extractQuestionData(questionPanel);
      if (questionData) {
        // Check for saved answer and highlight if found
        await this.checkAndHighlightSavedAnswer(questionPanel, questionData);
      }
      
    } catch (error) {
      console.error('Error processing question:', error);
    }
  }

  extractQuestionId(questionPanel) {
    // Extract question ID from various possible attributes
    return questionPanel.id || 
           questionPanel.querySelector('[id^="question"]')?.id ||
           questionPanel.dataset.questionId;
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
    // Check if this question shows the correct answer
    return questionPanel.querySelector('.correct-answer-box, .default-match, [class*="correct"]') !== null;
  }

  addSaveButton(questionPanel) {
    // Check if save button already exists
    if (document.querySelector('.quiz-helper-save-btn')) {
      return;
    }

    // Find the footer or next button area
    const footer = document.querySelector('#practice-question-footer-pc, .question-footer, [class*="footer"]') ||
                   document.body;

    // Create save button
    const saveButton = document.createElement('button');
    saveButton.className = 'quiz-helper-save-btn';
    saveButton.textContent = '💾 Lưu đáp án';
    saveButton.type = 'button';
    
    saveButton.addEventListener('click', () => {
      this.saveCurrentAnswer(questionPanel, saveButton);
    });

    // Add button next to existing buttons
    const buttonContainer = footer.querySelector('.d-flex, .btn-group') || footer;
    if (buttonContainer) {
      buttonContainer.appendChild(saveButton);
    }
  }

  async saveCurrentAnswer(questionPanel, saveButton) {
    try {
      saveButton.textContent = '⏳ Đang lưu...';
      saveButton.disabled = true;

      // Extract question data when button is clicked
      const questionData = this.extractQuestionData(questionPanel);
      if (!questionData) {
        throw new Error('Không thể lấy thông tin câu hỏi');
      }

      // Extract correct answer
      const correctAnswer = this.extractCorrectAnswer(questionPanel);
      if (!correctAnswer) {
        throw new Error('Không tìm thấy đáp án đúng');
      }

      questionData.correctAnswer = correctAnswer;

      // Save to storage via background script
      const response = await chrome.runtime.sendMessage({
        action: 'saveAnswer',
        questionData
      });

      if (response?.success) {
        saveButton.textContent = '✅ Đã lưu';
        saveButton.classList.add('saved');
        setTimeout(() => {
          saveButton.textContent = '💾 Lưu đáp án';
          saveButton.disabled = false;
          saveButton.classList.remove('saved');
        }, 2000);
      } else {
        throw new Error('Lỗi khi lưu đáp án');
      }
    } catch (error) {
      console.error('Error saving answer:', error);
      saveButton.textContent = `❌ ${error.message}`;
      setTimeout(() => {
        saveButton.textContent = '💾 Lưu đáp án';
        saveButton.disabled = false;
      }, 3000);
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
      const response = await chrome.runtime.sendMessage({
        action: 'getAnswer',
        questionHash: questionData.questionHash
      });

      if (response?.found && response.data?.correctAnswer) {
        this.highlightCorrectAnswer(questionPanel, response.data.correctAnswer);
        this.showSuggestionNotice(questionPanel);
      }
    } catch (error) {
      console.error('Error checking saved answer:', error);
    }
  }

  highlightCorrectAnswer(questionPanel, correctAnswerText) {
    const radioInputs = questionPanel.querySelectorAll('input[type="radio"]');
    
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
          }
        }
      }
    });
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

console.log("Content script for Quiz Helper loaded.");

