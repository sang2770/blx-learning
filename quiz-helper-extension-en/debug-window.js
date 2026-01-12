// Debug Console JavaScript
class DebugConsole {
    constructor() {
        this.logs = [];
        this.isConnected = false;
        this.connectionAttempts = 0;
        this.init();
    }

    init() {
        this.bindEvents();
        this.startConnection();

        // Request logs from background script every 1 second for real-time updates
        setInterval(() => {
            this.requestLogs();
        }, 1000);
    }

    bindEvents() {
        // Buttons only
        document
            .getElementById("refreshBtn")
            .addEventListener("click", () => {
                this.requestLogs();
            });

        document.getElementById("clearBtn").addEventListener("click", () => {
            this.clearLogs();
        });

        document.getElementById("exportBtn").addEventListener("click", () => {
            this.exportLogs();
        });
    }

    startConnection() {
        this.updateConnectionStatus("Connecting...", false);
        this.requestLogs();
    }

    requestLogs() {
        // Request logs from background script
        chrome.runtime
            .sendMessage({ action: "getDebugLogs" })
            .then((response) => {
                if (response && response.success) {
                    this.updateLogs(response.logs || []);
                    this.updateConnectionStatus("Connected", true);
                } else {
                    this.handleConnectionError();
                }
            })
            .catch((error) => {
                console.error("Error requesting logs:", error);
                this.handleConnectionError();
            });
    }

    handleConnectionError() {
        this.connectionAttempts++;
        if (this.connectionAttempts > 5) {
            this.updateConnectionStatus("Connection failed", false);
            this.showConnectionHelp();
        } else {
            this.updateConnectionStatus(
                `Retrying... (${this.connectionAttempts}/5)`,
                false
            );
        }
    }

    showConnectionHelp() {
        const noLogs = document.getElementById("noLogs");
        noLogs.innerHTML = `
                <div>❌ Không thể kết nối với Extension</div>
                <div class="connection-help">
                    <h3>Giải pháp:</h3>
                    <p>1. Đảm bảo bạn đang ở trang quiz</p>
                    <p>2. Extension Quiz Helper đã được bật</p>
                    <p>3. Reload trang quiz và thử lại</p>
                    <p>4. Kiểm tra extension có hoạt động không</p>
                </div>
            `;
        noLogs.style.display = "flex";
    }

    updateLogs(newLogs) {
        this.logs = newLogs || [];
        this.renderLogs();
        this.updateStatus();

        if (this.logs.length > 0) {
            const noLogs = document.getElementById("noLogs");
            noLogs.style.display = "none";
        }
    }

    renderLogs() {
        const container = document.getElementById("logsContainer");
        const noLogsEl = document.getElementById("noLogs");

        if (this.logs.length === 0) {
            noLogsEl.style.display = "flex";
            // Clear existing logs
            const existingLogs = container.querySelectorAll(".log-entry");
            existingLogs.forEach((el) => el.remove());
            return;
        }

        noLogsEl.style.display = "none";

        // Clear and rebuild
        const existingLogs = container.querySelectorAll(".log-entry");
        existingLogs.forEach((el) => el.remove());

        // Show all logs without filtering
        this.logs.forEach((log) => {
            if (!log) return;
            const logEl = this.createLogElement(log);
            container.appendChild(logEl);
        });

        // Auto scroll to bottom
        // container.scrollTop = container.scrollHeight;
    }

    createLogElement(log) {
        if (!log) return null;
        const logEl = document.createElement("div");
        logEl.className = "log-entry";
        logEl.innerHTML = `
                <span class="log-level log-level-${log.level
            }">${log.level.toUpperCase()}</span>
                <span class="log-message">${this.escapeHtml(
                log.message
            )}</span>
                ${log.data
                ? `<div class="log-data">${this.escapeHtml(
                    log.data
                )}</div>`
                : ""
            }
            `;

        return logEl;
    }

    escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    updateConnectionStatus(message, isConnected) {
        const statusEl = document.getElementById("connectionStatus");

        if (isConnected) {
            statusEl.style.color = "#28a745";
            statusEl.textContent = `🟢 ${message} (${this.logs.length} logs)`;
            this.connectionAttempts = 0;
        } else {
            statusEl.style.color = "#dc3545";
            statusEl.textContent = `🔴 ${message}`;
        }

        this.isConnected = isConnected;
    }

    updateStatus() {
        document.getElementById(
            "lastUpdate"
        ).textContent = `Cập nhật: ${new Date().toLocaleTimeString("vi-VN")}`;
    }

    clearLogs() {
        if (confirm("Xóa tất cả debug logs?")) {
            // Clear logs in background script
            chrome.runtime
                .sendMessage({ action: "clearDebugLogs" })
                .then(() => {
                    this.logs = [];
                    this.renderLogs();
                    this.updateStatus();
                })
                .catch((error) => {
                    console.error("Error clearing logs:", error);
                });
        }
    }

    exportLogs() {
        const dataStr = JSON.stringify(this.logs, null, 2);
        const dataBlob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(dataBlob);

        const link = document.createElement("a");
        link.href = url;
        link.download = `quiz-helper-debug-${new Date()
            .toISOString()
            .slice(0, 19)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);
    }
}

// Initialize debug console when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new DebugConsole();
});