# Quiz Helper Extension - Trợ lý Đáp án Trắc nghiệm

Extension Chrome/Edge giúp lưu và gợi ý đáp án cho các câu hỏi trắc nghiệm trực tuyến.

## Tính năng

✅ **Tự động thêm nút "Lưu đáp án"** bên cạnh nút Next khi có đáp án đúng
✅ **Bôi vàng và gợi ý đáp án** cho những câu hỏi đã gặp trước đó  
✅ **Lưu trữ dữ liệu bền vững** - không bị mất khi tắt trình duyệt
✅ **Xuất/Nhập dữ liệu** - sao lưu và chia sẻ giữa các thiết bị
✅ **Nút bật/tắt extension** - dễ dàng kiểm soát
✅ **Thống kê** - xem số câu đã lưu và dung lượng sử dụng

## Cài đặt

### Cách 1: Cài đặt từ Chrome Web Store (Sắp có)
*Tính năng này sẽ có sau khi extension được phê duyệt*

### Cách 2: Cài đặt thủ công (Developer Mode)

1. **Tải xuống extension:**
   - Tải folder `quiz-helper-extension` về máy
   - Hoặc clone repository này

2. **Bật Developer Mode:**
   - Mở Chrome/Edge
   - Vào `chrome://extensions/` hoặc `edge://extensions/`
   - Bật "Developer mode" ở góc trên phải

3. **Cài đặt extension:**
   - Nhấn "Load unpacked"
   - Chọn folder `quiz-helper-extension`
   - Extension sẽ xuất hiện trong danh sách

4. **Tạo icons (tùy chọn):**
   - Tạo 4 file icon: 16x16, 32x32, 48x48, 128x128 pixels
   - Đặt vào folder `icons/` với tên: icon16.png, icon32.png, icon48.png, icon128.png
   - Reload extension để áp dụng

## Sử dụng

### Lưu đáp án mới
1. Làm bài trắc nghiệm như bình thường
2. Khi thấy đáp án đúng (thường sau khi submit), nút "💾 Lưu đáp án" sẽ xuất hiện
3. Nhấn nút để lưu đáp án vào cơ sở dữ liệu

### Xem gợi ý
1. Khi gặp lại câu hỏi đã lưu, đáp án đúng sẽ được:
   - Bôi vàng với viền cam nhấp nháy
   - Có icon 💡 ở góc phải
   - Hiển thị thông báo "Gợi ý" ở đầu câu hỏi

### Quản lý dữ liệu
1. **Mở popup:** Nhấn icon extension trên thanh công cụ
2. **Bật/tắt:** Dùng switch để bật/tắt extension
3. **Thống kê:** Xem số câu đã lưu và dung lượng
4. **Xuất dữ liệu:** Nhấn "📤 Xuất dữ liệu" → Copy hoặc tải file
5. **Nhập dữ liệu:** Nhấn "📥 Nhập dữ liệu" → Dán JSON hoặc chọn file
6. **Xóa dữ liệu:** Nhấn "🗑️ Xóa tất cả dữ liệu" (cẩn thận!)

## Cấu trúc dữ liệu

Extension lưu dữ liệu theo format JSON:
```json
{
  "answers": {
    "hash123": {
      "question": "Câu hỏi...",
      "correctAnswer": "Đáp án đúng",
      "allAnswers": [...],
      "timestamp": 1640000000000,
      "url": "https://example.com"
    }
  },
  "exportDate": "2024-01-01T00:00:00.000Z",
  "version": "1.0"
}
```

## Khắc phục sự cố

### Extension không hoạt động
- Kiểm tra extension có được bật không
- Refresh trang web
- Kiểm tra console (F12) xem có lỗi không

### Nút "Lưu đáp án" không xuất hiện  
- Đảm bảo trang đã hiển thị đáp án đúng
- Extension chỉ hoạt động khi detect được correct answer
- Thử scroll để trigger MutationObserver

### Gợi ý không chính xác
- Extension so sánh câu hỏi bằng hash
- Nếu câu hỏi thay đổi format có thể gây sai lệch
- Có thể xóa dữ liệu cũ và lưu lại

### Dữ liệu bị mất
- Dữ liệu lưu trong Chrome Storage, không bị xóa khi xóa cache
- Nếu gỡ extension thì mất dữ liệu
- Nên xuất backup thường xuyên

## Bảo mật & Quyền riêng tư

- **Dữ liệu được lưu offline** trên máy tính của bạn
- **Không gửi thông tin lên server** nào
- **Chỉ hoạt động trên các trang web** bạn cho phép
- **Có thể xuất dữ liệu** để kiểm soát hoàn toàn

## Hỗ trợ

### Báo lỗi
- Tạo issue trên GitHub
- Đính kèm screenshot và thông tin:
  - Version trình duyệt
  - URL trang web
  - Thông báo lỗi trong console

### Đóng góp
- Fork repository
- Tạo branch mới cho feature
- Submit pull request

## License

MIT License - Xem file LICENSE để biết chi tiết.

## Changelog

### v1.0.0
- ✨ Tính năng lưu và gợi ý đáp án
- ✨ Xuất/nhập dữ liệu  
- ✨ Popup quản lý
- ✨ Bật/tắt extension
- ✨ Thống kê sử dụng
