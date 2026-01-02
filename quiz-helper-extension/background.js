// Background service worker
chrome.runtime.onInstalled.addListener(async () => {
  // Initialize extension settings
  chrome.storage.sync.get(["extensionEnabled"], (result) => {
    if (result.extensionEnabled === undefined) {
      chrome.storage.sync.set({ extensionEnabled: true });
    }
  });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "saveAnswer") {
    saveAnswer(request.questionData);
    sendResponse({ success: true });
  } else if (request.action === "getAnswer") {
    getAnswer(request.questionTitle, sendResponse, request.backupTitle);
    return true; // Keep message channel open for async response
  } else if (request.action === "exportData") {
    exportData(sendResponse);
    return true;
  } else if (request.action === "importData") {
    importData(request.data, sendResponse);
    return true;
  } else if (request.action === "openDebugWindow") {
    openDebugWindow();
    sendResponse({ success: true });
  } else if (request.action === "saveDebugLog") {
    saveDebugLog(request.log);
    sendResponse({ success: true });
  } else if (request.action === "getDebugLogs") {
    getDebugLogs(sendResponse);
    return true;
  } else if (request.action === "clearDebugLogs") {
    clearDebugLogs(sendResponse);
    return true;
  }
});

async function saveAnswer(questionData) {
  try {
    const result = await chrome.storage.local.get(["quizAnswers"]);
    const answers = result.quizAnswers || {};

    answers[questionData.title] = {
      type: questionData.type,
      correctAnswer: questionData.correctAnswer,
      timestamp: Date.now(),
    };

    await chrome.storage.local.set({ quizAnswers: answers });
    console.log(
      "Answer saved:",
      questionData.title,
      "Type:",
      questionData.type
    );
  } catch (error) {
    console.error("Error saving answer:", error);
  }
}

async function getAnswer(questionId, sendResponse, backupTitle = null) {
  try {
    const result = await chrome.storage.local.get(["quizAnswers"]);
    const answers = result.quizAnswers || {};
    if (answers[questionId]) {
      sendResponse({ found: true, data: answers[questionId] });
    } else if (backupTitle) {
      const findByBackup = Object.keys(answers).find((key => key.includes(backupTitle)));
      if (findByBackup) {
        sendResponse({ found: true, data: answers[findByBackup] });
      } else {
        sendResponse({ found: false });
      }
    } else {
      sendResponse({ found: false });
    }
  } catch (error) {
    console.error("Error getting answer:", error);
    sendResponse({ found: false, error: error.message });
  }
}

async function exportData(sendResponse) {
  try {
    const result = await chrome.storage.local.get(["quizAnswers"]);
    const questions = result.quizAnswers || {};

    // Convert to new format if needed
    const formattedData = {};
    Object.keys(questions).forEach((title) => {
      const question = questions[title];
      formattedData[title] = {
        type: question.type || "multiple_choice", // Default for backward compatibility
        correctAnswer: question.correctAnswer,
        timestamp: question.timestamp,
      };
    });

    const data = {
      questions: formattedData,
      exportDate: new Date().toISOString(),
      version: "2.0",
    };

    sendResponse({ success: true, data: JSON.stringify(data, null, 2) });
  } catch (error) {
    console.error("Error exporting data:", error);
    sendResponse({ success: false, error: error.message });
  }
}

async function importData(importedData, sendResponse) {
  try {
    const data = JSON.parse(importedData);
    let questionsToImport = {};

    // Handle both old and new format
    if (data.questions) {
      // New format (v2.0+)
      questionsToImport = data.questions;
    } else if (data.answers) {
      // Old format (v1.0) - convert to new format
      Object.keys(data.answers).forEach((key) => {
        const oldAnswer = data.answers[key];
        const title = oldAnswer.question || oldAnswer.title || key;
        questionsToImport[title] = {
          type: oldAnswer.type || "multiple_choice", // Default for backward compatibility
          correctAnswer: oldAnswer.correctAnswer,
          timestamp: oldAnswer.timestamp,
        };
      });
    } else {
      throw new Error("Invalid data format");
    }

    if (typeof questionsToImport === "object") {
      await chrome.storage.local.set({ quizAnswers: questionsToImport });
      sendResponse({
        success: true,
        count: Object.keys(questionsToImport).length,
      });
    } else {
      throw new Error("Invalid questions format");
    }
  } catch (error) {
    console.error("Error importing data:", error);
    sendResponse({ success: false, error: error.message });
  }
}

// Debug Window Functions
async function openDebugWindow() {
  try {
    const window = await chrome.windows.create({
      url: chrome.runtime.getURL("debug-window.html"),
      type: "popup",
      width: 800,
      height: 600,
      focused: true,
    });
    console.log("Debug window opened:", window.id);
  } catch (error) {
    console.error("Error opening debug window:", error);
  }
}

async function saveDebugLog(logEntry) {
  try {
    console.log("Log", logEntry);

    const result = await chrome.storage.local.get(["debugLogs"]);
    let logs = result.debugLogs || [];

    logs.push(logEntry);

    // Keep only last 1000 logs
    if (logs.length > 1000) {
      logs = logs.slice(-1000);
    }

    await chrome.storage.local.set({ debugLogs: logs });
  } catch (error) {
    console.error("Error saving debug log:", error);
  }
}

async function getDebugLogs(sendResponse) {
  try {
    const result = await chrome.storage.local.get(["debugLogs"]);
    sendResponse({ success: true, logs: result.debugLogs || [] });
  } catch (error) {
    console.error("Error getting debug logs:", error);
    sendResponse({ success: false, error: error.message });
  }
}

async function clearDebugLogs(sendResponse) {
  try {
    await chrome.storage.local.set({ debugLogs: [] });
    sendResponse({ success: true });
  } catch (error) {
    console.error("Error clearing debug logs:", error);
    sendResponse({ success: false, error: error.message });
  }
}
