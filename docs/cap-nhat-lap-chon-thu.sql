-- =====================================================================
-- CẬP NHẬT: LẶP THEO CÁC THỨ ĐÃ CHỌN (ví dụ Thứ 2 đến Thứ 5 cho báo cáo bán trú)
-- Chạy MỘT LẦN trong Supabase -> SQL Editor -> New query -> Run. Chạy lại nhiều lần vẫn an toàn.
-- Giá trị mới của repeat_rule: 'days:' kèm các thứ, 1 = Thứ 2 ... 7 = Chủ nhật. Ví dụ 'days:1234'.
-- Chỉ nới ràng buộc kiểm tra; không đổi dữ liệu đang có.
-- Cách quay lại: đổi các việc 'days:...' về 'none' rồi chạy lại phần ràng buộc của cap-nhat-cong-viec-nang-cao.sql.
-- =====================================================================
alter table public.board_tasks drop constraint if exists board_tasks_repeat_chk;
alter table public.board_tasks add constraint board_tasks_repeat_chk
  check (repeat_rule in ('none','daily','weekdays','weekly','monthly','quarterly','semester','yearly') or repeat_rule ~ '^days:[1-7]{1,7}$');
