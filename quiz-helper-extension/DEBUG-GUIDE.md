# Debug Console - Hướng dẫn sử dụng

## 🐛 Tính năng Debug Console

Debug Console là một công cụ debug tích hợp giúp theo dõi hoạt động của Quiz Helper Extension mà không cần mở DevTools của trình duyệt.

## 🚀 Cách mở Debug Console

### Phương pháp 1: Từ Popup
1. Nhấn vào icon extension trên thanh công cụ
2. Nhấn nút "🐛 Mở Debug Console"

### Phương pháp 2: Phím tắt
- Nhấn **Ctrl + Shift + D** trên trang web

## 📊 Giao diện Debug Console

### Header
- **Tiêu đề**: Quiz Helper Debug Console
- **Nút 🗑️**: Xóa tất cả logs
- **Nút 📁**: Xuất logs ra file JSON
- **Nút ❌**: Đóng console

### Content Area
- Hiển thị logs theo thời gian thực
- Cuộn tự động xuống log mới nhất
- Màu sắc khác nhau cho từng loại log:
  - 🟢 **LOG** (xanh lá): Thông tin chung
  - 🔵 **INFO** (xanh dương): Thông tin quan trọng  
  - 🟡 **WARN** (vàng): Cảnh báo
  - 🔴 **ERROR** (đỏ): Lỗi

### Footer
- Hướng dẫn phím tắt
- Số lượng logs tối đa (100)

## 📝 Các loại Log

### Khởi tạo Extension
```
🚀 Quiz Helper initializing...
Extension enabled: true
🔍 Starting DOM observer...
✅ DOM observer started
✅ Quiz Helper initialized successfully
```

### Phát hiện câu hỏi
```
📝 Found 1 question panel(s)
🔄 Processing question: question688c813d6dc4dd20900527a8
📊 Question data extracted: {hash: "abc123", question: "Khi gặp vụ tai nạn...", answersCount: 4}
```

### Tìm đáp án đã lưu
```
🔍 Checking for saved answer...
💡 Found saved answer! Highlighting...
🎨 Highlighting correct answer: 2-Dừng xe, hỗ trợ nạn nhân...
✨ Answer highlighted successfully
```

### Theo dõi thay đổi
```
👀 Setting up watcher for correct answer revelation
⏳ Correct answer not yet visible, watching for changes
🎯 Detected correct answer element added
💾 Correct answer now visible! Adding save button
💾 Save button added successfully
```

### Lưu đáp án
```
💾 Starting to save answer...
✅ Correct answer extracted: 2-Dừng xe, hỗ trợ nạn nhân...
💾 Answer saved successfully!
```

## 🔧 Tính năng Debug Console

### 1. Kéo thả cửa sổ
- Nhấn và kéo phần header để di chuyển cửa sổ

### 2. Xuất logs
- Nhấn nút 📁 để tải file JSON chứa tất cả logs
- File bao gồm:
  - Timestamp
  - URL trang web
  - User Agent
  - Tất cả logs với thời gian

### 3. Xóa logs
- Nhấn nút 🗑️ để xóa tất cả logs hiện tại

### 4. Tự động cuộn
- Logs mới sẽ tự động xuất hiện ở cuối
- Console tự động cuộn xuống log mới nhất

## 🛠️ Sử dụng để Debug

### Kiểm tra Extension hoạt động
1. Mở debug console
2. Refresh trang web
3. Kiểm tra logs khởi tạo

### Kiểm tra phát hiện câu hỏi
1. Vào trang có câu hỏi trắc nghiệm
2. Xem logs "📝 Found X question panel(s)"
3. Xem logs "🔄 Processing question"

### Kiểm tra lưu đáp án
1. Làm bài trắc nghiệm
2. Click vào đáp án
3. Xem logs "🎯 Detected correct answer"
4. Nhấn nút "💾 Lưu đáp án"
5. Xem logs "💾 Answer saved successfully"

### Kiểm tra gợi ý đáp án
1. Vào câu hỏi đã lưu trước đó
2. Xem logs "💡 Found saved answer"
3. Kiểm tra đáp án có được tô vàng không

## ⚠️ Troubleshooting

### Debug console không xuất hiện
- Refresh trang web
- Kiểm tra extension có được bật không
- Thử phím tắt Ctrl+Shift+D

### Không có logs
- Kiểm tra extension đang hoạt động
- Refresh trang để khởi động lại
- Kiểm tra trang web có câu hỏi trắc nghiệm không

### Logs bị mất
- Console chỉ lưu 100 logs gần nhất
- Xuất logs ra file nếu cần lưu trữ lâu dài

## 📋 Mẹo sử dụng hiệu quả

1. **Luôn mở debug console** khi gặp vấn đề
2. **Xuất logs** trước khi báo lỗi
3. **Refresh trang** để reset trạng thái
4. **Theo dõi logs theo thời gian thực** để hiểu flow hoạt động
5. **Sử dụng phím tắt** để nhanh chóng mở/đóng console
