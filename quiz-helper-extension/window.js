// Window script - similar to popup but for standalone window
class QuizHelperWindow {
  constructor() {
    this.extensionEnabled = true;
    this.stats = { savedCount: 0, storageUsed: 0 };
    this.autoRefreshInterval = null;
    this.init();
  }

  async init() {
    await this.loadSettings();
    await this.loadStats();
    await this.loadDebugLogs();
    this.bindEvents();
    this.updateUI();
    this.startAutoRefresh();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['extensionEnabled']);
      this.extensionEnabled = result.extensionEnabled !== false;
    } catch (error) {
      console.error('Error loading settings:', error);
      this.extensionEnabled = true;
    }
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

    // Debug controls
    document.getElementById('refreshLogsBtn').addEventListener('click', () => {
      this.loadDebugLogs();
    });

    document.getElementById('clearLogsBtn').addEventListener('click', () => {
      this.clearDebugLogs();
    });

    document.getElementById('exportLogsBtn').addEventListener('click', () => {
      this.exportDebugLogs();
    });

    // Data management
    document.getElementById('exportBtn').addEventListener('click', () => {
      this.exportData();
    });

    document.getElementById('importBtn').addEventListener('click', () => {
      this.showImportArea();
    });

    document.getElementById('importFile').addEventListener('change', (e) => {
      this.handleFileImport(e);
    });

    document.getElementById('processImportBtn').addEventListener('click', () => {
      this.processImport();
    });

    document.getElementById('cancelImportBtn').addEventListener('click', () => {
      this.hideImportArea();
    });

    document.getElementById('copyBtn').addEventListener('click', () => {
      this.copyToClipboard();
    });

    document.getElementById('downloadBtn').addEventListener('click', () => {
      this.downloadData();
    });

    document.getElementById('clearBtn').addEventListener('click', () => {
      this.clearAllData();
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
      this.extensionEnabled ? '✅ Extension đã được bật' : '⏸️ Extension đã được tắt',
      'success'
    );
  }

  async loadDebugLogs() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getDebugLogs' });
      if (response && response.success) {
        this.displayDebugLogs(response.logs);
      } else {
        throw new Error('Failed to get debug logs response');
      }
    } catch (error) {
      console.error('Error loading debug logs:', error);
      document.getElementById('debugLogsList').innerHTML = '<div style="color: #dc3545;">❌ Lỗi tải debug logs</div>';
    }
  }

  displayDebugLogs(logs) {
    const container = document.getElementById('debugLogsList');
    if (!logs || logs.length === 0) {
      container.innerHTML = '<div style="color: #666;">📝 Chưa có debug logs</div>';
      return;
    }

    const recentLogs = logs.slice(-20); // Show last 20 logs
    container.innerHTML = recentLogs.map(log => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      
      let dataText = '';
      if (log.data) {
        try {
          const dataStr = JSON.stringify(log.data);
          dataText = dataStr.length > 100 ? dataStr.substring(0, 100) + '...' : dataStr;
        } catch (e) {
          dataText = String(log.data).substring(0, 100);
        }
      }
      
      return `
        <div class="debug-log ${log.type}">
          <span class="debug-timestamp">${time}</span>
          ${log.message}
          ${dataText ? `<br><small style="color: #888;">📄 ${dataText}</small>` : ''}
        </div>
      `;
    }).join('');
    
    // Auto scroll to bottom
    container.scrollTop = container.scrollHeight;
  }

  async clearDebugLogs() {
    if (!confirm('Bạn có chắc chắn muốn xóa tất cả debug logs?')) {
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({ action: 'clearDebugLogs' });
      if (response && response.success) {
        this.displayDebugLogs([]);
        this.showStatus('🧹 Debug logs đã được xóa', 'success');
      } else {
        throw new Error('Failed to clear debug logs');
      }
    } catch (error) {
      console.error('Error clearing debug logs:', error);
      this.showStatus('❌ Lỗi khi xóa debug logs', 'error');
    }
  }

  async exportDebugLogs() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getDebugLogs' });
      if (response && response.success) {
        const exportData = {
          timestamp: new Date().toISOString(),
          logs: response.logs,
          totalLogs: response.logs.length
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
          type: 'application/json' 
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `quiz-helper-debug-logs-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showStatus('📁 Debug logs đã được xuất', 'success');
      }
    } catch (error) {
      console.error('Error exporting debug logs:', error);
      this.showStatus('❌ Lỗi khi xuất debug logs', 'error');
    }
  }

  startAutoRefresh() {
    // Auto refresh debug logs every 3 seconds
    this.autoRefreshInterval = setInterval(() => {
      this.loadDebugLogs();
    }, 3000);
  }

  stopAutoRefresh() {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }
  }

  async exportData() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'exportData' });
      
      if (response && response.success) {
        document.getElementById('exportData').value = response.data;
        document.getElementById('exportArea').style.display = 'block';
        document.getElementById('importArea').style.display = 'none';
        this.showStatus('📤 Dữ liệu đã được xuất thành công', 'success');
      } else {
        throw new Error(response?.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Export error:', error);
      this.showStatus(`❌ Lỗi xuất dữ liệu: ${error.message}`, 'error');
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
      this.showStatus('⚠️ Vui lòng nhập dữ liệu', 'error');
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'importData',
        data: data
      });

      if (response && response.success) {
        this.hideImportArea();
        await this.loadStats();
        this.updateUI();
        this.showStatus(`✅ Đã nhập thành công ${response.count} câu hỏi`, 'success');
      } else {
        throw new Error(response?.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Import error:', error);
      this.showStatus(`❌ Lỗi nhập dữ liệu: ${error.message}`, 'error');
    }
  }

  async copyToClipboard() {
    const data = document.getElementById('exportData').value;
    try {
      await navigator.clipboard.writeText(data);
      this.showStatus('📋 Đã copy vào clipboard', 'success');
    } catch (error) {
      console.error('Copy error:', error);
      this.showStatus('❌ Lỗi khi copy', 'error');
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
    this.showStatus('💾 Tệp đã được tải xuống', 'success');
  }

  async clearAllData() {
    if (!confirm('⚠️ Bạn có chắc chắn muốn xóa tất cả dữ liệu đã lưu?\n\n🚨 Hành động này không thể hoàn tác!')) {
      return;
    }

    // Double confirmation
    if (!confirm('🚨 XÁC NHẬN LẦN CUỐI: Xóa tất cả câu hỏi và đáp án đã lưu?')) {
      return;
    }

    try {
      await chrome.storage.local.clear();
      await this.loadStats();
      this.updateUI();
      
      document.getElementById('exportArea').style.display = 'none';
      document.getElementById('importArea').style.display = 'none';
      
      this.showStatus('🗑️ Đã xóa tất cả dữ liệu', 'success');
    } catch (error) {
      console.error('Clear error:', error);
      this.showStatus(`❌ Lỗi khi xóa dữ liệu: ${error.message}`, 'error');
    }
  }

  showStatus(message, type = 'info') {
    const statusElement = document.getElementById('statusMessage');
    statusElement.className = `status-message ${type}`;
    statusElement.textContent = message;
    statusElement.style.display = 'block';
    
    setTimeout(() => {
      statusElement.style.display = 'none';
    }, 4000);
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new QuizHelperWindow();
});

// Clean up when window is closed
window.addEventListener('beforeunload', () => {
  if (window.quizHelperWindow) {
    window.quizHelperWindow.stopAutoRefresh();
  }
});
