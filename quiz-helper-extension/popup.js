// Popup script
class QuizHelperPopup {
  constructor() {
    this.init();
  }

  async init() {
    await this.loadSettings();
    await this.loadStats();
    this.bindEvents();
    this.updateUI();
  }

  async loadSettings() {
    const result = await chrome.storage.sync.get(['extensionEnabled']);
    this.extensionEnabled = result.extensionEnabled !== false;
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
  }

  async toggleExtension() {
    this.extensionEnabled = !this.extensionEnabled;
    await chrome.storage.sync.set({ extensionEnabled: this.extensionEnabled });
    this.updateUI();

    this.showStatus(
      this.extensionEnabled ? 'Extension đã được bật' : 'Extension đã được tắt',
      'success'
    );
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
