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
    this.init();
  }

  async init() {
    await DebugLogger.info("QuizHelper initializing...", {
      url: window.location.href,
    });

    // Check if extension is enabled
    const result = await chrome.storage.sync.get(["extensionEnabled"]);
    this.isEnabled = result.extensionEnabled !== false;

    await DebugLogger.info(`Extension enabled status: ${this.isEnabled}`);

    if (this.isEnabled) {
      this.startObserver();
      this.processExistingQuestions();
    }

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
    document
      .querySelectorAll(
        ".quiz-helper-save-btn, .quiz-helper-notice, .quiz-helper-icon, .quiz-helper-simulation-notice, .quiz-helper-tracking-highlight"
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
