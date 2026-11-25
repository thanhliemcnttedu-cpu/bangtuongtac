-- =====================================================================
-- CẬP NHẬT ĐỢT D: HỒ SƠ CHUYÊN MÔN (kho tài liệu cá nhân của giáo viên)
-- Chạy MỘT LẦN trong Supabase -> SQL Editor -> New query -> Run. Chạy lại nhiều lần vẫn an toàn.
-- Chỉ THÊM một bảng mới; không đổi tên hay xóa gì của dữ liệu đang có.
-- Gắn với bảng việc riêng của chủ tài khoản; chỉ chủ (hoặc người quản lý bảng đó) đọc / ghi được.
-- Tệp đính kèm đi qua đường tải tệp sẵn có (cổng Drive của giáo viên nếu đã nối, nếu chưa thì kho của hệ thống).
-- Cách quay lại: drop table if exists public.profile_docs;
-- =====================================================================
create table if not exists public.profile_docs (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  title text not null,
  category text not null default 'khac',
  school_year text not null default '',
  doc_date date,
  tags text[] not null default '{}',
  description text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists profile_docs_board_idx on public.profile_docs(board_id, doc_date desc);

alter table public.profile_docs enable row level security;
drop policy if exists profile_docs_manage on public.profile_docs;
create policy profile_docs_manage on public.profile_docs for all using (public.is_board_manager(board_id)) with check (public.is_board_manager(board_id));
