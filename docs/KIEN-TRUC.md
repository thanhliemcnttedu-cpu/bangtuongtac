# Kiến trúc công nghệ – Bảng tương tác lớp học & tập huấn

## 1. Ngăn xếp đề xuất (miễn phí / chi phí thấp)

| Lớp | Lựa chọn | Lý do |
|---|---|---|
| Giao diện | **Next.js (App Router) + React + Tailwind CSS** | Một dự án làm cả giao diện lẫn API nhẹ; phông Be Vietnam Pro qua `next/font`. |
| Đăng nhập | **Supabase Auth – Google OAuth** | Một chạm, lấy tên/email/ảnh; có `queryParams: { prompt: 'select_account' }` để hiện hộp chọn Gmail. |
| CSDL | **Supabase Postgres + RLS** | Quy tắc phân quyền nằm ngay trong CSDL, khách không đăng nhập vẫn đăng bài an toàn qua RPC. |
| Tệp | **Supabase Storage** (bucket `board-files`) | Gói miễn phí 1 GB; ảnh nén phía trình duyệt trước khi tải. |
| Thời gian thực | **Supabase Realtime** | Bài mới hiện ngay trên màn chiếu. |
| Mã QR | thư viện `qrcode` (sinh ở trình duyệt) | Không gọi dịch vụ ngoài. |
| Xuất CSV | tạo ở trình duyệt, thêm BOM UTF-8 | Excel mở đúng tiếng Việt. |
| Triển khai | **Vercel** (gói Hobby) + Supabase Free | Chi phí 0 đồng cho lớp nhỏ; nâng gói khi cần. |

## 2. Cách khách không có tài khoản đăng bài

Khách đăng bài bằng hai cách: INSERT trực tiếp (chính sách `cards_guest_insert` + trigger chống spam) hoặc gọi hàm Postgres `submit_card(...)` (RPC, `SECURITY DEFINER`):
1. Tìm bảng theo `share_token`; kiểm tra `link_mode = 'guest_post'` và chưa khóa.
2. Giới hạn tần suất theo `session_id` (tối đa 5 bài / 10 phút) và độ dài chữ.
3. Đặt `status = 'pending'` nếu bảng bật "Duyệt trước", ngược lại `approved`.
4. Trả về `edit_token` ngẫu nhiên; trình duyệt lưu vào `localStorage`. Sửa/xóa bài qua `edit_card(card_id, edit_token, ...)` chỉ trong 15 phút đầu.

Khách (`anon`) chỉ được `INSERT` thẻ loại bài nộp khi `allow_guest_post` bật, không được tự UPDATE/DELETE; xem bài đã duyệt qua hàm `get_board_public`. Sửa/xóa bài của mình qua `edit_card` bằng `edit_token`.

## 3. Phân quyền link

| Chế độ `link_mode` | Người mở link | Quyền |
|---|---|---|
| `view` | Khách, phụ huynh | Chỉ xem tài liệu và bài đã duyệt |
| `guest_post` | Học sinh/học viên | Xem + nút `+` đăng bài, sửa bài mình 15 phút |
| `locked` | Mọi người | Chỉ xem, nút `+` bị khóa |

Chủ bảng và đồng quản lý (đăng nhập Gmail) có toàn quyền qua RLS theo `board_collaborators`.

## 4. Nhiều tài khoản Gmail
Supabase giữ một phiên mỗi lần. Cách làm: lưu danh sách tài khoản đã đăng nhập (email, ảnh) trong `localStorage`; "Chuyển tài khoản" gọi `signInWithOAuth` với `prompt=select_account`; mỗi phiên cũ được cất refresh token mã hóa trong IndexedDB để đổi qua lại không cần đăng nhập lại. Mời đồng quản lý bằng email: bản ghi `board_collaborators` lưu `email`, khi người đó đăng nhập đúng Gmail thì `user_id` được gắn tự động (trigger).

## 5. Lộ trình
1. Bản mẫu giao diện React + TypeScript + Tailwind (đã có: `src/`, chạy `npm run dev`).
2. Tạo dự án Supabase, chạy `docs/schema.sql`, bật Google OAuth (cần Client ID do người dùng tạo ở Google Cloud).
3. Dựng Next.js, thay dữ liệu giả bằng Supabase client.
4. Thử với một lớp thật, đo dung lượng ảnh, chỉnh giới hạn.
