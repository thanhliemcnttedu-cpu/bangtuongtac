-- =====================================================================
-- CẬP NHẬT: TỔ / NHÓM CÔNG TÁC (giai đoạn 1)
-- Chạy MỘT LẦN trong Supabase → SQL Editor → New query → Run. Chạy lại nhiều lần vẫn an toàn.
-- Thêm: vai trò + Gmail cho thành viên; tài liệu / yêu cầu minh chứng cho công việc;
--       chế độ "chỉ nhận tên trong danh sách" và "chỉ xem bài của mình" cho bảng tổ công tác.
-- =====================================================================

-- 1) Thành viên: vai trò (Tổ trưởng, Tổ phó, Bí thư…) và Gmail (tùy chọn)
alter table public.board_roster add column if not exists role text not null default '';
alter table public.board_roster add column if not exists email text not null default '';

-- 2) Công việc: tài liệu / liên kết đính kèm, có yêu cầu minh chứng hay chỉ cần bấm "Tôi đã đọc"
alter table public.board_tasks add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.board_tasks add column if not exists needs_evidence boolean not null default false;
alter table public.board_tasks add column if not exists ack_only boolean not null default false;

-- 3) Khách xem bảng: công việc có thêm 3 trường mới; bảng đặt "chỉ xem bài của mình" (privateView) thì không trả bài của người khác
create or replace function public.get_board_public(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b boards;
begin
  select * into b from boards where share_token = p_token and deleted_at is null;
  if not found then return null; end if;
  return jsonb_build_object(
    'board', jsonb_build_object('id', b.id, 'title', b.title, 'mode', b.mode, 'layout', b.layout,
              'goals', b.goals, 'link_mode', case when b.archived_at is null then b.link_mode else 'locked' end, 'archived_at', b.archived_at, 'allow_comments', b.allow_comments, 'share_token', b.share_token, 'settings', b.settings),
    'program', b.program,
    'lessons', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'description', l.description,
                                                              'starts_at', l.starts_at, 'ends_at', l.ends_at) order by l.sort)
              from board_lessons l where l.board_id = b.id), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label, 'lesson_id', t.lesson_id, 'kind', t.kind,
                                                            'instructions', t.instructions, 'assigned_at', t.assigned_at, 'due_at', t.due_at,
                                                            'allow_late', t.allow_late, 'target_units', t.target_units,
                                                            'attachments', t.attachments, 'needs_evidence', t.needs_evidence, 'ack_only', t.ack_only) order by t.sort)
              from board_tasks t where t.board_id = b.id and (t.assigned_at is null or t.assigned_at <= now())), '[]'::jsonb),
    'votes', coalesce((select jsonb_agg(jsonb_build_object('card_id', v.card_id, 'option_id', v.option_id, 'n', v.n))
              from (select card_id, option_id, count(*) as n from card_votes
                    where card_id in (select id from cards where board_id = b.id) group by card_id, option_id) v), '[]'::jsonb),
    'ratings', coalesce((select jsonb_agg(jsonb_build_object('card_id', r.card_id, 'n', r.n, 'sum', r.s))
              from (select card_id, count(*) as n, sum(stars) as s from card_ratings
                    where card_id in (select id from cards where board_id = b.id) group by card_id) r), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'card_id', m.card_id, 'author', m.author_name,
                                                              'body', m.body, 'at', m.created_at) order by m.created_at)
              from comments m where m.board_id = b.id and m.status = 'visible'
              and not coalesce((b.settings->>'privateView')::boolean, false)), '[]'::jsonb),
    -- privateView = bật: khách chỉ nhận tài liệu của giáo viên, KHÔNG nhận bài nộp của ai (thành viên xem bài của mình qua tên).
    'cards', coalesce((select jsonb_agg((case when coalesce((b.settings->>'showGrades')::boolean, false) then to_jsonb(c) else to_jsonb(c) - 'grade' end) - 'edit_token' - 'session_id' order by c.created_at desc)
              from cards c where c.board_id = b.id
              and (c.kind = 'resource'
                   or (c.status in ('approved','featured') and not coalesce((b.settings->>'privateView')::boolean, false)))), '[]'::jsonb));
end $$;
grant execute on function public.get_board_public to anon, authenticated;

-- 4) Danh sách công khai (để thành viên chọn tên): thêm vai trò; KHÔNG trả Gmail
create or replace function public.get_roster_public(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b boards;
begin
  select * into b from boards where share_token = p_token and deleted_at is null;
  if not found then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('name', r.name, 'unit', r.unit, 'role', r.role) order by r.name) from board_roster r where r.board_id = b.id), '[]'::jsonb);
end $$;
grant execute on function public.get_roster_public to anon, authenticated;

-- 5) Chốt chặn nộp bài: bảng bật "chỉ nhận tên trong danh sách" (rosterOnly) thì tên người nộp phải có trong danh sách
create or replace function public.cards_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare t board_tasks;
begin
  if public.is_board_manager(new.board_id) then return new; end if;
  new.late := false;
  if length(coalesce(new.body,'')) > 5000 or length(coalesce(new.title,'')) > 200 then
    raise exception 'Nội dung quá dài'; end if;
  if (select count(*) from cards where board_id = new.board_id and session_id = new.session_id
      and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'Gửi quá nhanh, vui lòng đợi vài phút'; end if;
  if (select mode from boards where id = new.board_id) = 'training'
     and coalesce((select settings->>'scope' from boards where id = new.board_id), '') <> 'team'
     and length(trim(coalesce(new.group_name,''))) = 0 then
    raise exception 'Cần nhập trường / đơn vị'; end if;
  if new.kind = 'submission'
     and coalesce((select (settings->>'rosterOnly')::boolean from boards where id = new.board_id), false)
     and not exists (select 1 from board_roster r where r.board_id = new.board_id
                     and lower(btrim(r.name)) = lower(btrim(coalesce(new.author_name,'')))) then
    raise exception 'Tên này không có trong danh sách của bảng. Hãy chọn đúng tên của bạn.';
  end if;
  if new.kind = 'submission' and new.task_id is not null then
    select * into t from board_tasks where id = new.task_id and board_id = new.board_id;
    if not found then raise exception 'Bài tập không thuộc bảng này'; end if;
    if t.assigned_at is not null and t.assigned_at > now() then raise exception 'Bài tập này chưa được giao'; end if;
    if t.due_at is not null and t.due_at < now() then
      if not t.allow_late then raise exception 'Đã quá hạn nộp bài tập này'; end if;
      new.late := true;
    end if;
    if coalesce(array_length(t.target_units, 1), 0) > 0 and not (trim(coalesce(new.group_name,'')) = any(t.target_units)) then
      raise exception 'Bài tập này chỉ giao cho: %', array_to_string(t.target_units, ', ');
    end if;
  end if;
  if new.kind = 'submission' then
    new.status := case coalesce((select settings->>'moderation' from boards where id = new.board_id), 'manual')
      when 'off' then 'approved'
      when 'auto' then case when public.post_flagged(new.author_name, new.group_name, new.title, new.body, new.poll, new.attachments)
                            then 'pending' else 'approved' end
      else 'pending'
    end;
  end if;
  return new;
end $$;
