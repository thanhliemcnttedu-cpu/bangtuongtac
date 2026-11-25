# Nhắc việc đẩy (nhận thông báo cả khi đã đóng trang)

Phần mềm có sẵn chuông nhắc việc khi đang mở trang. Muốn nhận nhắc **cả khi đã đóng trang** (như tin nhắn trên điện thoại), làm 5 bước dưới đây, **chỉ làm một lần**. Chưa làm thì mọi thứ khác vẫn chạy bình thường; nút "Nhắc đẩy" trong chuông sẽ báo "chưa cấu hình".

Cách hoạt động: trình duyệt đăng ký nhận thông báo → phần mềm lưu đăng ký vào Supabase → mỗi 15 phút Supabase gọi hàm `send-reminders` → hàm gửi nhắc việc sắp hạn / quá hạn / hạn báo cáo (mỗi nhắc một lần cho mỗi thiết bị).

## 1. Tạo cặp khóa VAPID

Trên máy tính, mở PowerShell trong thư mục dự án:

```powershell
npx web-push generate-vapid-keys
```

Ghi lại **Public Key** và **Private Key**. Khóa Private là bí mật: không đưa vào mã, không gửi cho ai.

## 2. Chạy SQL

Supabase → SQL Editor → chạy tệp `docs/cap-nhat-nhac-viec-day.sql` (đã gộp trong `cap-nhat-tong-hop.sql`). Chỉ phần tạo hai bảng chạy ngay; phần lịch ở cuối tệp đang là chú thích, làm ở bước 5.

## 3. Triển khai hàm gửi nhắc

Cần Supabase CLI (đăng nhập bằng `supabase login`, nối dự án bằng `supabase link --project-ref <MA-DU-AN>`). Đặt bí mật rồi triển khai:

```powershell
supabase secrets set VAPID_PUBLIC_KEY=<public key> VAPID_PRIVATE_KEY=<private key> VAPID_SUBJECT=mailto:<email của bạn> CRON_SECRET=<một chuỗi ngẫu nhiên dài>
supabase functions deploy send-reminders --no-verify-jwt
```

`--no-verify-jwt` là chủ ý: hàm tự kiểm tra tiêu đề `x-cron-secret`, ai không có `CRON_SECRET` thì bị từ chối (401).

## 4. Khai báo khóa công khai cho trang web

Trong Vercel → Settings → Environment Variables thêm `VITE_VAPID_PUBLIC_KEY` = **Public Key** (cho Production), rồi Redeploy. Khi chạy ở máy, thêm cùng dòng đó vào tệp `.env`.

## 5. Đặt lịch gọi hàm mỗi 15 phút

Trong tệp SQL, bỏ dấu `--` ở phần số 3, thay `<MA-DU-AN>` và `<CRON_SECRET>` bằng giá trị thật (cùng `CRON_SECRET` ở bước 3), rồi chạy. Cần bật tiện ích `pg_cron` và `pg_net` (Supabase → Database → Extensions).

## Thử

1. Mở phần mềm, bấm chuông → biểu tượng bánh răng → bật **Nhắc đẩy khi đã đóng trang** → cho phép thông báo.
2. Tạo một việc riêng có hạn trong vòng "Nhắc trước hạn" (ví dụ hạn sau 2 giờ, nhắc trước 1 ngày).
3. Đóng trang, đợi tối đa 15 phút: thông báo sẽ hiện; bấm vào thì mở trang "Việc của tôi".
4. Muốn thử ngay: Supabase → Edge Functions → `send-reminders` → Invoke, thêm tiêu đề `x-cron-secret`. Kết quả trả về số thiết bị và số nhắc đã gửi.

## Lưu ý

- **iPhone / iPad** (iOS 16.4 trở lên): nhắc đẩy chỉ chạy khi đã **Thêm vào Màn hình chính** (Chia sẻ → Thêm vào MH chính), rồi mở phần mềm từ biểu tượng đó và bật nhắc.
- **Android, Windows, macOS** (Chrome, Edge, Firefox): bật trực tiếp trên trình duyệt.
- Mỗi thiết bị bật riêng; cài đặt nhắc (trước hạn mấy giờ, loại nhắc) cũng riêng cho từng thiết bị.
- Thời gian nhắc có thể lệch tối đa 15 phút (chu kỳ lịch).
- Nhắc chỉ gửi cho việc cá nhân đang mở (chưa xong, chưa hoãn, chưa hủy); việc quá hạn quá 3 ngày không nhắc nữa.
- Tắt: gạt nút trong chuông (xóa đăng ký của thiết bị), hoặc `select cron.unschedule('nhac-viec-day');` để dừng toàn bộ.
