# Hướng dẫn nối Gmail thật: Google Cloud OAuth + Supabase

Làm theo thứ tự A → B → C → D. Bản mẫu chạy được mà chưa cần các bước này; khi chưa có `.env` ứng dụng tự dùng tài khoản mẫu.

## Bước A. Tạo OAuth Client ID (Google Cloud Console)
1. Vào `console.cloud.google.com`, đăng nhập Gmail quản trị dự án.
2. **New Project** → đặt tên (ví dụ `bang-tuong-tac-lop-hoc`) → chọn đúng dự án vừa tạo.
3. **APIs & Services → OAuth consent screen**:
   - **External** nếu giáo viên nhiều trường dùng Gmail cá nhân; **Internal** chỉ khi cả tổ chức dùng Google Workspace.
   - Điền App name, User support email, Developer contact (Gmail của thầy) → Lưu.
   - Scopes giữ mức cơ bản: `openid`, `email`, `profile`.
   - Khi để External, ứng dụng ở trạng thái **Testing**: thêm từng Gmail giáo viên vào mục **Test users** (tối đa 100). Muốn ai cũng đăng nhập được thì bấm **Publish app** (với scope cơ bản không cần Google duyệt kéo dài).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins**: `http://localhost:5173` (chạy máy) và tên miền thật/Vercel khi xuất bản.
   - **Authorized redirect URIs**: `https://<ma-du-an-supabase>.supabase.co/auth/v1/callback` (lấy mã dự án ở Bước B).
5. Create → sao chép **Client ID** và **Client secret** (giữ kín, không dán vào chat/mã nguồn).

## Bước B. Tạo dự án Supabase và bật Google
1. `supabase.com` → New project (chọn vùng gần Việt Nam, ví dụ Singapore). Ghi lại mã dự án trong địa chỉ `https://<ma-du-an>.supabase.co`.
2. **Authentication → Providers → Google** → bật **Enable Sign in with Google** → dán Client ID và Client secret → Save.
3. **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:5173` (khi xuất bản đổi thành tên miền thật).
   - **Redirect URLs**: thêm `http://localhost:5173/**` và tên miền thật.
4. Quay lại Google Cloud, dán địa chỉ callback ở mục redirect URIs (Bước A.4) nếu chưa làm.

## Bước C. Tạo CSDL
1. Supabase → **SQL Editor** → New query → dán toàn bộ `docs/schema.sql` → Run.
2. Kiểm tra: **Table Editor** thấy `users`, `boards`, `board_collaborators`, `cards`, `comments`; mỗi bảng có biểu tượng khóa (RLS bật).
3. Trigger tạo hồ sơ giáo viên khi đăng nhập lần đầu đã nằm sẵn trong `schema.sql`; không cần chạy thêm.
4. Chạy `schema.sql` **trước** khi đăng nhập lần đầu (nếu đăng nhập trước, bảng `users` sẽ thiếu hồ sơ và tạo bảng sẽ báo lỗi).

## Bước D. Tạo tệp `.env` và thử đăng nhập
1. Supabase → **Project Settings → API**: sao chép **Project URL** và khóa **anon public** (KHÔNG dùng khóa `service_role`).
2. Trong thư mục dự án, sao chép `.env.example` thành `.env`:
```powershell
Copy-Item .env.example .env
```
3. Mở `.env` điền:
```
VITE_SUPABASE_URL=https://<ma-du-an>.supabase.co
VITE_SUPABASE_ANON_KEY=<khóa anon public>
```
Tệp `.env` đã nằm trong `.gitignore`, không đưa lên kho mã.
4. Chạy lại máy chủ (Vite chỉ đọc `.env` lúc khởi động):
```powershell
npm run dev
```
5. Mở `http://localhost:5173`, bấm avatar góc trên phải → **Thêm / chuyển tài khoản Google khác**. Kỳ vọng:
   - Google hiện **hộp chọn tài khoản** (nhờ `prompt=select_account`).
   - Chọn Gmail → quay lại trang, avatar hiện đúng tên Gmail; menu ghi "Tài khoản Google" (không còn "bản mẫu").
   - Supabase → **Authentication → Users** có dòng mới; bảng `users` có hồ sơ tương ứng.
   - Mở menu lần nữa, bấm "Thêm / chuyển…" để đăng nhập Gmail thứ hai; cả hai Gmail xuất hiện trong danh sách để chuyển nhanh.
6. Lỗi thường gặp:
   | Thông báo | Nguyên nhân |
   |---|---|
   | `redirect_uri_mismatch` | Redirect URI ở Google Cloud chưa đúng địa chỉ `/auth/v1/callback` của Supabase |
   | `Access blocked: app not verified` / 403 | Gmail chưa nằm trong Test users (app đang Testing) |
   | Quay về trang nhưng chưa đăng nhập | Redirect URLs của Supabase chưa có `http://localhost:5173/**` |
   | Đổi `.env` mà không có tác dụng | Chưa tắt và chạy lại `npm run dev` |

## Ghi chú về chuyển nhiều Gmail
Supabase giữ một phiên mỗi lần. Ứng dụng lưu danh sách Gmail đã dùng (chỉ email và tên) ở `localStorage`; bấm một Gmail trong danh sách sẽ đăng nhập lại với `login_hint` để Google chọn sẵn tài khoản đó. Mã phiên không được lưu lẫn nhau.

## Dùng thật
- Chưa có `.env`: ứng dụng chạy dữ liệu mẫu. Có `.env`: ứng dụng dùng Supabase; chưa đăng nhập sẽ thấy màn hình "Tiếp tục với Google".
- Bảng mới tạo xong: bấm **Chia sẻ & QR**, link có dạng `https://<tên-miền>/b/<mã>`; học sinh mở link là nộp bài không cần tài khoản.
- Khi đưa lên Vercel, giữ tệp `vercel.json` (đã có) để đường dẫn `/b/<mã>` mở được trực tiếp.
- Tải tệp: `schema.sql` tự tạo kho `board-files` (25 MB mỗi tệp; ảnh, video, âm thanh, PDF, Word, Excel, PowerPoint, văn bản). Ảnh được nén ở trình duyệt trước khi tải. Kho đọc công khai theo địa chỉ ngẫu nhiên, ghi chỉ khi bảng đang nhận bài.
- Chụp ảnh, quay video, ghi âm, quay màn hình cần trang chạy trên `https` hoặc `localhost` và người dùng bấm Cho phép.

## Chia sẻ bảng với giáo viên khác (theo Gmail)
Chủ bảng bấm **Chia sẻ & QR → tab “Giáo viên”**, nhập Gmail đồng nghiệp, chọn quyền, bấm **Mời**.

| Quyền | Làm được gì |
|---|---|
| **Chủ bảng** | Mọi thứ: mời / gỡ người khác, đóng bảng, xóa, thùng rác, nhân bản, đánh dấu mẫu. |
| **Đồng quản lý** | Duyệt bài, gắn sao, chấm điểm, sửa cài đặt, nhập danh sách, ghim tài liệu, xem nhật ký. Không đóng / xóa / chia sẻ bảng. |
| **Chỉ xem** | Xem toàn bộ bài nộp, danh sách sĩ số, bảng, báo cáo như giáo viên; không sửa được gì. |

- Người được mời đăng nhập **đúng Gmail đó** thì bảng hiện trong nhóm cuối của thanh chọn bảng (chữ nghiêng, kèm biểu tượng chia sẻ). Phần mềm **không tự gửi thư**: có nút “gửi thư mời” mở chương trình email của bạn với nội dung soạn sẵn.
- Mỗi bảng chia sẻ tối đa 20 giáo viên. Người được chia sẻ có thể tự **Rời khỏi bảng**; chủ bảng có thể mời lại.
- **Cần làm trước khi đồng nghiệp đăng nhập được:** nếu ứng dụng Google ở trạng thái **Testing** (Bước A.3), thêm Gmail của từng đồng nghiệp vào **Test users**; hoặc bấm **Publish app** để ai cũng đăng nhập được.
- Quyền được kiểm tra ở cơ sở dữ liệu (RLS), không chỉ ở giao diện. **Chạy lại cả tệp `schema.sql`** trên dự án trống vì các chính sách và trigger quyền đã thay đổi (hàm `is_board_owner`, `is_board_member`, trigger `boards_guard`, `collaborators_guard`).
- Bản mẫu (chưa có `.env`) có sẵn 3 Gmail mẫu và 4 bảng chia sẻ chéo: bấm avatar → chọn Gmail khác để thấy bảng đổi theo quyền.

## Bài học, bài tập / yêu cầu, tài liệu, chương trình tập huấn

Mỗi bảng là một **lớp** (lớp học hoặc lớp tập huấn nhỏ). Trong lớp có:

- **Bài học** (lớp học) hoặc **buổi tập huấn** (có thể ghi giờ diễn ra), mỗi bài có **tài liệu** riêng (tải nhiều tệp Word, Excel, PowerPoint, PDF, ảnh, âm thanh, video hoặc dán liên kết; xem trực tiếp trong trang) và **bài tập / yêu cầu**.
- **Tài liệu chung của lớp** (không thuộc bài học nào).
- **Bài tập / yêu cầu**: có hướng dẫn, giờ giao (hẹn giờ thì học sinh chưa thấy), hạn nộp, cho phép nộp muộn (bài được đánh dấu "Nộp muộn"), giao cho cả lớp hoặc chỉ một số tổ / nhóm / đơn vị, và giao thêm cho các lớp khác của giáo viên (sao chép kèm bài học và tài liệu).
- **Chương trình tập huấn**: đặt tên chương trình trong Cài đặt bảng để gom nhiều lớp tập huấn cạnh nhau trên thanh chọn bảng.

Máy chủ kiểm tra lại giờ giao, hạn nộp và đối tượng được giao trong trigger `cards_guard`. **Cần chạy lại toàn bộ `docs/schema.sql`** (có bảng mới `board_lessons`, cột mới của `board_tasks`, `cards.lesson_id`, `cards.late`, `boards.program`).
