# Đặc tả: Quản lý tổ chuyên môn (bản nháp để duyệt)

## 1. Mục đích
Tổ trưởng, tổ phó giao việc và theo dõi cả tổ ở một nơi, thay cho gọi điện và gửi qua Zalo.

## 2. Đối chiếu yêu cầu với phần mềm hiện có

| # | Yêu cầu | Hiện trạng | Cần làm |
|---|---|---|---|
| 1 | Danh sách thành viên: họ tên, giới tính, ngày sinh, chức vụ, lớp chủ nhiệm, nhiệm vụ giảng dạy | Mới có họ tên, vai trò, Gmail; nhập bằng cách dán | Thêm 4 cột; sửa từng người; nhập từ Excel |
| 2 | Dùng danh sách làm dữ liệu chung khi giao việc | Giao cả tổ hoặc theo nhóm | Chọn người, chọn theo chức vụ, theo khối/lớp |
| 3 | Tổ phó cùng quản lý | Đã có (mời đồng quản lý bằng Gmail) | Gắn ngay trong danh sách: bấm "Cho cùng quản lý" |
| 4 | Việc: báo cáo, điền phiếu, khảo sát, học tập qua link, nộp ảnh, nộp tệp | Đã có (cần minh chứng / chỉ đọc, kèm link, tệp, hạn, lặp) | Thêm "loại việc" để lọc và thống kê |
| 5 | Thành viên đăng nhập bằng mã riêng để nộp | Đang chọn tên trong danh sách, không xác thực | Mã cá nhân hoặc đăng nhập Google; máy chủ kiểm tra |
| 6 | Bảng theo dõi tuần/tháng: sớm, muộn, đã/chưa nộp, việc tồn | Có tiến độ từng việc, tổng hợp tuần/tháng | Một màn tổng quan: lưới người × việc, cột "còn tồn" |
| 7 | Nộp lại thì ghi dấu thời gian bản mới | Ghi giờ nộp lại và số lần (chưa tới giây) | Hiện giờ:phút:giây, ngày/tháng/năm; lịch sử từng lần |

## 3. Điều phải xử lý trước (bảo mật)
- Không dùng số căn cước công dân làm mật khẩu: số này nhiều người biết (hồ sơ, đồng nghiệp), lộ thì không đổi được, và là dữ liệu cá nhân cần bảo vệ.
- Hiện nay tệp nằm sau đường link ai có cũng mở được; gõ đúng tên là sửa được bài. Chưa đủ an toàn cho phiếu đánh giá, kiểm điểm, học bạ.
- Muốn nộp các hồ sơ đó cần: thành viên đăng nhập thật, máy chủ phân quyền (chỉ người nộp và tổ trưởng, tổ phó xem), kho tệp riêng tư với link có thời hạn.
- Hồ sơ đảng viên: cần hỏi quy định bảo mật của chi bộ trước khi đưa lên bất kỳ hệ thống nào (cần xác nhận).

## 4. Chia đợt
- Đợt 1: hồ sơ thành viên đầy đủ, nhập Excel, giao việc theo người/chức vụ, tổ phó, dấu thời gian đến giây và lịch sử nộp.
- Đợt 2: bảng tổng quan tuần/tháng (người × việc), xuất Excel.
- Đợt 3: đăng nhập thành viên và kho riêng tư cho hồ sơ nhạy cảm.

## 5. Ngoài phạm vi
Quản lý điểm và học bạ chính thức của học sinh (dùng phần mềm theo quy định của ngành).
