// Popup script
class QuizHelperPopup {
  constructor() {
    this.autoMode = false;
    this.repeatMode = false;
    this.wrongAnswerCount = 0;
    this.init();
  }

  async init() {
    await this.loadSettings();
    await this.loadStats();
    await this.loadAutomationState();
    this.bindEvents();
    this.updateUI();
  }

  async loadSettings() {
    const result = await chrome.storage.sync.get(['extensionEnabled', 'wrongAnswerCount']);
    this.extensionEnabled = result.extensionEnabled !== false;
    this.wrongAnswerCount = result.wrongAnswerCount || 0;
  }

  async loadAutomationState() {
    try {
      const response = await this.sendToActiveTab({ action: 'getAutoModeStatus' });
      this.autoMode = response?.autoMode || false;
      this.repeatMode = response?.repeatMode || false;
    } catch (error) {
      this.autoMode = false;
      this.repeatMode = false;
    }
  }

  async sendToActiveTab(message) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      throw new Error('Không tìm thấy tab đang hoạt động');
    }

    return await chrome.tabs.sendMessage(tab.id, message);
  }

  async loadStats() {
    try {
      const result = await chrome.storage.local.get(['quizAnswers']);
      const answers = result.quizAnswers || {};

      this.stats = {
        savedCount: Object.keys(answers).length,
        storageUsed: this.calculateStorageSize(answers)
      };
    } catch (error) {
      console.error('Error loading stats:', error);
      this.stats = { savedCount: 0, storageUsed: 0 };
    }
  }

  calculateStorageSize(data) {
    const sizeInBytes = new Blob([JSON.stringify(data)]).size;
    return Math.round(sizeInBytes / 1024 * 100) / 100; // KB with 2 decimal places
  }

  bindEvents() {
    // Extension toggle
    document.getElementById('extensionToggle').addEventListener('click', () => {
      this.toggleExtension();
    });

    // Automation controls
    document.getElementById('autoModeBtn').addEventListener('click', () => {
      this.toggleAutoMode();
    });

    document.getElementById('repeatModeBtn').addEventListener('click', () => {
      this.toggleRepeatMode();
    });

    document.getElementById('saveWrongCountBtn').addEventListener('click', () => {
      this.saveWrongAnswerCount();
    });

    document.getElementById('wrongAnswerCountInput').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        this.saveWrongAnswerCount();
      }
    });

    // Export button
    document.getElementById('exportBtn').addEventListener('click', () => {
      this.exportData();
    });

    // Import button
    document.getElementById('importBtn').addEventListener('click', () => {
      this.showImportArea();
    });

    // File import
    document.getElementById('importFile').addEventListener('change', (e) => {
      this.handleFileImport(e);
    });

    // Process import
    document.getElementById('processImportBtn').addEventListener('click', () => {
      this.processImport();
    });

    // Cancel import
    document.getElementById('cancelImportBtn').addEventListener('click', () => {
      this.hideImportArea();
    });

    // Copy button
    document.getElementById('copyBtn').addEventListener('click', () => {
      this.copyToClipboard();
    });

    // Download button
    document.getElementById('downloadBtn').addEventListener('click', () => {
      this.downloadData();
    });

    // Clear button
    document.getElementById('clearBtn').addEventListener('click', () => {
      this.clearAllData();
    });

    // Debug console buttons
    document.getElementById('openDebugBtn').addEventListener('click', () => {
      this.openDebugConsole();
    });

    document.getElementById('clearDebugBtn').addEventListener('click', () => {
      this.clearDebugLogs();
    });
  }

  updateUI() {
    // Update toggle switch
    const toggle = document.getElementById('extensionToggle');
    if (this.extensionEnabled) {
      toggle.classList.add('active');
    } else {
      toggle.classList.remove('active');
    }

    // Update stats
    document.getElementById('savedCount').textContent = this.stats.savedCount;
    document.getElementById('storageUsed').textContent = `${this.stats.storageUsed} KB`;
    document.getElementById('wrongAnswerCountInput').value = this.wrongAnswerCount;
    this.updateAutomationUI();
  }

  updateAutomationUI() {
    const statusElement = document.getElementById('automationStatus');
    const autoButton = document.getElementById('autoModeBtn');
    const repeatButton = document.getElementById('repeatModeBtn');
    const saveButton = document.getElementById('saveWrongCountBtn');
    const wrongCountInput = document.getElementById('wrongAnswerCountInput');

    if (statusElement) {
      statusElement.textContent = `Auto: ${this.autoMode ? 'đang chạy' : 'tắt'} | Repeat: ${this.repeatMode ? 'đang chạy' : 'tắt'} | Số câu sai: ${this.wrongAnswerCount}`;
    }

    if (autoButton) {
      autoButton.textContent = this.autoMode ? '⏹️ Dừng Auto' : '🤖 Bật Auto';
      autoButton.classList.toggle('auto-active', this.autoMode);
      autoButton.disabled = !this.extensionEnabled;
    }

    if (repeatButton) {
      repeatButton.textContent = this.repeatMode ? '⏸️ Tạm dừng Repeat' : '🔄 Bật Repeat';
      repeatButton.classList.toggle('auto-active', this.repeatMode);
      repeatButton.disabled = !this.extensionEnabled;
    }

    if (saveButton) {
      saveButton.disabled = !this.extensionEnabled;
    }

    if (wrongCountInput) {
      wrongCountInput.disabled = !this.extensionEnabled;
    }
  }

  async toggleExtension() {
    this.extensionEnabled = !this.extensionEnabled;
    await chrome.storage.sync.set({ extensionEnabled: this.extensionEnabled });
    this.updateUI();
  }

  async toggleAutoMode() {
    try {
      const action = this.autoMode ? 'stopAutoMode' : 'startAutoMode';
      const response = await this.sendToActiveTab({ action });

      if (response?.success === false) {
        throw new Error(response.error || 'Unknown error');
      }

      this.autoMode = !this.autoMode;
      this.updateAutomationUI();
      this.showStatus(this.autoMode ? 'Đã bật Auto mode' : 'Đã tắt Auto mode', 'success');
    } catch (error) {
      console.error('Auto mode error:', error);
      this.showStatus(`Lỗi khi đổi Auto mode: ${error.message}`, 'error');
    }
  }

  async toggleRepeatMode() {
    try {
      const action = this.repeatMode ? 'stopRepeatMode' : 'startRepeatMode';
      const response = await this.sendToActiveTab({ action });

      if (response?.success === false) {
        throw new Error(response.error || 'Unknown error');
      }

      this.repeatMode = !this.repeatMode;
      this.updateAutomationUI();
      this.showStatus(this.repeatMode ? 'Đã bật Repeat mode' : 'Đã tắt Repeat mode', 'success');
    } catch (error) {
      console.error('Repeat mode error:', error);
      this.showStatus(`Lỗi khi đổi Repeat mode: ${error.message}`, 'error');
    }
  }

  async saveWrongAnswerCount() {
    try {
      const input = document.getElementById('wrongAnswerCountInput');
      const value = Number.parseInt(input.value, 10);

      if (Number.isNaN(value) || value < 0 || value > 50) {
        this.showStatus('Vui lòng nhập số từ 0 đến 50', 'error');
        return;
      }

      this.wrongAnswerCount = value;
      await chrome.storage.sync.set({ wrongAnswerCount: value });
      this.updateAutomationUI();
      this.showStatus('Đã lưu số câu trả lời sai', 'success');
    } catch (error) {
      console.error('Wrong answer count error:', error);
      this.showStatus(`Lỗi khi lưu số câu sai: ${error.message}`, 'error');
    }
  }

  async exportData() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'exportData' });

      if (response.success) {
        document.getElementById('exportData').value = response.data;
        document.getElementById('exportArea').style.display = 'block';
        document.getElementById('importArea').style.display = 'none';
        this.showStatus('Dữ liệu đã được xuất thành công', 'success');
      } else {
        throw new Error(response.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Export error:', error);
      this.showStatus(`Lỗi xuất dữ liệu: ${error.message}`, 'error');
    }
  }

  showImportArea() {
    document.getElementById('importArea').style.display = 'block';
    document.getElementById('exportArea').style.display = 'none';
    document.getElementById('importData').value = '';
    document.getElementById('importData').focus();
  }

  hideImportArea() {
    document.getElementById('importArea').style.display = 'none';
    document.getElementById('importData').value = '';
  }

  handleFileImport(event) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        document.getElementById('importData').value = e.target.result;
        this.showImportArea();
      };
      reader.readAsText(file);
    }
  }

  async processImport() {
    const data = document.getElementById('importData').value.trim();

    if (!data) {
      this.showStatus('Vui lòng nhập dữ liệu', 'error');
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'importData',
        data: data
      });

      if (response.success) {
        this.hideImportArea();
        await this.loadStats();
        this.updateUI();
        this.showStatus(`Đã nhập thành công ${response.count} câu hỏi`, 'success');
      } else {
        throw new Error(response.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Import error:', error);
      this.showStatus(`Lỗi nhập dữ liệu: ${error.message}`, 'error');
    }
  }

  async copyToClipboard() {
    const data = document.getElementById('exportData').value;
    try {
      await navigator.clipboard.writeText(data);
      this.showStatus('Đã copy vào clipboard', 'success');
    } catch (error) {
      console.error('Copy error:', error);
      this.showStatus('Lỗi khi copy', 'error');
    }
  }

  downloadData() {
    const data = document.getElementById('exportData').value;
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `quiz-helper-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
    this.showStatus('Tệp đã được tải xuống', 'success');
  }

  async clearAllData() {
    if (confirm('Bạn có chắc chắn muốn xóa tất cả dữ liệu đã lưu?\n\nHành động này không thể hoàn tác!')) {
      try {
        await chrome.storage.local.clear();
        await this.loadStats();
        this.updateUI();

        document.getElementById('exportArea').style.display = 'none';
        document.getElementById('importArea').style.display = 'none';

        this.showStatus('Đã xóa tất cả dữ liệu', 'success');
      } catch (error) {
        console.error('Clear error:', error);
        this.showStatus(`Lỗi khi xóa dữ liệu: ${error.message}`, 'error');
      }
    }
  }

  showStatus(message, type = 'info') {
    const statusElement = document.getElementById('statusMessage');
    statusElement.className = `quiz-helper-status ${type}`;
    statusElement.textContent = message;
    statusElement.style.display = 'block';

    setTimeout(() => {
      statusElement.style.display = 'none';
    }, 3000);
  }

  // Debug Console Methods
  async openDebugConsole() {
    try {
      await chrome.runtime.sendMessage({
        action: 'openDebugWindow'
      });
      this.showStatus('Debug console đã được mở trong cửa sổ riêng', 'success');
    } catch (error) {
      console.error('Error opening debug console:', error);
      this.showStatus(`Lỗi khi mở debug console: ${error.message}`, 'error');
    }
  }

  async clearDebugLogs() {
    try {
      await chrome.runtime.sendMessage({
        action: 'clearDebugLogs'
      });
      this.showStatus('Debug logs đã được xóa', 'success');
    } catch (error) {
      console.error('Error clearing debug logs:', error);
      this.showStatus(`Lỗi khi xóa debug logs: ${error.message}`, 'error');
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new QuizHelperPopup();
});
