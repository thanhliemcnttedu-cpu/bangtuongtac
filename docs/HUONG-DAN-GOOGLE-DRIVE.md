# Bật tính năng "Lưu lên Google Drive của tôi"

Tính năng này cho giáo viên lưu bản sao bảng (tệp JSON gọn) và tệp bài nộp vào **Google Drive của chính tài khoản đang đăng nhập**, rồi có thể chuyển hẳn tệp sang Drive để giải phóng dung lượng hệ thống. Xóa bài trên bảng thì tệp trên Drive cũng được xóa theo.

Ứng dụng chỉ xin quyền `drive.file`: chỉ thấy và sửa các tệp **do chính ứng dụng tạo ra**, không đọc được phần còn lại của Drive. Mã truy cập chỉ nằm trong bộ nhớ của trang, không gửi đi đâu và không lưu lại.

Làm một lần, khoảng 5 phút, trong cùng dự án Google Cloud đang dùng để đăng nhập Google.

## 1. Bật Google Drive API
1. Vào https://console.cloud.google.com, chọn đúng dự án (dự án có OAuth client `bang-tuong-tac`).
2. Menu **APIs & Services → Library** (Thư viện), tìm **Google Drive API**, bấm **Enable** (Bật).

## 2. Thêm quyền `drive.file` vào màn hình đồng ý
1. **APIs & Services → OAuth consent screen** (hoặc **Google Auth Platform → Data Access**).
2. Bấm **Add or remove scopes** (Thêm phạm vi), tìm `.../auth/drive.file`, tick, **Update**, **Save**.
3. `drive.file` thuộc nhóm không nhạy cảm nên không cần Google xét duyệt.
4. Nếu muốn **thầy cô khác ngoài danh sách thử nghiệm** dùng được: ở mục **Audience** (Đối tượng) bấm **Publish app** (Chuyển sang sản xuất). Để nguyên "Testing" thì chỉ các Gmail trong danh sách người dùng thử mới dùng được.

## 3. Cho phép trang web dùng mã khách
1. **APIs & Services → Credentials → OAuth 2.0 Client IDs →** chọn `bang-tuong-tac`.
2. Mục **Authorized JavaScript origins** (Nguồn JavaScript được phép), bấm **Add URI** và thêm:
   - `https://bangtuongtac.vercel.app`
   - `http://localhost:5173` (nếu muốn thử trên máy)
3. **Save**. Phần **Authorized redirect URIs** của Supabase giữ nguyên, không sửa.
4. Sao chép **Client ID** (chuỗi kết thúc bằng `.apps.googleusercontent.com`). Đây là mã công khai, không phải khóa bí mật; **không** dùng Client secret ở đây.

## 4. Khai báo cho trang
- **Máy bạn:** thêm vào tệp `.env`:
  ```
  VITE_GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
  ```
- **Trang thật (Vercel):** Project → Settings → Environment Variables, thêm `VITE_GOOGLE_CLIENT_ID` với giá trị trên, rồi **Redeploy**.

## 5. Dùng thử
Mở một bảng → nút **Thêm → Lưu lên Google Drive của tôi…** → chọn cần lưu gì → **Lưu lên Google Drive**. Lần đầu Google hiện cửa sổ xin quyền: chọn đúng Gmail rồi bấm **Cho phép** (nếu thấy cảnh báo "Google chưa xác minh ứng dụng" ở chế độ Testing thì chọn **Nâng cao → Tiếp tục**).

Kết quả trên Drive:
```
Bảng tương tác lớp học /
  <Tên bảng> · <mã> /
    bang.json        (bản sao bảng, chỉ chữ nên rất nhẹ)
    Bài nộp /        (tệp của học sinh, đặt tên: Họ tên - Tên bài - Tên tệp)
```

## Lưu ý
- **Chuyển hẳn sang Drive**: sau đó học sinh không xem được nội dung tệp trong trang (tệp nằm riêng tư trên Drive của giáo viên). Bài nộp vẫn hiện tên tệp và nút "Mở trên Drive" cho giáo viên.
- Xóa bài (từng bài, hàng loạt, hoặc "Xóa hết bài nộp") sẽ xóa **vĩnh viễn** tệp trên Drive và trên kho hệ thống. Nếu Google từ chối (hết quyền, mất mạng), thông báo ghi rõ số tệp chưa xóa được để bạn xóa tay.
- Ứng dụng chỉ xóa được tệp do chính nó tạo. Tệp bạn tự chép vào thư mục đó thì ứng dụng không đụng tới.
- Mã truy cập hết hạn sau khoảng 1 giờ; hết hạn thì lần lưu hoặc xóa tiếp theo sẽ hiện lại cửa sổ của Google.
