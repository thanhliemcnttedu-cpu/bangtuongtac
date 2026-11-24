-- =====================================================================
-- CẬP NHẬT: ĐIỂM DANH LỚP TẬP HUẤN (giai đoạn 4, phần tập huấn)
-- Chạy MỘT LẦN trong Supabase → SQL Editor → New query → Run. Chạy lại nhiều lần vẫn an toàn.
-- Mỗi dòng = một người có mặt ở một buổi (ngày). Dòng có name_key rỗng là "dấu buổi": buổi tồn tại dù chưa ai được điểm danh.
-- Chỉ chủ bảng và đồng quản lý đọc / ghi được; người có link không thấy.
-- =====================================================================

create table if not exists public.board_attendance (
  board_id uuid not null references public.boards(id) on delete cascade,
  day date not null,
  name_key text not null default '',
  label text not null default '',
  created_at timestamptz not null default now(),
  primary key (board_id, day, name_key)
);

alter table public.board_attendance enable row level security;

do $$ begin
  create policy attendance_manage on public.board_attendance for all
    using (public.is_board_manager(board_id)) with check (public.is_board_manager(board_id));
exception when duplicate_object then null; end $$;
