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
      console.error("Failed to save debug log:", error);
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
    this.highlightedQuestion = null;
    this.autoMode = false;
    this.autoDelay = 2000; // Default 2 seconds
    this.autoTimeout = null;
    this.wrongAnswerCount = 0; // Number of wrong answers to select
    this.wrongAnswersSelected = 0; // Track how many wrong answers selected
    this.questionCount = 0; // Track question count for wrong answer logic
    this.simulationMonitoringActive = false; // Track if simulation monitoring is active
    this.simulationAnimationId = null; // Store animation frame ID for cleanup
    this.init();
  }

  async init() {
    await DebugLogger.info("QuizHelper initializing...", {
      url: window.location.href,
    });

    // Check if extension is enabled
    const result = await chrome.storage.sync.get(["extensionEnabled", "autoDelay", "wrongAnswerCount"]);
    this.isEnabled = result.extensionEnabled !== false;
    this.autoDelay = result.autoDelay || 2000;
    this.wrongAnswerCount = result.wrongAnswerCount || 0;

    await DebugLogger.info(`Extension enabled status: ${this.isEnabled}`);

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
        DebugLogger.info(
          `Extension toggled: ${this.isEnabled ? "enabled" : "disabled"}`
        );
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
        DebugLogger.info(`Auto delay updated to: ${this.autoDelay}ms`);
        this.updateAutoButtonDelay();
      }
      if (changes.wrongAnswerCount) {
        this.wrongAnswerCount = changes.wrongAnswerCount.newValue;
        DebugLogger.info(`Wrong answer count updated to: ${this.wrongAnswerCount}`);
        this.updateWrongAnswerButton();
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
    const nextBtn = document.querySelector(
      "#practice-question-footer-pc .btn-primary"
    );
    if (nextBtn) {
      // Check if save button already exists
      if (nextBtn.classList.contains("quiz-helper-overridden")) {
        return;
      }
      nextBtn.classList.add("quiz-helper-overridden");
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
    // Remove existing auto button to avoid duplicates
    const existingButton = document.querySelector(".quiz-helper-auto-btn");
    const existingConfig = document.querySelector(".quiz-helper-config-btn");
    if (existingButton) existingButton.remove();
    if (existingConfig) existingConfig.remove();

    // Create auto button container
    const buttonContainer = document.createElement("div");
    buttonContainer.className = "quiz-helper-auto-container";
    buttonContainer.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    `;

    // Auto button
    const autoButton = document.createElement("button");
    autoButton.className = "quiz-helper-auto-btn";
    autoButton.textContent = this.autoMode ? "⏹️ Dừng Auto" : "🤖 Auto làm bài";
    autoButton.style.cssText = `
      padding: 12px 16px;
      background: ${this.autoMode ? '#dc3545' : '#007bff'};
      color: white;
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

    autoButton.addEventListener("click", () => {
      if (this.autoMode) {
        this.stopAutoMode();
      } else {
        this.startAutoMode();
      }
    });

    // Config delay button
    const configButton = document.createElement("button");
    configButton.className = "quiz-helper-config-btn";
    configButton.textContent = `⚙️ ${this.autoDelay / 1000}s`;
    configButton.style.cssText = `
      padding: 8px 12px;
      background: #6c757d;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      transition: all 0.3s ease;
      text-align: center;
    `;

    configButton.addEventListener("click", () => {
      this.showDelayConfig();
    });

    // Wrong answer config button
    const wrongAnswerButton = document.createElement("button");
    wrongAnswerButton.className = "quiz-helper-wrong-btn";
    wrongAnswerButton.textContent = `❌ ${this.wrongAnswerCount}`;
    wrongAnswerButton.style.cssText = `
      padding: 8px 12px;
      background: ${this.wrongAnswerCount > 0 ? '#dc3545' : '#6c757d'};
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      transition: all 0.3s ease;
      text-align: center;
    `;

    wrongAnswerButton.addEventListener("click", () => {
      this.showWrongAnswerConfig();
    });

    // Add hover effects
    autoButton.addEventListener("mouseenter", () => {
      autoButton.style.transform = "translateY(-2px)";
      autoButton.style.boxShadow = "0 6px 16px rgba(0,0,0,0.3)";
    });
    autoButton.addEventListener("mouseleave", () => {
      autoButton.style.transform = "translateY(0)";
      autoButton.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
    });

    configButton.addEventListener("mouseenter", () => {
      configButton.style.transform = "translateY(-1px)";
    });
    configButton.addEventListener("mouseleave", () => {
      configButton.style.transform = "translateY(0)";
    });

    wrongAnswerButton.addEventListener("mouseenter", () => {
      wrongAnswerButton.style.transform = "translateY(-1px)";
    });
    wrongAnswerButton.addEventListener("mouseleave", () => {
      wrongAnswerButton.style.transform = "translateY(0)";
    });

    buttonContainer.appendChild(autoButton);
    buttonContainer.appendChild(configButton);
    buttonContainer.appendChild(wrongAnswerButton);
    document.body.appendChild(buttonContainer);
  }

  showDelayConfig() {
    const newDelay = prompt(`Nhập thời gian delay (giây) giữa các lần làm bài:`, this.autoDelay / 1000);
    if (newDelay && !isNaN(newDelay) && newDelay > 0) {
      this.autoDelay = parseFloat(newDelay) * 1000;
      chrome.storage.sync.set({ autoDelay: this.autoDelay });
      this.updateAutoButtonDelay();
      DebugLogger.info(`Auto delay configured to: ${this.autoDelay}ms`);
    }
  }

  showWrongAnswerConfig() {
    const newCount = prompt(`Nhập số câu trả lời sai (0-50):`, this.wrongAnswerCount);
    if (newCount !== null && !isNaN(newCount) && newCount >= 0 && newCount <= 50) {
      this.wrongAnswerCount = parseInt(newCount);
      chrome.storage.sync.set({ wrongAnswerCount: this.wrongAnswerCount });
      this.updateWrongAnswerButton();
      DebugLogger.info(`Wrong answer count configured to: ${this.wrongAnswerCount}`);
    }
  }

  updateAutoButtonDelay() {
    const configBtn = document.querySelector(".quiz-helper-config-btn");
    if (configBtn) {
      configBtn.textContent = `⚙️ ${this.autoDelay / 1000}s`;
    }
  }

  updateWrongAnswerButton() {
    const wrongBtn = document.querySelector(".quiz-helper-wrong-btn");
    if (wrongBtn) {
      wrongBtn.textContent = `❌ ${this.wrongAnswerCount}`;
      wrongBtn.style.background = this.wrongAnswerCount > 0 ? '#dc3545' : '#6c757d';
    }
  }

  updateAutoButton() {
    const autoBtn = document.querySelector(".quiz-helper-auto-btn");
    if (autoBtn) {
      if (this.autoMode) {
        autoBtn.textContent = "⏹️ Dừng Auto";
        autoBtn.style.background = "#dc3545";
      } else {
        autoBtn.textContent = "🤖 Auto làm bài";
        autoBtn.style.background = "#007bff";
      }
    }
  }

  // Handle messages from popup
  handleMessage(request, sender, sendResponse) {
    switch (request.action) {
      case 'getAutoModeStatus':
        sendResponse({ autoMode: this.autoMode });
        break;
      case 'startAutoMode':
        this.startAutoMode();
        sendResponse({ success: true });
        break;
      case 'stopAutoMode':
        this.stopAutoMode();
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
    await DebugLogger.info("Auto mode started");
    this.updateAutoButton();
    // Start auto process
    this.runAutoProcess();
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
  }

  stopSimulationMonitoring() {
    if (this.simulationAnimationId) {
      cancelAnimationFrame(this.simulationAnimationId);
      this.simulationAnimationId = null;
    }
    this.simulationMonitoringActive = false;
    DebugLogger.info("Simulation monitoring stopped");
  }

  async runAutoProcess() {
    if (!this.autoMode) return;
    try {
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
    // Wait for configured delay then click Next
    this.autoTimeout = setTimeout(async () => {
      if (this.autoMode) {
        await this.autoClickNext();
      }
    }, this.autoDelay);
  }

  async autoSelectAnswer() {
    try {
      // Increment question count
      this.questionCount++;

      // Check if we have a saved answer for current question
      const questionData = this.extractQuestionData(document.body);
      if (!questionData) {
        return false;
      }

      const response = await chrome.runtime.sendMessage({
        action: "getAnswer",
        questionTitle: questionData.title,
        backupTitle: questionData.title.split("_")[1] || null,
      });

      if (response?.found && response.data?.correctAnswer) {
        const correctAnswer = response.data.correctAnswer;

        // Determine if we should select wrong answer based on configuration
        const shouldSelectWrong = this.shouldSelectWrongAnswer();

        if (shouldSelectWrong) {
          this.wrongAnswersSelected++;
          await DebugLogger.info(`Intentionally selecting wrong answer (${this.wrongAnswersSelected}/${this.wrongAnswerCount})`);
          if (questionData.type === "simulation") {
            return this.autoSelectRandomSimulationAnswer();
          } else {
            return this.autoSelectWrongMultipleChoiceAnswer(correctAnswer);
          }
        } else {
          await DebugLogger.info("Found saved answer, auto-selecting correct answer");
          if (questionData.type === "simulation") {
            return this.autoSelectSimulationAnswer(correctAnswer);
          } else {
            return this.autoSelectMultipleChoiceAnswer(correctAnswer);
          }
        }
      } else {
        // No saved answer found - count as wrong answer
        this.wrongAnswersSelected++;
        await DebugLogger.info(`No saved answer found, selecting randomly (counts as wrong: ${this.wrongAnswersSelected}/${this.wrongAnswerCount})`);

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
    DebugLogger.info("Auto-selecting multiple choice answer: " + correctAnswerText);
    const radioInputs = document.querySelectorAll('input[type="radio"]');

    for (const radio of radioInputs) {
      const labelText = this.findAnswerLabel(radio);
      if (labelText && this.isAnswerMatch(labelText, correctAnswerText)) {
        // Select the radio button
        radio.click();
        this.next();
        DebugLogger.info("Auto-selected answer: " + labelText);
        return true;
      }
    }
    this.next();
    return false;
  }

  autoSelectSimulationAnswer(correctAnswer) {
    try {
      // For simulation questions, we need to monitor video time and trigger space when in optimal range
      if (!correctAnswer || typeof correctAnswer !== "object") {
        DebugLogger.error("Invalid correct answer data for simulation");
        return false;
      }

      const startPos = correctAnswer.startPosition;
      const endPos = correctAnswer.endPosition;

      // Start monitoring video time
      this.startSimulationMonitoring(startPos, endPos);

      DebugLogger.info("Started monitoring simulation for optimal range", { startPos, endPos });
      return true;
    } catch (error) {
      DebugLogger.error("Error auto-selecting simulation answer: " + error.message);
      return false;
    }
  }

  startSimulationMonitoring(startPos, endPos) {
    // Stop any existing monitoring first
    this.stopSimulationMonitoring();

    // Get video element
    const video = document.querySelector('video');
    if (!video) return;

    // Get total duration from UI
    const totalDuration = this.getVideoDuration();
    if (!totalDuration) return;

    // Calculate target time range in seconds
    const startTime = (startPos / 100) * totalDuration + Math.random() * 2; // Add small random offset
    const endTime = (endPos / 100) * totalDuration - Math.random() * 2; // Subtract small random offset

    DebugLogger.info("Simulation monitoring setup", {
      totalDuration,
      startTime: startTime.toFixed(2),
      endTime: endTime.toFixed(2)
    });

    // Set monitoring as active
    this.simulationMonitoringActive = true;

    // Monitor video time
    const checkTime = () => {
      // Stop if auto mode is disabled or monitoring is stopped
      if (!this.autoMode || !this.simulationMonitoringActive) {
        this.simulationAnimationId = null;
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
      if (!video.paused && currentTime < endTime) {
        this.simulationAnimationId = requestAnimationFrame(checkTime);
      } else {
        // Video paused or past end time, stop monitoring
        this.stopSimulationMonitoring();
      }
    };

    // Start monitoring
    this.simulationAnimationId = requestAnimationFrame(checkTime);
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

      DebugLogger.info("Triggered space key events");
      this.next();
    } catch (error) {
      DebugLogger.error("Error triggering simulation action: " + error.message);
      this.next();
    }
  }

  // New method to intentionally select wrong answer
  autoSelectWrongMultipleChoiceAnswer(correctAnswerText) {
    DebugLogger.info("Intentionally selecting wrong answer, correct is: " + correctAnswerText);
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
      DebugLogger.info("Auto-selected wrong answer: " + randomWrong.label);
      return true;
    } else {
      // Fallback to correct answer if no wrong options found
      return this.autoSelectMultipleChoiceAnswer(correctAnswerText);
    }
  }

  // Random selection methods
  autoSelectRandomMultipleChoiceAnswer() {
    try {
      const radioInputs = document.querySelectorAll('input[type="radio"]');
      if (radioInputs.length === 0) {
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

  autoSelectRandomSimulationAnswer() {
    DebugLogger.info("Auto-selecting random simulation answer");
    try {
      // Generate random start and end positions (10% to 90% range)
      const startPos = Math.random() * 30 + 10; // 10-40%
      const endPos = startPos + Math.random() * 40 + 10; // startPos + 10-50%
      const finalEndPos = Math.min(endPos, 90); // Cap at 90%

      // Start monitoring for random range
      this.startSimulationMonitoring(startPos, finalEndPos);
      return true;
    } catch (error) {
      DebugLogger.error("Error auto-selecting random simulation answer: " + error.message);
      return false;
    }
  }

  async autoClickNext() {
    try {
      const nextBtn = document.querySelector("#practice-question-footer-pc .btn-primary");
      if (!nextBtn) {
        // No Next button found - quiz completed
        await DebugLogger.info("No Next button found - quiz completed, stopping auto mode");
        await this.stopAutoMode();
        return;
      }

      // Trigger save before clicking
      await this.saveCurrentAnswer(document.body);

      // Click the Next button
      nextBtn.click();
      await DebugLogger.info("Auto-clicked Next button");

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
      await DebugLogger.info(`Processing question: ${questionId}`);
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
      console.error("Error processing question:", error);
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
      console.error("Error extracting question data:", error);
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
      console.error("Error extracting simulation data:", error);
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
      // DebugLogger.info("Extracted question data for saving", { questionData });
      if (!questionData) {
        DebugLogger.warning(
          "Cannot extract question data on save button click"
        );
        throw new Error("Không thể lấy thông tin câu hỏi");
      }

      if (this.questionProcessedSet.has(questionData.title)) {
        await DebugLogger.info("Question already processed, skipping save", {
          questionTitle: questionData.title,
        });
        return;
      }
      this.questionProcessedSet.add(questionData.title);

      // Extract correct answer
      const correctAnswer = this.extractCorrectAnswer();
      if (!correctAnswer) {
        DebugLogger.warning("Cannot find correct answer to save", {
          questionTitle: questionData.title,
        });
        return;
      }

      // Prepare data for saving with unified format
      const saveData = {
        title: questionData.title,
        type: questionData.type,
        correctAnswer: correctAnswer,
      };

      await DebugLogger.info("Saving answer for question", {
        questionTitle: questionData.title,
        type: questionData.type,
        correctAnswer,
      });

      // Save to storage via background script
      const response = await chrome.runtime.sendMessage({
        action: "saveAnswer",
        questionData: saveData,
      });

      if (response?.success) {
        await DebugLogger.info("Answer saved successfully", {
          questionTitle: questionData.title,
        });
      } else {
        throw new Error("Lỗi khi lưu đáp án");
      }
    } catch (error) {
      await DebugLogger.error("Error saving answer" + error.message);
      console.error("Error saving answer:", error);
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
      DebugLogger.info(
        "Extracted correct answer from correct-answer-box" + text
      );
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
      console.error("Error extracting simulation answer:", error);
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

      const response = await chrome.runtime.sendMessage({
        action: "getAnswer",
        questionTitle: questionData.title,
        backupTitle: questionData.title.split("_")[1] || null,
      });

      DebugLogger.info("Checked for saved answer", {
        questionTitle: questionData.title,
        response,
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
      console.error("Error checking saved answer:", error);
    }
  }

  // New method to highlight simulation answers
  highlightSimulationAnswer(questionPanel, correctAnswer) {
    try {
      // For simulation questions, correctAnswer contains startPosition and endPosition
      if (!correctAnswer || typeof correctAnswer !== "object") return;

      // Check if already highlighted to avoid duplicates
      const existingHighlight = questionPanel.querySelector(
        ".quiz-helper-tracking-highlight"
      );
      const existingNotice = questionPanel.querySelector(
        ".quiz-helper-simulation-notice"
      );

      if (existingHighlight && existingNotice) {
        return; // Already highlighted, skip
      }

      // Show optimal timing information
      if (!existingNotice) {
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
        !existingHighlight &&
        correctAnswer.startPosition &&
        correctAnswer.endPosition
      ) {
        this.highlightTrackingBar(questionPanel, {
          start: correctAnswer.startPosition,
          end: correctAnswer.endPosition,
        });
      }
    } catch (error) {
      console.error("Error highlighting simulation answer:", error);
    }
  }

  // Create notice for simulation questions
  createSimulationNotice(answerData) {
    // Remove existing notices first to avoid duplicates
    const existingNotices = document.querySelectorAll(
      ".quiz-helper-simulation-notice"
    );
    existingNotices.forEach((el) => el.remove());

    const notice = document.createElement("div");
    notice.className = "quiz-helper-simulation-notice";
    notice.style.cssText = `
      background: #e6f7ff;
      border: 1px solid #91d5ff;
      border-radius: 4px;
      padding: 10px;
      margin-bottom: 10px;
      font-size: 14px;
    `;

    let content = "💡 <strong>Gợi ý từ lần trước:</strong><br>";

    if (answerData.startPosition && answerData.endPosition) {
      const totalDuration = this.getVideoDuration() || 30;
      const startTime = (
        (answerData.startPosition / 100) *
        totalDuration
      ).toFixed(2);
      const endTime = ((answerData.endPosition / 100) * totalDuration).toFixed(
        2
      );
      content += `Vùng tối ưu: <strong>${startTime}s - ${endTime}s</strong>`;
      content += `<br><small>Khu vực: ${answerData.startPosition.toFixed(1)}% - ${answerData.endPosition.toFixed(1)}%</small>`;
    }

    notice.innerHTML = content;
    return notice;
  }

  // Highlight tracking bar for simulation questions
  highlightTrackingBar(questionPanel, optimalRange) {
    try {
      const trackingBar = questionPanel.querySelector(
        ".media-audio-tracking-bar-line"
      );
      if (!trackingBar) return;

      // Remove existing highlights in this specific question panel to avoid duplicates
      const existingHighlights = questionPanel.querySelectorAll(
        ".quiz-helper-tracking-highlight"
      );
      existingHighlights.forEach((el) => el.remove());

      // Calculate accurate width
      const startPos = optimalRange.start;
      const endPos = optimalRange.end;
      const width = endPos - startPos;

      // Create highlight overlay
      const highlight = document.createElement("div");
      highlight.className = "quiz-helper-tracking-highlight";
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

      // Add debug info
      console.log('Highlight tracking bar:', {
        startPos: startPos + '%',
        endPos: endPos + '%',
        width: width + '%',
        calculatedWidth: width
      });

      // Make tracking bar container relative if needed
      if (trackingBar.style.position !== "relative") {
        trackingBar.style.position = "relative";
      }

      trackingBar.appendChild(highlight);
    } catch (error) {
      console.error("Error highlighting tracking bar:", error);
    }
  }

  highlightCorrectAnswer(questionPanel, correctAnswerText) {
    const radioInputs = questionPanel.querySelectorAll('input[type="radio"]');

    radioInputs.forEach((radio) => {
      const labelText = this.findAnswerLabel(radio);
      if (labelText && this.isAnswerMatch(labelText, correctAnswerText)) {
        const answerContainer =
          radio.closest(".mc-text-question__radio-answer") ||
          radio.closest('[class*="answer"]') ||
          radio.parentElement;

        if (answerContainer) {
          answerContainer.classList.add("quiz-helper-suggested");

          // Add suggestion icon
          if (!answerContainer.querySelector(".quiz-helper-icon")) {
            const icon = document.createElement("span");
            icon.className = "quiz-helper-icon";
            icon.textContent = "💡";
            icon.title = "Đáp án được gợi ý";
            answerContainer.appendChild(icon);
          }
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
    // Add a small notice that this question has a saved answer
    if (questionPanel.querySelector(".quiz-helper-notice")) {
      return;
    }

    const notice = document.createElement("div");
    notice.className = "quiz-helper-notice";
    notice.innerHTML =
      "💡 <strong>Gợi ý:</strong> Đáp án được đánh dấu dựa trên lần trả lời trước";

    const header =
      questionPanel.querySelector(".question-panel__header") ||
      questionPanel.querySelector('[class*="header"]') ||
      questionPanel.firstElementChild;

    if (header) {
      header.appendChild(notice);
    }
  }

  removeAllButtons() {
    // Clear tracking sets
    this.highlightedQuestion = null;

    // Stop auto mode
    this.stopAutoMode();

    document
      .querySelectorAll(
        ".quiz-helper-save-btn, .quiz-helper-notice, .quiz-helper-icon, .quiz-helper-simulation-notice, .quiz-helper-tracking-highlight, .quiz-helper-auto-container"
      )
      .forEach((el) => el.remove());

    document
      .querySelectorAll(".quiz-helper-suggested")
      .forEach((el) => el.classList.remove("quiz-helper-suggested"));
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

console.log("Content script for Quiz Helper loaded.");
