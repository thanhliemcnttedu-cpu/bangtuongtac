-- =====================================================================
-- CẬP NHẬT: VIỆC LẶP HẰNG NGÀY VÀ CÁC NGÀY THỨ 2–6
-- Chạy MỘT LẦN trong Supabase -> SQL Editor -> New query -> Run. Chạy lại nhiều lần vẫn an toàn.
-- Trước đây việc định kỳ chỉ lặp hằng tuần hoặc hằng tháng. Thêm: 'daily' (hằng ngày) và 'weekdays' (thứ 2 đến thứ 6),
-- dùng cho việc như điểm danh lớp, báo cáo bán trú trước giờ cố định.
-- Phần này cũng đã nằm trong cap-nhat-tong-hop.sql; chạy tệp tổng hợp thì không cần chạy tệp này.
-- =====================================================================

alter table public.board_tasks add column if not exists repeat_rule text not null default 'none';
alter table public.board_tasks drop constraint if exists board_tasks_repeat_chk;
alter table public.board_tasks add constraint board_tasks_repeat_chk check (repeat_rule in ('none','daily','weekdays','weekly','monthly','quarterly','semester','yearly'));
