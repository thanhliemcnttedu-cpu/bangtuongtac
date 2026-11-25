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
  if length(coalesce(new.body,'')) > 8000 or length(coalesce(new.title,'')) > 200 then
    raise exception 'Nội dung quá dài'; end if;
  if (select count(*) from cards where board_id = new.board_id and session_id = new.session_id
      and created_at > now() - interval '10 minutes') >= 10 then
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

-- Cho phép lặp hằng ngày và các ngày thứ 2–6 (bỏ ràng buộc cũ rồi tạo lại; chạy lại nhiều lần vẫn an toàn).
alter table public.board_tasks drop constraint if exists board_tasks_repeat_chk;
alter table public.board_tasks add constraint board_tasks_repeat_chk check (repeat_rule in ('none','daily','weekdays','weekly','monthly','quarterly','semester','yearly'));


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


-- ############ cap-nhat-cong-viec-nang-cao.sql ############
-- Đợt A: nhóm việc, các mốc hạn, trạng thái mới, đầu việc thành phần, nhật ký (xem tệp riêng để biết cách quay lại).
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


-- ############ cap-nhat-chia-se-cong-viec.sql ############
-- Chia sẻ "Công việc của tôi" bằng link (xem tệp riêng để biết cách hoạt động và quay lại).
create index if not exists boards_task_share_idx on public.boards ((settings->'taskShare'->>'key'))
  where settings->'taskShare' is not null;

create or replace function public.get_shared_tasks(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b boards; mode text;
begin
  if p_token is null or length(p_token) < 16 then return null; end if;
  select * into b from boards
   where settings->'taskShare'->>'key' = p_token and deleted_at is null
     and coalesce(settings->>'personal', 'false') = 'true';
  if not found then return null; end if;
  mode := b.settings->'taskShare'->>'mode';
  if mode is null or mode not in ('view', 'edit') then return null; end if;
  return jsonb_build_object(
    'mode', mode,
    'is_owner', public.is_board_owner(b.id),
    'now', now(),
    'tasks', coalesce((select jsonb_agg(to_jsonb(t) - 'board_id' - 'assignee_emails' order by t.sort)
                         from board_tasks t where t.board_id = b.id), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(to_jsonb(i) - 'board_id' order by i.sort)
                         from task_items i where i.board_id = b.id and i.deleted_at is null), '[]'::jsonb)
  );
end $$;

grant execute on function public.get_shared_tasks(text) to anon, authenticated;


-- ############ cap-nhat-lich.sql ############
-- Đợt C: thời khóa biểu nhập từ Excel và lịch công tác (xem tệp riêng để biết cách quay lại).
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

-- =====================================================================
-- CẬP NHẬT ĐỢT E: NHẮC VIỆC ĐẨY (nhận thông báo cả khi đã đóng trang)
-- Chạy MỘT LẦN trong Supabase -> SQL Editor -> New query -> Run. Chạy lại nhiều lần vẫn an toàn.
-- Chỉ THÊM hai bảng mới; không đổi tên hay xóa gì của dữ liệu đang có.
-- Phần đặt lịch chạy hàm (cuối tệp) đang là chú thích: làm theo docs/HUONG-DAN-NHAC-VIEC-DAY.md.
-- Cách quay lại: drop table if exists public.push_sent, public.push_subscriptions;
-- =====================================================================

-- 1) Thiết bị đã bật nhắc đẩy (mỗi trình duyệt / điện thoại một dòng)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  prefs jsonb not null default '{"soonHours":24,"overdue":true,"report":true,"items":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

-- 2) Nhật ký đã gửi, để mỗi nhắc chỉ gửi MỘT lần cho mỗi thiết bị
create table if not exists public.push_sent (
  sub_id uuid not null references public.push_subscriptions(id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (sub_id, key)
);

alter table public.push_subscriptions enable row level security;
alter table public.push_sent enable row level security;
-- Mỗi người chỉ thấy và sửa đăng ký của chính mình. Bảng push_sent chỉ hàm máy chủ (service role) dùng, nên không mở chính sách nào.
drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 3) Đặt lịch gọi hàm mỗi 15 phút (BỎ DẤU -- VÀ ĐIỀN GIÁ TRỊ THẬT sau khi đã triển khai hàm send-reminders):
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select cron.schedule('nhac-viec-day', '*/15 * * * *', $cron$
--   select net.http_post(
--     url := 'https://<MA-DU-AN>.supabase.co/functions/v1/send-reminders',
--     headers := '{"Content-Type":"application/json","x-cron-secret":"<CRON_SECRET>"}'::jsonb,
--     body := '{}'::jsonb);
-- $cron$);
-- Tắt lịch: select cron.unschedule('nhac-viec-day');
