-- =====================================================================
-- CẬP NHẬT: VIỆC ĐỊNH KỲ (giai đoạn 3)
-- Chạy MỘT LẦN trong Supabase → SQL Editor → New query → Run. Chạy lại nhiều lần vẫn an toàn.
-- Chạy SAU docs/cap-nhat-cong-viec-cua-toi.sql.
-- Thêm: quy tắc lặp (hằng tuần / hằng tháng) và mã chuỗi cho việc định kỳ.
-- Kỳ mới do trang web tự sinh khi tổ trưởng (chủ bảng) mở bảng hoặc trang "Công việc của tôi"; không có tác vụ chạy ngầm trên máy chủ.
-- =====================================================================

alter table public.board_tasks add column if not exists repeat_rule text not null default 'none';
alter table public.board_tasks add column if not exists series_id uuid;

do $$ begin
  alter table public.board_tasks add constraint board_tasks_repeat_chk check (repeat_rule in ('none','weekly','monthly'));
exception when duplicate_object then null; end $$;
