// Background service worker
chrome.runtime.onInstalled.addListener(() => {
  // Initialize extension settings
  chrome.storage.sync.get(['extensionEnabled'], (result) => {
    if (result.extensionEnabled === undefined) {
      chrome.storage.sync.set({ extensionEnabled: true });
    }
  });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveAnswer') {
    saveAnswer(request.questionData);
    sendResponse({ success: true });
  } else if (request.action === 'getAnswer') {
    getAnswer(request.questionHash, sendResponse);
    return true; // Keep message channel open for async response
  } else if (request.action === 'exportData') {
    exportData(sendResponse);
    return true;
  } else if (request.action === 'importData') {
    importData(request.data, sendResponse);
    return true;
  }
});

async function saveAnswer(questionData) {
  try {
    const result = await chrome.storage.local.get(['quizAnswers']);
    const answers = result.quizAnswers || {};
    
    answers[questionData.questionHash] = {
      question: questionData.question,
      correctAnswer: questionData.correctAnswer,
      allAnswers: questionData.allAnswers,
      timestamp: Date.now(),
      url: questionData.url
    };
    
    await chrome.storage.local.set({ quizAnswers: answers });
    console.log('Answer saved:', questionData.questionHash);
  } catch (error) {
    console.error('Error saving answer:', error);
  }
}

async function getAnswer(questionHash, sendResponse) {
  try {
    const result = await chrome.storage.local.get(['quizAnswers']);
    const answers = result.quizAnswers || {};
    
    if (answers[questionHash]) {
      sendResponse({ found: true, data: answers[questionHash] });
    } else {
      sendResponse({ found: false });
    }
  } catch (error) {
    console.error('Error getting answer:', error);
    sendResponse({ found: false, error: error.message });
  }
}

async function exportData(sendResponse) {
  try {
    const result = await chrome.storage.local.get(['quizAnswers']);
    const data = {
      answers: result.quizAnswers || {},
      exportDate: new Date().toISOString(),
      version: "1.0"
    };
    
    sendResponse({ success: true, data: JSON.stringify(data, null, 2) });
  } catch (error) {
    console.error('Error exporting data:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function importData(importedData, sendResponse) {
  try {
    const data = JSON.parse(importedData);
    
    if (data.answers && typeof data.answers === 'object') {
      await chrome.storage.local.set({ quizAnswers: data.answers });
      sendResponse({ success: true, count: Object.keys(data.answers).length });
    } else {
      throw new Error('Invalid data format');
    }
  } catch (error) {
    console.error('Error importing data:', error);
    sendResponse({ success: false, error: error.message });
  }
}
