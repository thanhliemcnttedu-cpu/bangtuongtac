-- =====================================================================
-- CẬP NHẬT ĐỢT C: THỜI KHÓA BIỂU (nhập từ Excel) VÀ LỊCH CÔNG TÁC
-- Chạy MỘT LẦN trong Supabase -> SQL Editor -> New query -> Run. Chạy lại nhiều lần vẫn an toàn.
-- Chỉ THÊM bảng mới; không đổi tên hay xóa gì của dữ liệu đang có.
-- Mọi bảng gắn với bảng việc riêng của chủ tài khoản và chỉ chủ (hoặc người quản lý bảng đó) đọc / ghi được.
-- Cách quay lại: drop table if exists public.timetable_notes, public.timetable_entries, public.timetables, public.calendar_events;
-- =====================================================================

-- 1) Thời khóa biểu theo học kỳ / năm học
create table if not exists public.timetables (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null,
  school_year text not null default '',
  term text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists timetables_board_idx on public.timetables(board_id);

-- 2) Các tiết học (mẫu lặp hằng tuần): weekday 1 = Thứ 2 ... 7 = Chủ nhật
create table if not exists public.timetable_entries (
  id uuid primary key default gen_random_uuid(),
  timetable_id uuid not null references public.timetables(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  weekday int not null check (weekday between 1 and 7),
  period int,
  start_time text not null default '',
  end_time text not null default '',
  subject text not null default '',
  class_name text not null default '',
  room text not null default '',
  location text not null default '',
  topic text not null default '',
  note text not null default '',
  attachments jsonb not null default '[]'::jsonb,   -- giáo án, bài trình chiếu, tài liệu gắn với tiết học
  created_at timestamptz not null default now()
);
create index if not exists timetable_entries_tt_idx on public.timetable_entries(timetable_id);

-- 3) Ghi chú sau tiết dạy theo từng ngày cụ thể
create table if not exists public.timetable_notes (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.timetable_entries(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  day date not null,
  note text not null default '',
  updated_at timestamptz not null default now(),
  unique (entry_id, day)
);

-- 4) Lịch công tác: họp, sinh hoạt tổ, dự giờ, kiểm tra, tập huấn, hội thi, nộp báo cáo…
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  title text not null,
  kind text not null default 'khac',
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text not null default '',
  description text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  task_id uuid references public.board_tasks(id) on delete set null,   -- việc được tạo từ sự kiện hoặc liên kết
  created_at timestamptz not null default now()
);
create index if not exists calendar_events_board_idx on public.calendar_events(board_id, starts_at);

alter table public.timetables enable row level security;
alter table public.timetable_entries enable row level security;
alter table public.timetable_notes enable row level security;
alter table public.calendar_events enable row level security;

drop policy if exists timetables_manage on public.timetables;
create policy timetables_manage on public.timetables for all using (public.is_board_manager(board_id)) with check (public.is_board_manager(board_id));
drop policy if exists timetable_entries_manage on public.timetable_entries;
create policy timetable_entries_manage on public.timetable_entries for all using (public.is_board_manager(board_id)) with check (public.is_board_manager(board_id));
drop policy if exists timetable_notes_manage on public.timetable_notes;
create policy timetable_notes_manage on public.timetable_notes for all using (public.is_board_manager(board_id)) with check (public.is_board_manager(board_id));
drop policy if exists calendar_events_manage on public.calendar_events;
create policy calendar_events_manage on public.calendar_events for all using (public.is_board_manager(board_id)) with check (public.is_board_manager(board_id));
