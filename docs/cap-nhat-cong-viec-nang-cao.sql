-- =====================================================================
-- CẬP NHẬT ĐỢT A: CÔNG VIỆC NÂNG CAO (nhóm việc, các mốc hạn, trạng thái mới, đầu việc thành phần, nhật ký)
-- Chạy MỘT LẦN trong Supabase -> SQL Editor -> New query -> Run. Chạy lại nhiều lần vẫn an toàn.
-- Chỉ THÊM cột và bảng mới; không đổi tên hay xóa cột cũ, không đụng tới dữ liệu đang có.
-- Cách quay lại: bỏ các cột / bảng mới (xem cuối tệp); phần mềm cũ vẫn chạy vì không dùng chúng.
-- Cần chạy sau: cap-nhat-cong-viec-cua-toi.sql và cap-nhat-dinh-ky.sql (hoặc tệp tổng hợp cap-nhat-tong-hop.sql).
-- =====================================================================

-- 1) Cột mới cho công việc (đều được để trống)
alter table public.board_tasks add column if not exists category text;              -- nhóm công việc (mã: giang_day, bao_cao…)
alter table public.board_tasks add column if not exists start_at timestamptz;       -- ngày bắt đầu
alter table public.board_tasks add column if not exists report_due_at timestamptz;  -- hạn báo cáo / nộp (khác hạn hoàn thành)
alter table public.board_tasks add column if not exists completed_at timestamptz;   -- ngày hoàn thành thực tế
alter table public.board_tasks add column if not exists repeat_until timestamptz;   -- ngày kết thúc lặp

-- 2) Trạng thái mở rộng: chờ bổ sung, hoãn, đã hủy (cột progress cũ vẫn dùng)
alter table public.board_tasks drop constraint if exists board_tasks_progress_chk;
alter table public.board_tasks add constraint board_tasks_progress_chk
  check (progress in ('todo','doing','waiting','postponed','cancelled','done'));

-- 3) Lặp thêm theo quý, học kỳ (6 tháng), năm
alter table public.board_tasks drop constraint if exists board_tasks_repeat_chk;
alter table public.board_tasks add constraint board_tasks_repeat_chk
  check (repeat_rule in ('none','daily','weekdays','weekly','monthly','quarterly','semester','yearly'));

-- 4) Đầu việc thành phần của một công việc tổng (ví dụ: kiểm tra từng giáo viên)
create table if not exists public.task_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.board_tasks(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  title text not null,                              -- tên đầu việc
  subject text not null default '',                 -- người hoặc đối tượng thực hiện / được kiểm tra
  planned_at timestamptz,                           -- ngày dự kiến
  status text not null default 'todo' check (status in ('todo','scheduled','doing','waiting','done','postponed','cancelled')),
  result text not null default '',                  -- nội dung kết quả thực hiện
  note text not null default '',
  started_at timestamptz,                           -- ngày bắt đầu thực tế
  done_at timestamptz,                              -- ngày hoàn thành thực tế
  sort int not null default 0,
  attachments jsonb not null default '[]'::jsonb,   -- minh chứng (tệp, liên kết, Drive); mỗi mục có thể kèm "group"
  deleted_at timestamptz,                           -- xóa mềm: khôi phục được
  created_at timestamptz not null default now()
);
create index if not exists task_items_task_idx on public.task_items(task_id, sort);
create index if not exists task_items_board_idx on public.task_items(board_id);
alter table public.task_items enable row level security;
drop policy if exists task_items_manage on public.task_items;
create policy task_items_manage on public.task_items for all
  using (public.is_board_manager(board_id)) with check (public.is_board_manager(board_id));

-- 5) Nhật ký tiến độ: CHỈ THÊM, không có chính sách sửa hoặc xóa nên không ai làm mất dấu vết cũ
create table if not exists public.task_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.board_tasks(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  item_id uuid,                                      -- đầu việc liên quan (trống = thao tác ở công việc tổng)
  actor text not null,                               -- Gmail người thao tác
  action text not null,                              -- tao_dau_viec, doi_trang_thai, doi_lich, cap_nhat_ket_qua, dinh_kem, hoan_thanh, mo_lai, xoa, khoi_phuc, ghi_chu…
  before jsonb,                                      -- nội dung trước khi đổi
  after jsonb,                                       -- nội dung sau khi đổi
  note text not null default '',                     -- lý do hoặc ghi chú
  created_at timestamptz not null default now()
);
create index if not exists task_logs_task_idx on public.task_logs(task_id, created_at desc);
alter table public.task_logs enable row level security;
drop policy if exists task_logs_read on public.task_logs;
drop policy if exists task_logs_insert on public.task_logs;
create policy task_logs_read on public.task_logs for select using (public.is_board_manager(board_id));
create policy task_logs_insert on public.task_logs for insert with check (public.is_board_manager(board_id));

-- ---------------------------------------------------------------------
-- QUAY LẠI (chỉ chạy khi thật sự cần bỏ tính năng; sẽ mất dữ liệu đầu việc và nhật ký):
--   drop table if exists public.task_logs;
--   drop table if exists public.task_items;
--   alter table public.board_tasks drop column if exists category, drop column if exists start_at,
--     drop column if exists report_due_at, drop column if exists completed_at, drop column if exists repeat_until;
--   (nếu đã có việc ở trạng thái mới, đưa về 'todo' trước khi trả ràng buộc về bộ giá trị cũ)
-- ---------------------------------------------------------------------
