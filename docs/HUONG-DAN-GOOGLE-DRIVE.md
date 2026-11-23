# Lưu bài học sinh nộp vào Google Drive của giáo viên

Không cần Google Cloud, không cần sửa Vercel. Làm **một lần, khoảng 3 phút**, ngay trong trang web.

Sau khi kết nối:
- Học sinh nộp tệp (ảnh, PDF, PowerPoint…) → tệp vào **thẳng Drive của giáo viên**, trong thư mục
  `Bảng tương tác lớp học / <Tên bảng> · <mã> / Bài nộp /`.
- Phần chữ (tên em, câu trả lời, điểm, nhận xét) vẫn lưu trong hệ thống vì rất nhẹ và cần để bảng hiện nhanh.
- Giáo viên xóa bài → tệp tương ứng trên Drive được chuyển vào thùng rác của Drive.
- Nút **Thêm → Google Drive của tôi** còn sao lưu bảng (tệp `bang.json` gọn) và chuyển tệp cũ từ hệ thống sang Drive.

## Cách kết nối
1. Mở một bảng → nút **Thêm** → **Lưu lên Google Drive của tôi…**
2. **Bước 1:** bấm **Sao chép mã**.
3. **Bước 2:** mở https://script.google.com/home/projects/create (đúng Gmail của bạn):
   - Xóa hết chữ trong khung soạn thảo, dán mã (Ctrl+V), bấm biểu tượng **Lưu**.
   - Bấm nút xanh **Triển khai** → **Lượt triển khai mới** → bánh răng → **Ứng dụng web**.
   - **Thực thi với tư cách:** `Tôi`. **Ai có quyền truy cập:** `Bất kỳ ai`. Bấm **Triển khai**.
   - Google hỏi quyền → **Cho phép truy cập** → chọn Gmail. Nếu thấy "Google chưa xác minh ứng dụng": **Nâng cao** → **Chuyển tới … (không an toàn)** → **Cho phép** (đây là mã của chính bạn).
   - Bấm **Sao chép** ở dòng **URL ứng dụng web**.
4. **Bước 3:** dán địa chỉ vào ô trong trang, bấm **Kết nối**. Trang tự thử gọi cổng; thành công thì hiện "Đã kết nối".

Mặc định cổng áp dụng cho mọi bảng của bạn (và các bảng tạo sau).

## Cần biết
- **Tệp lớn tới 1 GB** (mã cổng phiên bản 2 trở lên): tệp trên 30 MB được tải theo từng phần 8 MB thẳng lên Drive, có thể mất vài phút tùy mạng. Tài liệu giáo viên chỉ chuyển sang Drive khi tệp lớn hơn 50 MB; bài nộp của học sinh luôn vào Drive.
- **Đã dùng bản cũ của cổng?** Dán mã mới đè lên mã cũ trong Apps Script, rồi **Triển khai → Quản lý lượt triển khai →** bút chì **→ Phiên bản mới → Triển khai** (địa chỉ giữ nguyên). Chưa cập nhật thì tệp lớn trên 30 MB báo lỗi rõ ràng, tệp nhỏ vẫn chạy bình thường.
- **Mật khẩu cổng** do trang tự tạo và nằm trong mã bạn dán. Học sinh mở bảng cần mật khẩu này để gửi tệp nên nó nằm trong cài đặt công khai của bảng. Nó chỉ ngăn người lạ không có link bảng gửi tệp rác. Nếu bị lạm dụng: vào Apps Script bấm **Triển khai → Quản lý lượt triển khai** để vô hiệu hóa, rồi kết nối lại cổng mới.
- **Xem tệp:** cổng đặt quyền "ai có liên kết đều xem". Mã tệp là chuỗi dài khó đoán, nhưng ai có liên kết thì xem được. Có thể đổi quyền từng tệp trong Drive.
- Cổng **chỉ làm việc trong thư mục "Bảng tương tác lớp học"**: không đọc, không xóa gì ngoài thư mục đó.
- Mỗi lần nộp có tệp chậm thêm khoảng 2–5 giây. Nếu cổng lỗi, hệ thống tự lưu tệp vào kho cũ để học sinh vẫn nộp được.
- Không còn dùng Google Cloud hay biến `VITE_GOOGLE_CLIENT_ID`: bỏ qua mọi hướng dẫn cũ về việc đó.
