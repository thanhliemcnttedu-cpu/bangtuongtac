-- =====================================================================
-- CẬP NHẬT: CÔNG VIỆC CỦA TÔI (giai đoạn 2)
-- Chạy MỘT LẦN trong Supabase → SQL Editor → New query → Run. Chạy lại nhiều lần vẫn an toàn.
-- Chạy SAU docs/cap-nhat-to-cong-tac.sql.
-- Thêm: trạng thái / mức ưu tiên của việc (bảng việc riêng, Kanban), giao việc cho đúng người theo Gmail,
--       và hàm my_tasks() gom mọi việc giao cho tôi từ các bảng của người khác.
-- =====================================================================

alter table public.board_tasks add column if not exists progress text not null default 'todo';
alter table public.board_tasks add column if not exists priority text not null default 'normal';
-- Danh sách Gmail được giao riêng (rỗng = cả tổ / theo đơn vị). Cột này KHÔNG nằm trong get_board_public nên người có link không thấy.
alter table public.board_tasks add column if not exists assignee_emails text[] not null default '{}';

do $$ begin
  alter table public.board_tasks add constraint board_tasks_progress_chk check (progress in ('todo','doing','done'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.board_tasks add constraint board_tasks_priority_chk check (priority in ('high','normal','low'));
exception when duplicate_object then null; end $$;

-- Việc giao cho tôi: mọi bảng (của bất kỳ ai) có thành viên mang đúng Gmail đang đăng nhập.
-- Chỉ trả việc đã đến giờ giao, bảng chưa đóng / chưa vào thùng rác; việc giao riêng cho người khác thì bỏ qua.
create or replace function public.my_tasks() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if me = '' then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'board_id', b.id, 'board_title', b.title, 'share_token', b.share_token, 'owner_email', b.owner_email,
      'task_id', t.id, 'label', t.label, 'instructions', t.instructions, 'due_at', t.due_at, 'assigned_at', t.assigned_at,
      'allow_late', t.allow_late, 'needs_evidence', t.needs_evidence, 'ack_only', t.ack_only,
      'member_name', r.name, 'role', r.role,
      'done_at', (select min(c.created_at) from cards c where c.task_id = t.id and c.kind = 'submission'
                  and lower(btrim(c.author_name)) = lower(btrim(r.name)))
    ) order by t.due_at nulls last)
    from board_roster r
    join boards b on b.id = r.board_id and b.deleted_at is null and b.archived_at is null
    join board_tasks t on t.board_id = b.id and (t.assigned_at is null or t.assigned_at <= now())
    where lower(r.email) = me
      and (coalesce(array_length(t.assignee_emails, 1), 0) = 0 or me = any(t.assignee_emails))
  ), '[]'::jsonb);
end $$;
revoke all on function public.my_tasks from public;
grant execute on function public.my_tasks to authenticated;
