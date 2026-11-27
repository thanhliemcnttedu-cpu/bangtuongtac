-- =====================================================================
-- CẬP NHẬT: TỔ CHUYÊN MÔN (đợt 1)
-- Chạy MỘT LẦN trong Supabase → SQL Editor → New query → Run. Chạy lại nhiều lần vẫn an toàn.
-- Cần chạy docs/cap-nhat-tien-do-to.sql trước đó.
-- =====================================================================

-- 1) Hồ sơ thành viên. Chỉ chủ bảng và đồng quản lý đọc được (quyền sẵn có của board_roster);
--    danh sách công khai (get_roster_public) KHÔNG trả các cột này.
alter table public.board_roster add column if not exists gender text not null default '';
alter table public.board_roster add column if not exists birth_date text not null default '';
alter table public.board_roster add column if not exists homeroom text not null default '';
alter table public.board_roster add column if not exists teaching text not null default '';

-- 2) Lịch sử nộp lại: mỗi lần đổi tệp hoặc nộp lại ghi giờ máy chủ và tên tệp của bản mới.
alter table public.cards add column if not exists history jsonb not null default '[]'::jsonb;

create or replace function public.cards_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.history := old.history;
  if new.kind = 'submission' and (new.attachments is distinct from old.attachments or new.resubmitted_at is distinct from old.resubmitted_at) then
    new.history := (case when jsonb_array_length(old.history) >= 30 then old.history - 0 else old.history end)
      || jsonb_build_array(jsonb_build_object('at', now(),
           'files', coalesce((select jsonb_agg(a->>'name') from jsonb_array_elements(coalesce(new.attachments, '[]'::jsonb)) a), '[]'::jsonb)));
  end if;
  return new;
end $$;
drop trigger if exists cards_history_trg on public.cards;
create trigger cards_history_trg before update on public.cards for each row execute function public.cards_history();

-- 3) Việc giao cho một số người: khung tiến độ chỉ cần TÊN người được giao (không trả Gmail).
create or replace function public.get_task_assignees(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b boards;
begin
  select * into b from boards where share_token = p_token and deleted_at is null;
  if not found or coalesce(b.settings->>'scope', '') <> 'team' then return '{}'::jsonb; end if;
  return coalesce((
    select jsonb_object_agg(t.id, coalesce((
      select jsonb_agg(r.name) from board_roster r
      where r.board_id = b.id
        and ((r.email <> '' and lower(r.email) = any(t.assignee_emails))
             or ('ten:' || lower(regexp_replace(btrim(r.name), '\s+', ' ', 'g'))) = any(t.assignee_emails))
    ), '[]'::jsonb))
    from board_tasks t where t.board_id = b.id and coalesce(array_length(t.assignee_emails, 1), 0) > 0
  ), '{}'::jsonb);
end $$;
grant execute on function public.get_task_assignees to anon, authenticated;
