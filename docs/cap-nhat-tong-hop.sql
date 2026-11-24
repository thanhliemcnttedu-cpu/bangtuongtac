-- =====================================================================
-- CẬP NHẬT TỔNG HỢP: chạy MỘT LẦN trong Supabase → SQL Editor → New query → Run.
-- Gộp theo đúng thứ tự: sửa bài và làm mới, tệp nén, tổ công tác, công việc của tôi, định kỳ, lớp tập huấn.
-- Mỗi phần đều chạy lại được nhiều lần mà không hỏng dữ liệu, nên cài mới hay cập nhật đều dùng tệp này.
-- Chạy xong, mở phần mềm → chân trang → "Kiểm tra hệ thống" để xem còn thiếu gì không.
-- (Cần đã chạy docs/schema.sql một lần khi cài lần đầu.)
-- =====================================================================


-- ############ cap-nhat-sua-bai-va-lam-moi.sql ############
-- Hai tính năng mới (chạy một lần trong Supabase -> SQL Editor; chạy lại nhiều lần vẫn an toàn):
--   1) Tự làm mới: trang hỏi "dấu vân tay" của bảng mỗi 5 giây (rất nhẹ), có thay đổi mới tải lại dữ liệu.
--   2) Học sinh sửa / xóa bài của mình sau khi nộp bằng "mã sửa bài", không cần đăng nhập.

-- ===== 1) Dấu vân tay của bảng =====
-- Trả về một chuỗi băm của những gì người xem được thấy: bài, trạng thái, điểm, nhận xét, bình chọn, sao, cài đặt.
-- p_manage = true và người gọi là thành viên của bảng thì tính cả bài đang chờ duyệt.
create or replace function public.board_fingerprint(p_token text, p_manage boolean default false) returns text
language plpgsql stable security definer set search_path = public as $$
declare b boards; m boolean;
begin
  select * into b from boards where share_token = p_token and deleted_at is null;
  if not found then return null; end if;
  m := coalesce(p_manage, false) and public.is_board_member(b.id);
  return md5(
    coalesce((select string_agg(to_jsonb(c)::text, '|' order by c.id) from cards c
              where c.board_id = b.id), '')
    || '#' || coalesce((select string_agg(to_jsonb(cm)::text, '|' order by cm.id) from comments cm where cm.board_id = b.id and (m or cm.status = 'visible')), '')
    || '#' || coalesce((select string_agg(v.card_id::text || v.option_id, '|' order by v.card_id, v.session_id) from card_votes v join cards c on c.id = v.card_id where c.board_id = b.id), '')
    || '#' || coalesce((select string_agg(r.card_id::text || r.stars, '|' order by r.card_id, r.session_id) from card_ratings r join cards c on c.id = r.card_id where c.board_id = b.id), '')
    || '#' || coalesce((select string_agg(to_jsonb(t)::text, '|' order by t.id) from board_tasks t where t.board_id = b.id), '')
    || '#' || coalesce((select string_agg(to_jsonb(l)::text, '|' order by l.id) from board_lessons l where l.board_id = b.id), '')
    || '#' || coalesce(b.title, '') || b.link_mode || coalesce(b.archived_at::text, '') || coalesce(b.settings::text, ''));
end $$;
grant execute on function public.board_fingerprint to anon, authenticated;

-- ===== 2) Sửa / xóa bài bằng mã sửa bài =====
create or replace function public.get_card_by_code(p_token text, p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b boards; c cards;
begin
  select * into b from boards where share_token = p_token and deleted_at is null;
  if not found then return null; end if;
  select * into c from cards where board_id = b.id and kind = 'submission'
    and edit_token = upper(regexp_replace(coalesce(p_code,''), '[^A-Za-z0-9]', '', 'g'));
  if not found then return null; end if;
  return to_jsonb(c) - 'edit_token' - 'session_id' - 'grade';
end $$;
grant execute on function public.get_card_by_code to anon, authenticated;

create or replace function public.update_card_by_code(
  p_token text, p_code text, p_title text, p_body text, p_author text, p_group text, p_attachments jsonb, p_delete boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare b boards; c cards; t board_tasks; mode text; st text;
begin
  select * into b from boards where share_token = p_token and deleted_at is null;
  if not found then raise exception 'Không tìm thấy bảng'; end if;
  select * into c from cards where board_id = b.id and kind = 'submission'
    and edit_token = upper(regexp_replace(coalesce(p_code,''), '[^A-Za-z0-9]', '', 'g'));
  if not found then raise exception 'Mã sửa bài không đúng'; end if;
  if b.archived_at is not null or not b.allow_guest_post then raise exception 'Bảng đã đóng nhận bài nên không sửa được'; end if;
  if c.task_id is not null then
    select * into t from board_tasks where id = c.task_id;
    if found and t.due_at is not null and t.due_at < now() and not t.allow_late then
      raise exception 'Đã quá hạn nộp bài tập này, không sửa được'; end if;
  end if;
  if p_delete then delete from cards where id = c.id; return 'deleted'; end if;
  if length(trim(coalesce(p_title,''))) = 0 then raise exception 'Cần nhập tiêu đề'; end if;
  if length(trim(coalesce(p_author,''))) = 0 then raise exception 'Cần nhập họ tên'; end if;
  if length(coalesce(p_body,'')) > 5000 or length(coalesce(p_title,'')) > 200 then raise exception 'Nội dung quá dài'; end if;
  if p_attachments is null or jsonb_typeof(p_attachments) <> 'array' or jsonb_array_length(p_attachments) > 10 then
    raise exception 'Đính kèm không hợp lệ (tối đa 10)'; end if;
  mode := coalesce(b.settings->>'moderation', 'manual');
  st := case mode
    when 'off' then case when c.status = 'featured' then 'featured' else 'approved' end
    when 'auto' then case when public.post_flagged(p_author, p_group, p_title, p_body, c.poll, p_attachments) then 'pending'
                          when c.status = 'featured' then 'featured' else 'approved' end
    else 'pending'
  end;
  update cards set title = trim(p_title), body = p_body, author_name = trim(p_author), group_name = trim(coalesce(p_group, group_name)),
                   attachments = p_attachments, status = st, resubmitted_at = now(), revisions = coalesce(revisions, 0) + 1 where id = c.id;
  return st;
end $$;
grant execute on function public.update_card_by_code to anon, authenticated;

-- Tìm bài theo tên người nộp (học sinh tiểu học khó nhớ mã nên dùng chính tên làm chìa khóa).
-- Lưu ý: ai biết tên và có link bảng đều sửa/xóa được bài đó; chỉ hợp với lớp nhỏ tin nhau. Hàm trả cả mã sửa bài để mở hộp sửa.
create or replace function public.get_cards_by_name(p_token text, p_name text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b boards; k text;
begin
  select * into b from boards where share_token = p_token and deleted_at is null;
  if not found then return '[]'::jsonb; end if;
  k := lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'));
  if length(k) < 2 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(to_jsonb(c) - 'session_id' - 'grade' order by c.created_at desc)
                   from (select * from cards where board_id = b.id and kind = 'submission'
                           and lower(regexp_replace(btrim(coalesce(author_name, '')), '\s+', ' ', 'g')) = k
                         order by created_at desc limit 10) c), '[]'::jsonb);
end $$;
grant execute on function public.get_cards_by_name to anon, authenticated;

-- ===== 3) Bản nộp lại: ghi giờ mới nhất và số lần nộp lại =====
alter table public.cards add column if not exists resubmitted_at timestamptz;
alter table public.cards add column if not exists revisions integer not null default 0;

-- ===== 4) Học sinh chọn tên từ danh sách lớp khi nộp bài =====
-- Chỉ trả TÊN và tổ/lớp của danh sách thành viên (không có gì khác). Lưu ý: ai có link bảng đều xem được các tên này.
create or replace function public.get_roster_public(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b boards;
begin
  select * into b from boards where share_token = p_token and deleted_at is null;
  if not found then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('name', r.name, 'unit', r.unit) order by r.name) from board_roster r where r.board_id = b.id), '[]'::jsonb);
end $$;
grant execute on function public.get_roster_public to anon, authenticated;


-- ############ cap-nhat-tep-nen.sql ############
-- Cho phép giáo viên đính kèm tệp nén (.zip, .rar, .7z) vào tài liệu. Học sinh / khách vẫn KHÔNG tải tệp nén lên được.
-- Chạy một lần trong Supabase -> SQL Editor. An toàn khi chạy lại.

-- 1) Thêm loại tệp nén vào danh sách kho chấp nhận.
update storage.buckets
set allowed_mime_types = (
  select array(select distinct unnest(allowed_mime_types || array['application/zip', 'application/vnd.rar', 'application/x-7z-compressed']))
)
where id = 'board-files';

-- 2) Chỉ chủ bảng / đồng quản lý được ghi tệp có đuôi .zip .rar .7z; khách và học sinh bị từ chối ở phía máy chủ.
drop policy if exists board_files_insert on storage.objects;
create policy board_files_insert on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'board-files'
    and public.can_upload_to_board((storage.foldername(name))[1])
    and (
      name !~* '\.(zip|rar|7z)$'
      or (auth.uid() is not null and public.is_board_manager(((storage.foldername(name))[1])::uuid))
    )
  );

-- 3) Nâng giới hạn mỗi tệp của kho lên 50 MB (gói Supabase miễn phí cho tối đa 50 MB).
--    Muốn lớn hơn 50 MB: nâng lên gói Pro, vào Storage -> Settings đổi "Upload file size limit", rồi sửa số dưới đây.
update storage.buckets set file_size_limit = 52428800 where id = 'board-files';

-- 4) Cột trình bày thẻ tài liệu (nhãn nhỏ, màu, các bước hướng dẫn). Tên nút nằm trong cột attachments sẵn có.
alter table public.cards add column if not exists meta jsonb;


-- ############ cap-nhat-to-cong-tac.sql ############
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


-- ############ cap-nhat-cong-viec-cua-toi.sql ############
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


-- ############ cap-nhat-dinh-ky.sql ############
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


-- ############ cap-nhat-tap-huan.sql ############
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

-- =====================================================================
-- CẬP NHẬT: MÃ VÀO LỚP 6 SỐ (học sinh nhập mã ở trang chủ thay cho link)
-- Chạy MỘT LẦN trong Supabase → SQL Editor → New query → Run. Chạy lại nhiều lần vẫn an toàn.
--   • Mỗi bảng có một mã 6 số riêng (cột join_code) và công tắc bật / tắt (cột join_enabled).
--   • Bảng cũ được cấp mã ngay; bảng tổ / nhóm công tác tắt sẵn việc vào bằng mã; bảng việc riêng không có mã.
--   • Học sinh gọi hàm board_token_by_code: đúng mã thì nhận link của bảng, sai thì không biết gì thêm.
--   • Chống đoán mã: mỗi địa chỉ mạng chỉ được nhập sai tối đa 30 lần trong 10 phút.
-- =====================================================================

-- 1) Hàm sinh mã 6 số chưa ai dùng (không bắt đầu bằng 0).
create or replace function public.gen_join_code() returns text
language plpgsql as $$
declare c text;
begin
  loop
    c := (100000 + floor(random() * 900000))::int::text;
    exit when not exists (select 1 from public.boards where join_code = c);
  end loop;
  return c;
end $$;

-- 2) Thêm cột và cấp mã cho bảng cũ (chỉ làm ở lần chạy đầu để không tắt lại công tắc giáo viên đã bật).
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'boards' and column_name = 'join_code') then
    alter table public.boards add column join_code text;
    alter table public.boards add column join_enabled boolean not null default true;
    update public.boards set join_code = public.gen_join_code() where coalesce((settings ->> 'personal')::boolean, false) = false;
    update public.boards set join_enabled = false where settings ->> 'scope' = 'team' or coalesce((settings ->> 'personal')::boolean, false);
  end if;
end $$;

create unique index if not exists boards_join_code_key on public.boards (join_code) where join_code is not null;

-- 3) Bảng mới tự có mã (trừ bảng việc riêng); bảng tổ công tác tắt sẵn.
create or replace function public.boards_join_defaults() returns trigger
language plpgsql as $$
begin
  if coalesce((new.settings ->> 'personal')::boolean, false) then
    new.join_code := null; new.join_enabled := false; return new;
  end if;
  if new.join_code is null then new.join_code := public.gen_join_code(); end if;
  if new.settings ->> 'scope' = 'team' then new.join_enabled := false; end if;
  return new;
end $$;

drop trigger if exists boards_join_defaults on public.boards;
create trigger boards_join_defaults before insert on public.boards
  for each row execute function public.boards_join_defaults();

-- 4) Sổ ghi các lần nhập sai (chỉ hàm bên dưới đọc / ghi được; học sinh không xem được).
create table if not exists public.join_attempts (
  id bigserial primary key,
  ip text not null,
  at timestamptz not null default now()
);
create index if not exists join_attempts_ip_at on public.join_attempts (ip, at);
alter table public.join_attempts enable row level security;

-- 5) Học sinh nhập mã: đúng thì trả về mã link của bảng, sai thì trả về rỗng (null).
create or replace function public.board_token_by_code(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare c text; v_ip text; tk text; fails int;
begin
  c := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
  if length(c) <> 6 then return null; end if;
  begin
    v_ip := coalesce(
      nullif(current_setting('request.headers', true)::jsonb ->> 'cf-connecting-ip', ''),
      nullif(current_setting('request.headers', true)::jsonb ->> 'x-real-ip', ''),
      nullif(trim(split_part(coalesce(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', ''), ',', 1)), ''),
      'unknown');
  exception when others then v_ip := 'unknown'; end;
  select count(*) into fails from public.join_attempts where ip = v_ip and at > now() - interval '10 minutes';
  if fails >= 30 then raise exception 'too_many_attempts'; end if;
  select share_token into tk from public.boards
    where join_code = c and join_enabled and deleted_at is null;
  if tk is null then
    insert into public.join_attempts (ip) values (v_ip);
    delete from public.join_attempts where at < now() - interval '1 day';
  end if;
  return tk;
end $$;
grant execute on function public.board_token_by_code(text) to anon, authenticated;
