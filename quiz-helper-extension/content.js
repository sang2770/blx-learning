(function() {
// Debug Logger Class
class DebugLogger {
  static async log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      data: data ? JSON.stringify(data) : null,
    };

    try {
      await chrome.runtime.sendMessage({
        action: "saveDebugLog",
        log: logEntry,
      });
    } catch (error) {
      
    }
  }

  static async info(message, data = null) {
    await this.log("info", message, data);
  }

  static async warning(message, data = null) {
    await this.log("warning", message, data);
  }

  static async error(message, data = null) {
    await this.log("error", message, data);
  }
}

class QuizHelper {
  constructor() {
    this.isEnabled = true;
    this.observerActive = false;
    this.addSaveButtonInterval = null;
    this.questionProcessedSet = new Set();
    this.questionProcessDomSet = new Set();
    this.highlightedQuestion = null;
    this.autoMode = false;
    this.autoDelay = 2000; // Default 2 seconds
    this.autoTimeout = null;
    this.wrongAnswerCount = 0; // Number of wrong answers to select
    this.wrongAnswersSelected = 0; // Track how many wrong answers selected
    this.questionCount = 0; // Track question count for wrong answer logic
    this.simulationMonitoringActive = false; // Track if simulation monitoring is active
    this.repeatMode = false; // Flag for auto repeat mode
    this.repeatTimeout = null; // Timeout ID for repeat process
    this.overriddenButtons = new WeakSet();
    this.injectedElements = new Set();
    this.suggestedElements = new Set();
    this.uiElements = {};
    this.shadowWrapper = null;
    this.shadowRoot = null;
    this.init();
  }

  async init() {
    // Check if extension is enabled
    const result = await chrome.storage.sync.get(["extensionEnabled", "autoDelay", "wrongAnswerCount"]);
    this.isEnabled = result.extensionEnabled !== false;
    this.autoDelay = result.autoDelay || 2000;
    this.wrongAnswerCount = result.wrongAnswerCount || 0;

    if (this.isEnabled) {
      this.startObserver();
      this.processExistingQuestions();
      this.createAutoButton();
    }

    // Add message listener for popup communication
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep channel open for async responses
    });

    // Listen for extension toggle
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.extensionEnabled) {
        this.isEnabled = changes.extensionEnabled.newValue;
        if (this.isEnabled) {
          this.startObserver();
          this.processExistingQuestions();
          this.createAutoButton();
        } else {
          this.stopObserver();
          this.removeAllButtons();
          this.stopAutoMode();
        }
      }
      if (changes.autoDelay) {
        this.autoDelay = changes.autoDelay.newValue;
        this.updateAutoButtonDelay();
      }
      if (changes.wrongAnswerCount) {
        this.wrongAnswerCount = changes.wrongAnswerCount.newValue;
        this.updateWrongAnswerButton();
      }
      if (changes.repeatMode) {
        this.repeatMode = changes.repeatMode.newValue;
        this.updateRepeatButton();
        if (!this.repeatMode) {
          this.stopRepeatMode();
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
            this.checkForQuestions();
          }
        });
      });
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
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
    this.checkForQuestions();
  }

  checkForQuestions() {
    this.processQuestion(document.body);
  }

  saveQuestionAnswer() {
    this.saveCurrentAnswer(document.body);
  }

  overrideNextButton() {
    const nextBtns = document.querySelectorAll(".ant-btn.ant-btn-primary");
    const nextBtn = [...nextBtns].find(btn => btn.textContent.trim() === "Tiếp");
    if (nextBtn) {
      // Check if save button already exists
      if (this.overriddenButtons.has(nextBtn)) {
        return;
      }
      this.overriddenButtons.add(nextBtn);
      nextBtn.removeEventListener(
        "click",
        this.saveQuestionAnswer.bind(this),
        true
      );
      nextBtn.addEventListener(
        "click",
        this.saveQuestionAnswer.bind(this),
        true
      );
    }
  }

  createAutoButton() {
    if (this.shadowWrapper) {
      this.shadowWrapper.remove();
    }
    this.shadowWrapper = document.createElement("div");
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const randClass = Array.from({length: 6}, () => letters[Math.floor(Math.random() * letters.length)]).join('');
    this.shadowWrapper.className = randClass;
    this.shadowWrapper.style.cssText = "position:fixed;bottom:20px;left:20px;z-index:2147483647;pointer-events:none;";
    document.body.appendChild(this.shadowWrapper);
    
    this.shadowRoot = this.shadowWrapper.attachShadow({ mode: "open" });
    
    const buttonContainer = document.createElement("div");
    buttonContainer.style.cssText = `
      pointer-events: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    `;

    const createBtn = (text, bg, fg) => {
      const btn = document.createElement("button");
      btn.textContent = text;
      btn.style.cssText = `
        padding: 12px 16px;
        background: ${bg};
        color: ${fg};
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        transition: all 0.3s ease;
        min-width: 140px;
        text-align: center;
      `;
      return btn;
    };

    const autoButton = createBtn(this.autoMode ? "⏹️ Dừng Auto" : "🤖 Auto làm bài", this.autoMode ? '#dc3545' : '#007bff', 'white');
    autoButton.addEventListener("click", () => {
      if (this.autoMode) this.stopAutoMode();
      else this.startAutoMode();
    });
    this.uiElements.autoBtn = autoButton;

    const configButton = createBtn(`⚙️ ${this.autoDelay / 1000}s`, '#6c757d', 'white');
    configButton.style.padding = "8px 12px";
    configButton.style.fontSize = "12px";
    configButton.addEventListener("click", () => this.showDelayConfig());
    this.uiElements.configBtn = configButton;

    const wrongAnswerButton = createBtn(`❌ ${this.wrongAnswerCount}`, this.wrongAnswerCount > 0 ? '#dc3545' : '#6c757d', 'white');
    wrongAnswerButton.style.padding = "8px 12px";
    wrongAnswerButton.style.fontSize = "12px";
    wrongAnswerButton.addEventListener("click", () => this.showWrongAnswerConfig());
    this.uiElements.wrongBtn = wrongAnswerButton;

    const repeatButton = createBtn(this.repeatMode ? "⏸️ Tạm dừng Repeat" : "🔄 Auto Repeat", this.repeatMode ? '#ff9800' : '#28a745', this.repeatMode ? 'black' : 'white');
    repeatButton.addEventListener("click", () => {
      if (this.repeatMode) this.stopRepeatMode();
      else this.startRepeatMode();
    });
    this.uiElements.repeatBtn = repeatButton;

    buttonContainer.appendChild(autoButton);
    buttonContainer.appendChild(configButton);
    buttonContainer.appendChild(wrongAnswerButton);
    buttonContainer.appendChild(repeatButton);
    this.shadowRoot.appendChild(buttonContainer);
  }

  showDelayConfig() {
    const newDelay = prompt(`Nhập thời gian delay (giây) giữa các lần làm bài:`, this.autoDelay / 1000);
    if (newDelay && !isNaN(newDelay) && newDelay > 0) {
      this.autoDelay = parseFloat(newDelay) * 1000;
      chrome.storage.sync.set({ autoDelay: this.autoDelay });
      this.updateAutoButtonDelay();
    }
  }

  showWrongAnswerConfig() {
    const newCount = prompt(`Nhập số câu trả lời sai (0-50):`, this.wrongAnswerCount);
    if (newCount !== null && !isNaN(newCount) && newCount >= 0 && newCount <= 50) {
      this.wrongAnswerCount = parseInt(newCount);
      chrome.storage.sync.set({ wrongAnswerCount: this.wrongAnswerCount });
      this.updateWrongAnswerButton();
    }
  }

  updateAutoButtonDelay() {
    if (this.uiElements.configBtn) {
      this.uiElements.configBtn.textContent = `⚙️ ${this.autoDelay / 1000}s`;
    }
  }

  updateWrongAnswerButton() {
    if (this.uiElements.wrongBtn) {
      this.uiElements.wrongBtn.textContent = `❌ ${this.wrongAnswerCount}`;
      this.uiElements.wrongBtn.style.background = this.wrongAnswerCount > 0 ? '#dc3545' : '#6c757d';
    }
  }

  updateAutoButton() {
    if (this.uiElements.autoBtn) {
      if (this.autoMode) {
        this.uiElements.autoBtn.textContent = "⏹️ Dừng Auto";
        this.uiElements.autoBtn.style.background = "#dc3545";
      } else {
        this.uiElements.autoBtn.textContent = "🤖 Auto làm bài";
        this.uiElements.autoBtn.style.background = "#007bff";
      }
    }
  }

  // Handle messages from popup
  handleMessage(request, sender, sendResponse) {
    switch (request.action) {
      case 'getAutoModeStatus':
        sendResponse({ autoMode: this.autoMode, repeatMode: this.repeatMode });
        break;
      case 'startAutoMode':
        this.startAutoMode();
        sendResponse({ success: true });
        break;
      case 'stopAutoMode':
        this.stopAutoMode();
        sendResponse({ success: true });
        break;
      case 'startRepeatMode':
        this.startRepeatMode();
        sendResponse({ success: true });
        break;
      case 'stopRepeatMode':
        this.stopRepeatMode();
        sendResponse({ success: true });
        break;
      case 'updateAutoDelay':
        this.autoDelay = request.delay;
        sendResponse({ success: true });
        break;
      default:
        sendResponse({ error: 'Unknown action' });
    }
  }

  async startAutoMode() {
    this.autoMode = true;
    this.questionCount = 0; // Reset question count when starting auto mode
    this.wrongAnswersSelected = 0; // Reset wrong answers counter
    if (!this.repeatMode) {
      this.updateAutoButton();
    }
    // Start auto process
    this.runAutoProcess();
    DebugLogger.info("Auto mode started");
  }

  finishExam() {
    // <div class="ant-spin-container">Kết thúc luyện thi</div>
    const finishBtn = document.querySelectorAll(".ant-spin-container");
    if (finishBtn.length > 0) {
      const btn = [...finishBtn].find(el => el.textContent.includes("Kết thúc luyện thi"));
      if (btn) {
        btn.click();
        setTimeout(() => {
          if (this.repeatMode) {
            this.scheduleNextRepeat();
          }
        }, 2000);
        return true;
      }
    } else {
      alert("Không tìm thấy nút kết thúc luyện thi. Vui lòng kết thúc thủ công để tiếp tục repeat.");
    }
    return false;
  }

  startExam() {
    // <button class="btn-primary btn btn-outline btn-small">Luyện tất cả (25)</button>
    const startBtn = document.querySelectorAll(".btn-primary.btn.btn-outline.btn-small");
    if (startBtn.length > 0) {
      const btn = [...startBtn].find(el => el.textContent.includes("Luyện tất cả"));
      if (btn) {
        btn.click();
        DebugLogger.info("Clicked start exam button" + (this.repeatMode ? " (repeat mode)" : ""));
        return true;
      }
    }
    return false;
  }

  async stopAutoMode() {
    this.autoMode = false;
    if (this.autoTimeout) {
      clearTimeout(this.autoTimeout);
      this.autoTimeout = null;
    }
    // Stop any active simulation monitoring
    this.stopSimulationMonitoring();
    await DebugLogger.info("Auto mode stopped");
    this.updateAutoButton();
    this.checkForRepeatCompletion();
  }

  // Repeat mode methods
  async startRepeatMode() {
    this.repeatMode = true;
    this.updateRepeatButton();
    // Start repeat process
    this.runRepeatProcess();
  }

  async stopRepeatMode() {
    this.repeatMode = false;
    if (this.repeatTimeout) {
      clearTimeout(this.repeatTimeout);
      this.repeatTimeout = null;
    }
    // Also stop auto mode if running
    if (this.autoMode) {
      await this.stopAutoMode();
    }
    this.updateRepeatButton();
  }

  async runRepeatProcess() {
    if (!this.repeatMode) return;

    try {
      this.startExam();
      // Start auto mode if not already running
      if (!this.autoMode) {
        await this.startAutoMode();
      }
    } catch (error) {
      // Continue repeat mode even if there's an error
      this.scheduleNextRepeat();
    }
  }

  checkForRepeatCompletion() {
    if (!this.repeatMode) return;
    // Check if there's no next button (quiz completed)
    const nextBtns = document.querySelectorAll(".ant-btn.ant-btn-primary");
    const nextBtn = [...nextBtns].find(btn => btn.textContent.trim() === "Tiếp");

    if (!nextBtn) {
      this.finishExam();
    }
  }

  scheduleNextRepeat() {
    if (!this.repeatMode) return;

    this.repeatTimeout = setTimeout(() => {
      if (this.repeatMode) {
        // Start new exam
        this.startExam();
        this.startAutoMode();
        // Wait a bit then start auto process again
        setTimeout(() => {
          if (this.repeatMode) {
            this.runRepeatProcess();
          }
        }, 2000);
      }
    }, 5000);
  }

  updateRepeatButton() {
    if (this.uiElements.repeatBtn) {
      if (this.repeatMode) {
        this.uiElements.repeatBtn.textContent = "⏸️ Tạm dừng Repeat";
        this.uiElements.repeatBtn.style.background = "#ff9800";
        this.uiElements.repeatBtn.style.color = "black";
      } else {
        this.uiElements.repeatBtn.textContent = "🔄 Auto Repeat";
        this.uiElements.repeatBtn.style.background = "#28a745";
        this.uiElements.repeatBtn.style.color = "white";
      }
    }
  }

  stopSimulationMonitoring() {
    this.simulationMonitoringActive = false;
  }

  async runAutoProcess() {
    if (!this.autoMode) return;
    try {
      // delay 2s
      // await new Promise(resolve => setTimeout(resolve, this.autoDelay));
      // First try to auto select answer
      const answerSelected = await this.autoSelectAnswer();

      if (answerSelected) {
        await DebugLogger.info("Answer auto-selected, waiting before clicking Next");
      } else {
        // No answer to select, just wait and continue
        await DebugLogger.info("No saved answer found, waiting before continuing");
        this.autoTimeout = setTimeout(() => {
          if (this.autoMode) {
            this.runAutoProcess();
          }
        }, this.autoDelay);
      }
      // wait 2s
      await new Promise(resolve => setTimeout(resolve, this.autoDelay));
      this.checkForRepeatCompletion();
    } catch (error) {
      await DebugLogger.error("Error in auto process: " + error.message);
      // Continue auto mode even if there's an error
      this.autoTimeout = setTimeout(() => {
        if (this.autoMode) {
          this.runAutoProcess();
        }
      }, this.autoDelay);
    }
  }

  next() {
    DebugLogger.info("Proceeding to next question");
    // Wait for configured delay then click Next
    this.autoTimeout = setTimeout(async () => {
      if (this.autoMode) {
        await this.autoClickNext();
      }
    }, this.autoDelay);
  }

  async autoSelectAnswer() {
    try {
      DebugLogger.info("Attempting to auto-select answer for current question");
      // Increment question count
      this.questionCount++;

      // Check if we have a saved answer for current question
      const questionData = this.extractQuestionData(document.body);
      if (!questionData) {
        DebugLogger.warning("Cannot extract question data for auto-selecting answer");
        return false;
      }

      const response = await chrome.runtime.sendMessage({
        action: "getAnswer",
        questionTitle: questionData.title,
        backupTitle: questionData.title.split("_")[1] || null,
      });

      DebugLogger.info("Checked for saved answer", {
        questionTitle: questionData.title,
        response: response
      });

      if (response?.found && response.data?.correctAnswer) {
        const correctAnswer = response.data.correctAnswer;

        // Determine if we should select wrong answer based on configuration
        const shouldSelectWrong = this.shouldSelectWrongAnswer();

        if (shouldSelectWrong) {
          this.wrongAnswersSelected++;
          if (questionData.type === "simulation") {
            return await this.autoSelectRandomSimulationAnswer();
          } else {
            return this.autoSelectWrongMultipleChoiceAnswer(correctAnswer);
          }
        } else {
          if (questionData.type === "simulation") {
            return this.autoSelectSimulationAnswer(correctAnswer);
          } else {
            return this.autoSelectMultipleChoiceAnswer(correctAnswer);
          }
        }
      } else {
        // No saved answer found - count as wrong answer
        this.wrongAnswersSelected++;

        if (questionData.type === "simulation") {
          return this.autoSelectRandomSimulationAnswer();
        } else {
          return this.autoSelectRandomMultipleChoiceAnswer();
        }
      }
    } catch (error) {
      await DebugLogger.error("Error in auto select answer: " + error.message);
      return false;
    }
  }

  // Determine if we should select wrong answer based on configuration
  shouldSelectWrongAnswer() {
    if (this.wrongAnswerCount === 0) return false;

    // Select wrong answer if we haven't reached the target count yet
    return this.wrongAnswersSelected < this.wrongAnswerCount;
  }

  autoSelectMultipleChoiceAnswer(correctAnswerText) {
    const radioInputs = document.querySelectorAll('input[type="radio"]');

    for (const radio of radioInputs) {
      const labelText = this.findAnswerLabel(radio);
      if (labelText && this.isAnswerMatch(labelText, correctAnswerText)) {
        // Select the radio button
        radio.click();
        this.next();
        return true;
      }
    }
    this.autoSelectRandomMultipleChoiceAnswer(); // Fallback to random selection if correct answer not found
    return false;
  }

  autoSelectSimulationAnswer(correctAnswer) {
    try {
      DebugLogger.info("Auto-selecting simulation answer with data", correctAnswer);
      // For simulation questions, we need to monitor video time and trigger space when in optimal range
      if (!correctAnswer || typeof correctAnswer !== "object") {
        DebugLogger.error("Invalid correct answer data for simulation");
        return false;
      }

      const startPos = correctAnswer.startPosition;
      const endPos = correctAnswer.endPosition;

      // Start monitoring video time
      this.startSimulationMonitoring(startPos, endPos);

      return true;
    } catch (error) {
      DebugLogger.error("Error auto-selecting simulation answer: " + error.message);
      this.next();
      return false;
    }
  }

  async startSimulationMonitoring(startPos, endPos) {
    // Stop any existing monitoring first
    this.stopSimulationMonitoring();
    // Wait 5s before starting to allow video to load and play
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Get video element
    const video = document.querySelector('video');
    if (!video) return;

    // Get total duration from UI
    const totalDuration = this.getVideoDuration();
    if (!totalDuration) {
      this.next();
      return;
    };


    // Calculate target time range in seconds
    const startTime = Math.max(0, (startPos / 100) * totalDuration + Math.random() * 1);
    const endTime = Math.min(totalDuration, (endPos / 100) * totalDuration - Math.random() * 1);

    // Set monitoring as active
    this.simulationMonitoringActive = true;
    // Monitor video time
    const checkTime = () => {
      // Stop if auto mode is disabled or monitoring is stopped
      if (!this.autoMode || !this.simulationMonitoringActive) {
        return;
      }

      const currentTime = video.currentTime;

      // Check if current time is in optimal range
      if (currentTime >= startTime && currentTime <= endTime) {
        DebugLogger.info("Optimal time reached, triggering space", {
          currentTime: currentTime.toFixed(2),
          targetRange: `${startTime.toFixed(2)}s - ${endTime.toFixed(2)}s`
        });

        this.triggerSimulationAction();
        this.stopSimulationMonitoring(); // Stop monitoring after triggering
        return;
      }

      // Continue monitoring if video is still playing and we haven't reached the range yet
      if (currentTime < endTime && !video.ended) {
        video.requestVideoFrameCallback(checkTime);
      } else {
        // Video paused or past end time, stop monitoring
        this.stopSimulationMonitoring();
      }
    };

    // Start monitoring
    video.requestVideoFrameCallback(checkTime);
  }

  triggerSimulationAction() {
    try {
      // Method 2: Trigger space key event
      const spaceEvent = new KeyboardEvent('keydown', {
        key: ' ',
        code: 'Space',
        keyCode: 32,
        which: 32,
        bubbles: true,
        cancelable: true
      });

      document.dispatchEvent(spaceEvent);

      // Also try keyup event
      const spaceUpEvent = new KeyboardEvent('keyup', {
        key: ' ',
        code: 'Space',
        keyCode: 32,
        which: 32,
        bubbles: true,
        cancelable: true
      });

      document.dispatchEvent(spaceUpEvent);

      this.next();
    } catch (error) {
      DebugLogger.error("Error triggering simulation action: " + error.message);
      this.next();
    }
  }

  // New method to intentionally select wrong answer
  autoSelectWrongMultipleChoiceAnswer(correctAnswerText) {
    const radioInputs = document.querySelectorAll('input[type="radio"]');
    const wrongOptions = [];

    // Find all wrong answers (not matching correct answer)
    for (const radio of radioInputs) {
      const labelText = this.findAnswerLabel(radio);
      if (labelText && !this.isAnswerMatch(labelText, correctAnswerText)) {
        wrongOptions.push({ radio, label: labelText });
      }
    }

    if (wrongOptions.length > 0) {
      // Select random wrong answer
      const randomWrong = wrongOptions[Math.floor(Math.random() * wrongOptions.length)];
      randomWrong.radio.click();
      this.next();
      return true;
    } else {
      // Fallback to correct answer if no wrong options found
      return this.autoSelectMultipleChoiceAnswer(correctAnswerText);
    }
  }

  // Random selection methods
  autoSelectRandomMultipleChoiceAnswer() {
    try {
      DebugLogger.info("No saved answer, selecting random answer for multiple choice question");
      const radioInputs = document.querySelectorAll('input[type="radio"]');
      if (radioInputs.length === 0) {
        DebugLogger.info("No radio inputs found for random selection");
        return false;
      }

      // Select a random radio button
      const randomIndex = Math.floor(Math.random() * radioInputs.length);
      const randomRadio = radioInputs[randomIndex];
      const labelText = this.findAnswerLabel(randomRadio);

      randomRadio.click();
      this.next();
      DebugLogger.info("Auto-selected random answer: " + (labelText || "Unknown"));
      return true;
    } catch (error) {
      DebugLogger.error("Error auto-selecting random multiple choice answer: " + error.message);
      this.next();
      return false;
    }
  }

  async autoSelectRandomSimulationAnswer() {
    try {
      // Generate random start and end positions (10% to 90% range)
      const startPos = Math.random() * 30 + 10; // 10-40%
      const endPos = startPos + Math.random() * 40 + 10; // startPos + 10-50%
      const finalEndPos = Math.min(endPos, 90); // Cap at 90%

      // Start monitoring for random range
      await this.startSimulationMonitoring(startPos, finalEndPos);
      return true;
    } catch (error) {
      DebugLogger.error("Error auto-selecting random simulation answer: " + error.message);
      return false;
    }
  }

  async autoClickNext() {
    try {
      const nextBtns = document.querySelectorAll(".ant-btn.ant-btn-primary");
      const nextBtn = [...nextBtns].find(btn => btn.textContent.trim() === "Tiếp");
      if (!nextBtn) {
        // No Next button found - quiz completed
        await this.stopAutoMode();
        return;
      }

      // // Trigger save before clicking
      // await this.saveCurrentAnswer(document.body);

      // Click the Next button
      nextBtn.click();

      // Wait a moment then continue auto process for next question
      setTimeout(() => {
        if (this.autoMode) {
          this.runAutoProcess();
        }
      }, 1000); // Short delay to wait for page transition
    } catch (error) {
      await DebugLogger.error("Error auto-clicking Next: " + error.message);
      // Continue auto mode
      this.autoTimeout = setTimeout(() => {
        if (this.autoMode) {
          this.runAutoProcess();
        }
      }, this.autoDelay);
    }
  }

  async processQuestion(questionPanel) {
    try {
      const questionId = this.extractQuestionId(questionPanel);
      if (!questionId) {
        return;
      }
      // Always add save button
      this.addSaveButtonInterval && clearInterval(this.addSaveButtonInterval);
      this.addSaveButtonInterval = setInterval(() => {
        this.overrideNextButton();
      }, 1000);

      // Try to extract basic question data for checking saved answers
      const questionData = this.extractQuestionData(questionPanel);
      if (questionData) {
        // Check for saved answer and highlight if found
        await this.checkAndHighlightSavedAnswer(questionPanel, questionData);
      }
    } catch (error) {
      
    }
  }

  extractQuestionId(questionPanel) {
    // Extract question ID from various possible attributes
    return (
      questionPanel.id ||
      questionPanel.querySelector('[id^="question"]')?.id ||
      questionPanel.dataset.questionId
    );
  }

  extractQuestionData(questionPanel) {
    try {
      // Check if this is a simulation question
      const isSimulationQuestion = this.isSimulationQuestion();

      // Extract question text
      const questionText = this.extractQuestionText(questionPanel);
      if (!questionText) return null;

      const questionData = {
        title: questionText,
        type: isSimulationQuestion ? "simulation" : "multiple_choice",
      };

      // For simulation questions, extract additional data
      if (isSimulationQuestion) {
        const simulationData = this.extractSimulationData(questionPanel);
        if (simulationData) {
          questionData.simulationData = simulationData;
        }
      }

      return questionData;
    } catch (error) {
      
      return null;
    }
  }

  extractQuestionText(questionPanel) {
    const id = this.extractQuestionId(questionPanel);
    // Try multiple selectors to find question text
    const selectors = [
      ".question-content",
      ".question-text",
      ".content-display",
      '[class*="question"]',
    ];

    for (const selector of selectors) {
      const element = questionPanel.querySelector(selector);
      if (element) {
        const text = element.textContent?.trim();
        if (text && text.length > 10) {
          return id + "_" + text;
        }
      }
    }

    return null;
  }

  // New method to check if current page is simulation question
  isSimulationQuestion() {
    const nameElement = document.querySelector(".learn-name__text");
    if (nameElement) {
      const text = nameElement.textContent?.toLowerCase() || "";
      return text.includes("mô phỏng");
    }
    return false;
  }

  // New method to extract simulation-specific data
  extractSimulationData(questionPanel) {
    try {
      const trackingBar = questionPanel.querySelector(
        ".media-audio-tracking-bar-line--invisible"
      );
      if (!trackingBar) return null;

      const marks = trackingBar.querySelectorAll(
        ".media-audio-tracking-bar__mark:not(.media-audio-tracking-bar__mark--no-highlight)"
      );
      if (marks.length === 0) return null;

      // Extract positions and widths from style attribute
      const positions = [];
      let totalWidth = 0;

      marks.forEach((mark) => {
        const style = mark.getAttribute("style") || "";
        const leftMatch = style.match(/left:\s*([\d.]+)%/);
        const paddingRightMatch = style.match(/padding-right:\s*([\d.]+)%/);

        if (leftMatch) {
          const leftPos = parseFloat(leftMatch[1]);
          const paddingRight = paddingRightMatch ? parseFloat(paddingRightMatch[1]) : 0;

          positions.push({
            left: leftPos,
            paddingRight: paddingRight,
            right: leftPos + paddingRight
          });

          totalWidth += paddingRight;
        }
      });

      if (positions.length === 0) return null;

      // Calculate start and end of optimal range more accurately
      const startPosition = Math.min(...positions.map(p => p.left));
      const endPosition = Math.max(...positions.map(p => p.right));

      return {
        startPosition,
        endPosition,
        totalMarks: positions.length,
        totalWidth,
        positions,
      };
    } catch (error) {
      
      return null;
    }
  }

  extractQuestionId() {
    // Example: extract data-question-id attributes
    const questionElement = document.querySelector(
      'div[id*="question-wrapper-id-"]'
    );
    return questionElement?.id ?? null;
  }

  extractAnswers(questionPanel) {
    const answers = [];

    // Look for radio buttons and their labels
    const radioInputs = questionPanel.querySelectorAll('input[type="radio"]');

    radioInputs.forEach((radio) => {
      const label = this.findAnswerLabel(radio);
      if (label) {
        answers.push({
          text: label.trim(),
          value: radio.value,
        });
      }
    });

    return answers;
  }

  findAnswerLabel(radioInput) {
    // Try to find the associated label text
    const parent =
      radioInput.closest(".mc-text-question__radio-answer") ||
      radioInput.closest('[class*="answer"]') ||
      radioInput.parentElement;

    if (parent) {
      const label = parent.querySelector("label, .content-display");
      if (label) {
        return label.textContent?.trim();
      }
    }

    return null;
  }

  hasCorrectAnswer(questionPanel) {
    // Check if this question shows the correct answer
    return (
      questionPanel.querySelector(
        '.correct-answer-box, .default-match, [class*="correct"]'
      ) !== null
    );
  }

  async saveCurrentAnswer(questionPanel) {
    try {
      // Extract question data when button is clicked
      const questionData = this.extractQuestionData(questionPanel);
      if (!questionData) {
        throw new Error("Không thể lấy thông tin câu hỏi");
      }

      if (this.questionProcessedSet.has(questionData.title)) {
        return;
      }
      this.questionProcessedSet.add(questionData.title);

      // Extract correct answer
      const correctAnswer = this.extractCorrectAnswer();
      if (!correctAnswer) {
        return;
      }

      // Prepare data for saving with unified format
      const saveData = {
        title: questionData.title,
        type: questionData.type,
        correctAnswer: correctAnswer,
      };

      // Save to storage via background script
      const response = await chrome.runtime.sendMessage({
        action: "saveAnswer",
        questionData: saveData,
      });

      if (response?.success) {
        DebugLogger.info("Answer saved successfully", {
          questionTitle: questionData.title,
        });
      } else {
        throw new Error("Lỗi khi lưu đáp án");
      }
    } catch (error) {
      await DebugLogger.error("Error saving answer" + error.message);
      
    }
  }

  extractCorrectAnswer() {
    // Check if this is simulation question first
    if (this.isSimulationQuestion()) {
      return this.extractSimulationAnswer();
    }

    // Look for the correct answer in various ways (existing logic for multiple choice)
    const correctAnswerBox = document.querySelector(".correct-answer-box");
    if (correctAnswerBox) {
      const text = correctAnswerBox.textContent;
      // Extract answer after "Câu trả lời chính xác là:"
      const match = text.match(/Câu trả lời chính xác là:\s*(.+)/);
      if (match) {
        return match[1].trim();
      }
    }

    // Look for selected correct answer
    const correctOption = document.querySelector(
      '.default-match input[type="radio"]'
    );
    if (correctOption) {
      const label = this.findAnswerLabel(correctOption);
      if (label) {
        return label;
      }
    }

    return null;
  }

  // New method to extract simulation answer
  extractSimulationAnswer() {
    try {
      // Get simulation data to determine optimal range
      const simulationData = this.extractSimulationData(document.body);
      if (simulationData) {
        return {
          startPosition: simulationData.startPosition,
          endPosition: simulationData.endPosition,
        };
      }

      return null;
    } catch (error) {
      
      return null;
    }
  }

  // Helper method to get video duration
  getVideoDuration() {
    try {
      const durationElement = document.querySelector(
        ".d-flex-center-middle.border"
      );
      if (durationElement) {
        const text = durationElement.textContent || "";
        const parts = text.split("/");
        if (parts.length === 2) {
          return parseFloat(parts[1].trim());
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async checkAndHighlightSavedAnswer(questionPanel, questionData) {
    try {
      // Prevent multiple calls for the same question
      const questionKey = questionData.title;
      if (this.highlightedQuestion === questionKey) {
        return;
      }
      
      // Clear previous injections Since we're highlighting a new question
      if (this.injectedElements) {
        this.injectedElements.forEach(el => el.remove && el.remove());
        this.injectedElements.clear();
      }
      if (this.suggestedElements) {
        this.suggestedElements.forEach(el => {
          if (el.style) el.style.background = '';
        });
        this.suggestedElements.clear();
      }
      const response = await chrome.runtime.sendMessage({
        action: "getAnswer",
        questionTitle: questionData.title,
        backupTitle: questionData.title.split("_")[1] || null,
      });
      DebugLogger.info("Checking for saved answer to highlight", {
        questionTitle: questionData.title,
        response: response
      });

      if (response?.found && response.data?.correctAnswer) {
        // Mark as highlighted to prevent duplicates
        this.highlightedQuestion = questionKey;

        if (questionData.type === "simulation") {
          this.highlightSimulationAnswer(
            questionPanel,
            response.data.correctAnswer
          );
        } else {
          this.highlightCorrectAnswer(
            questionPanel,
            response.data.correctAnswer
          );
        }
      }
    } catch (error) {
      
    }
  }

  // New method to highlight simulation answers
  highlightSimulationAnswer(questionPanel, correctAnswer) {
    try {
      // For simulation questions, correctAnswer contains startPosition and endPosition
      if (!correctAnswer || typeof correctAnswer !== "object") return;

      // Highlight duplicates check removed as we clear new questions
      // Show optimal timing information
      if (true) {
        const noticeContainer = this.createSimulationNotice(correctAnswer);

        // Try to insert notice near video controls
        const videoActions = questionPanel.querySelector(
          ".question-video__actions"
        );
        if (videoActions && noticeContainer) {
          videoActions.insertBefore(noticeContainer, videoActions.firstChild);
        }
      }

      // Highlight the tracking bar with optimal range
      if (
        correctAnswer.startPosition &&
        correctAnswer.endPosition
      ) {
        this.highlightTrackingBar(questionPanel, {
          start: correctAnswer.startPosition,
          end: correctAnswer.endPosition,
        });
      }
    } catch (error) {
      
    }
  }

  // Create notice for simulation questions
  createSimulationNotice(answerData) {
    const notice = document.createElement("div");
    notice.style.cssText = `
      background: #e6f7ff;
      border: 1px solid #91d5ff;
      border-radius: 4px;
      padding: 10px;
      margin-bottom: 10px;
      font-size: 14px;
    `;

    let htmlContent = "💡 <strong>Gợi ý từ lần trước:</strong><br>";

    if (answerData.startPosition && answerData.endPosition) {
      const totalDuration = this.getVideoDuration() || 30;
      const startTime = ((answerData.startPosition / 100) * totalDuration).toFixed(2);
      const endTime = ((answerData.endPosition / 100) * totalDuration).toFixed(2);
      htmlContent += `Vùng tối ưu: <strong>${startTime}s - ${endTime}s</strong>`;
      htmlContent += `<br><small>Khu vực: ${answerData.startPosition.toFixed(1)}% - ${answerData.endPosition.toFixed(1)}%</small>`;
    }

    notice.innerHTML = htmlContent;
    this.injectedElements.add(notice);
    return notice;
  }

  // Highlight tracking bar for simulation questions
  highlightTrackingBar(questionPanel, optimalRange) {
    try {
      const trackingBar = questionPanel.querySelector(".media-audio-tracking-bar-line");
      if (!trackingBar) return;

      const startPos = optimalRange.start;
      const endPos = optimalRange.end;
      const width = endPos - startPos;

      const highlight = document.createElement("div");
      highlight.style.cssText = `
        position: absolute;
        height: 15px;
        background: rgba(0, 255, 0, 0.6);
        border: 1px solid #00ff00;
        border-radius: 2px;
        pointer-events: none;
        left: ${startPos}%;
        width: ${width}%;
        top: -2px;
        z-index: 10;
      `;

      if (trackingBar.style.position !== "relative") {
        trackingBar.style.position = "relative";
      }

      trackingBar.appendChild(highlight);
      this.injectedElements.add(highlight);
    } catch (error) {
    }
  }

  highlightCorrectAnswer(questionPanel, correctAnswerText) {
    const radioInputs = questionPanel.querySelectorAll('input[type="radio"]');

    radioInputs.forEach((radio) => {
      const labelText = this.findAnswerLabel(radio);
      if (labelText && this.isAnswerMatch(labelText, correctAnswerText)) {
        const answerContainer = radio.closest(".mc-text-question__radio-answer") ||
          radio.closest('[class*="answer"]') || radio.parentElement;

        if (answerContainer && !this.suggestedElements.has(answerContainer)) {
          this.suggestedElements.add(answerContainer);
          // Instead of adding a recognizable class, we add an inline style
          answerContainer.style.background = 'rgba(144, 238, 144, 0.3)';

          const icon = document.createElement("span");
          icon.textContent = "💡";
          icon.title = "Đáp án được gợi ý";
          answerContainer.appendChild(icon);
          this.injectedElements.add(icon);
        }
      }
    });
  }

  isAnswerMatch(labelText, correctAnswerText) {
    // Normalize text for comparison
    const normalize = (text) =>
      text
        .toLowerCase()
        .replace(/^\d+[-.)]\s*/, "") // Remove numbering
        .replace(/\s+/g, " ")
        .trim();

    return normalize(labelText) === normalize(correctAnswerText);
  }

  showSuggestionNotice(questionPanel) {
    const header = questionPanel.querySelector(".question-panel__header") ||
      questionPanel.querySelector('[class*="header"]') || questionPanel.firstElementChild;

    if (header) {
      const notice = document.createElement("div");
      notice.innerHTML = "💡 <strong>Gợi ý:</strong> Đáp án được đánh dấu dựa trên lần trả lời trước";
      header.appendChild(notice);
      this.injectedElements.add(notice);
    }
  }

  removeAllButtons() {
    this.highlightedQuestion = null;
    this.stopAutoMode();
    this.stopRepeatMode();

    if (this.shadowWrapper) {
      this.shadowWrapper.remove();
      this.shadowWrapper = null;
    }

    if (this.injectedElements) {
      this.injectedElements.forEach(el => el.remove && el.remove());
      this.injectedElements.clear();
    }
    if (this.suggestedElements) {
      this.suggestedElements.forEach(el => {
        if (el.style) el.style.background = '';
      });
      this.suggestedElements.clear();
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    new QuizHelper();
  });
} else {
  new QuizHelper();
}



})();