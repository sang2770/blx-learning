// Popup script - simplified to just open main window
class QuizHelperPopup {
  constructor() {
    this.extensionEnabled = true;
    this.stats = { savedCount: 0, storageUsed: 0 };
    this.init();
  }

  async init() {
    await this.loadSettings();
    await this.loadStats();
    this.bindEvents();
    this.updateUI();
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
    // Main window button
    document.getElementById('openWindowBtn').addEventListener('click', () => {
      this.openMainWindow();
    });

    // Extension toggle
    document.getElementById('extensionToggle').addEventListener('click', () => {
      this.toggleExtension();
    });

    // Quick actions
    document.getElementById('refreshBtn').addEventListener('click', () => {
      this.refreshStats();
    });

    document.getElementById('helpBtn').addEventListener('click', () => {
      this.showHelp();
    });
  }

  updateUI() {
    // Update toggle switch
    const toggle = document.getElementById('extensionToggle');
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');

    if (this.extensionEnabled) {
      toggle.classList.add('active');
      statusIndicator.className = 'status-indicator enabled';
      statusText.textContent = '🟢 Extension đang hoạt động';
    } else {
      toggle.classList.remove('active');
      statusIndicator.className = 'status-indicator disabled';
      statusText.textContent = '🔴 Extension đã tắt';
    }

    // Update stats
    document.getElementById('savedCount').textContent = this.stats.savedCount;
    document.getElementById('storageUsed').textContent = `${this.stats.storageUsed} KB`;
  }

  async openMainWindow() {
    try {
      // Create new window with the main interface
      await chrome.windows.create({
        url: chrome.runtime.getURL('window.html'),
        type: 'popup',
        width: 600,
        height: 700,
        focused: true
      });
      
      // Close popup after opening main window
      window.close();
    } catch (error) {
      console.error('Error opening main window:', error);
      
      // Fallback: try to open as tab if window creation fails
      try {
        await chrome.tabs.create({
          url: chrome.runtime.getURL('window.html')
        });
        window.close();
      } catch (tabError) {
        console.error('Error opening as tab:', tabError);
        alert('❌ Không thể mở cửa sổ chính. Vui lòng thử lại!');
      }
    }
  }

  async toggleExtension() {
    this.extensionEnabled = !this.extensionEnabled;
    
    try {
      await chrome.storage.sync.set({ extensionEnabled: this.extensionEnabled });
      this.updateUI();
    } catch (error) {
      console.error('Error saving extension setting:', error);
      // Revert the change if save failed
      this.extensionEnabled = !this.extensionEnabled;
      this.updateUI();
    }
  }

  async refreshStats() {
    const refreshBtn = document.getElementById('refreshBtn');
    const originalText = refreshBtn.textContent;
    
    refreshBtn.textContent = '⏳';
    refreshBtn.disabled = true;
    
    try {
      await this.loadStats();
      this.updateUI();
    } catch (error) {
      console.error('Error refreshing stats:', error);
    } finally {
      refreshBtn.textContent = originalText;
      refreshBtn.disabled = false;
    }
  }

  showHelp() {
    const helpText = `🧠 Quiz Helper - Hướng dẫn sử dụng

📝 Lưu đáp án:
• Làm bài trắc nghiệm bình thường
• Khi thấy đáp án đúng hiển thị → Nhấn "💾 Lưu đáp án"

💡 Gợi ý đáp án:
• Gặp lại câu hỏi cũ → Đáp án được bôi vàng tự động
• Icon 💡 báo hiệu có gợi ý

🖥️ Bảng điều khiển:
• Nhấn "Mở Bảng điều khiển" để truy cập đầy đủ
• Xem debug logs, quản lý dữ liệu, thống kê chi tiết

⚙️ Cài đặt:
• Bật/tắt extension bằng switch
• Tắt extension → Ẩn tất cả gợi ý

💾 Sao lưu:
• Xuất dữ liệu để backup
• Nhập dữ liệu để phục hồi hoặc chia sẻ`;

    alert(helpText);
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new QuizHelperPopup();
});
