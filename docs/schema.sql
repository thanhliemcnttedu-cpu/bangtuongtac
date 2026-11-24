-- Lược đồ Supabase (Postgres) cho Bảng tương tác lớp học & tập huấn
-- Chưa chạy lên dữ liệu thật; chạy thử trên dự án Supabase mới.

create extension if not exists pgcrypto;
create extension if not exists unaccent;   -- bỏ dấu tiếng Việt cho bộ lọc nhận xét

-- 1. Hồ sơ giáo viên (đồng bộ từ auth.users khi đăng nhập Google)
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  avatar_url text,
  created_at timestamptz default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users(id, email, full_name, avatar_url)
  values (new.id, new.email,
          new.raw_user_meta_data->>'full_name',
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do update set full_name = excluded.full_name, avatar_url = excluded.avatar_url;
  -- gắn lời mời đồng quản lý theo đúng Gmail
  update public.board_collaborators set user_id = new.id
   where lower(email) = lower(new.email) and user_id is null;
  return new;
end $$;

-- Gắn hồ sơ giáo viên tự động khi có tài khoản Google mới đăng nhập lần đầu
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Bảng (Board)
create table public.boards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  owner_email text,                            -- gắn tự động bằng trigger bên dưới
  title text not null,
  mode text not null check (mode in ('classroom','training')),   -- Lớp học | Tập huấn
  layout text not null default 'grid' check (layout in ('grid','columns')),
  goals text,                                  -- mục tiêu bài học (Khu vực 1)
  share_token text unique not null default encode(gen_random_bytes(9),'hex'),
  settings jsonb not null default '{}'::jsonb,   -- cài đặt giao diện: kiểu xem, sắp xếp, biểu tượng, nền, phông…
  link_mode text not null default 'guest_post' check (link_mode in ('view','guest_post','locked')),
  archived_at timestamptz,                       -- đã đóng (lưu trữ): chỉ xem
  deleted_at timestamptz,                        -- trong thùng rác, tự xóa sau 30 ngày
  is_template boolean not null default false,    -- đánh dấu là mẫu
  allow_guest_post boolean generated always as (link_mode = 'guest_post' and archived_at is null and deleted_at is null) stored, -- khách đăng bài khi link ở chế độ nộp
  allow_comments boolean not null default false,
  program text,                                  -- chương trình tập huấn chứa lớp này (gom nhiều lớp tập huấn)
  created_at timestamptz default now()
);

-- 3. Đồng quản lý
create table public.board_collaborators (
  board_id uuid references public.boards(id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  user_id uuid references public.users(id) on delete cascade,
  -- editor = đồng quản lý (duyệt, chấm, sửa cài đặt); viewer = giáo viên chỉ xem toàn bộ dữ liệu
  role text not null default 'editor' check (role in ('editor','viewer')),
  added_by text,
  added_at timestamptz not null default now(),
  primary key (board_id, email)
);

-- 3b. Nhiệm vụ của bảng và danh sách sĩ số / học viên
-- Bài học (lớp học) / buổi tập huấn của một lớp
create table public.board_lessons (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  description text not null default '',
  sort int not null default 0,
  starts_at timestamptz,                         -- thời gian diễn ra (tập huấn theo buổi)
  ends_at timestamptz
);
create index on public.board_lessons(board_id, sort);

-- Bài tập / yêu cầu của một bài học; bài nộp (cards.task_id) gắn vào đây
create table public.board_tasks (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  lesson_id uuid references public.board_lessons(id) on delete set null,
  label text not null,
  kind text not null default 'assignment' check (kind in ('assignment','requirement')),
  instructions text not null default '',
  assigned_at timestamptz,                       -- lúc giao; trước đó học sinh chưa thấy, chưa nộp được (trống = giao ngay)
  due_at timestamptz,                            -- hạn nộp
  allow_late boolean not null default false,     -- cho nộp muộn (bài được đánh dấu late)
  target_units text[] not null default '{}',     -- tổ / nhóm / đơn vị được giao; rỗng = cả lớp
  sort int not null default 0
);
create table public.board_roster (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null,
  unit text not null default '',
  started_working boolean not null default false
);
create index on public.board_roster(board_id);

-- 4. Thẻ: tài liệu ghim (kind='resource') và bài nộp (kind='submission')
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  kind text not null check (kind in ('resource','submission')),
  author_name text,                 -- họ tên / nhóm (bắt buộc với bài nộp)
  group_name text,                  -- Lớp/Tổ (lớp học) hoặc Trường/Đơn vị (tập huấn)
  title text,
  body text,
  link_url text,
  file_path text,                   -- đường dẫn trong Storage
  file_type text,
  attachments jsonb not null default '[]'::jsonb,  -- mảng {type,name,url,mime,size}: tối đa 10 tệp/liên kết/nhúng
  constraint attachments_is_array check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10),
  poll jsonb,                       -- [{id,label}] thăm dò ý kiến gắn vào bài
  loc jsonb,                        -- {lat,lng,name}: vị trí trên bản đồ
  pos jsonb,                        -- {x,y}: toạ độ thẻ trên Bảng trắng
  venn text check (venn in ('a','ab','b')),  -- vùng trong biểu đồ Venn
  constraint loc_valid check (loc is null or (jsonb_typeof(loc) = 'object' and (loc->>'lat')::float between -90 and 90 and (loc->>'lng')::float between -180 and 180)),
  constraint pos_valid check (pos is null or jsonb_typeof(pos) = 'object'),
  task_id uuid references public.board_tasks(id) on delete set null,
  lesson_id uuid references public.board_lessons(id) on delete set null,   -- tài liệu (kind='resource') thuộc bài học nào; trống = tài liệu chung của lớp
  late boolean not null default false,            -- nộp sau hạn (do trigger đặt, khách không tự đặt được)
  status text not null default 'pending' check (status in ('pending','approved','featured','needs_edit')),
  teacher_note text,
  grade numeric(3,1) check (grade is null or (grade >= 0 and grade <= 10)),  -- điểm thang 10
  teacher_stars smallint check (teacher_stars is null or teacher_stars between 1 and 5),  -- sao giáo viên chấm
  session_id text,                  -- mã phiên của khách (localStorage)
  edit_token text,                  -- chỉ trả về một lần cho người đăng
  created_at timestamptz default now(),
  constraint submission_needs_name check (kind <> 'submission' or length(trim(author_name)) > 0)
);
create index on public.cards(board_id, status, created_at desc);

-- 5. Bình luận / thả tim
-- Nhận xét của học sinh về bài của bạn khác. Chỉ ghi qua hàm post_comment (có bộ lọc ngôn ngữ ở máy chủ).
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  author_name text not null check (length(trim(author_name)) between 1 and 40),
  body text not null check (length(body) between 1 and 300),
  status text not null default 'visible' check (status in ('visible','pending','hidden')),  -- pending: chờ giáo viên duyệt; hidden: giáo viên đã ẩn
  session_id text,
  created_at timestamptz not null default now()
);
create index on public.comments(board_id, created_at desc);

-- Chấm sao của học sinh: mỗi trình duyệt một lượt cho mỗi bài, đổi ý được; không chấm bài của chính mình.
create table public.card_ratings (
  card_id uuid not null references public.cards(id) on delete cascade,
  session_id text not null,
  stars smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (card_id, session_id)
);

-- ===== Hàm kiểm tra quyền quản lý =====
create function public.boards_set_owner_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.owner_email := (select email from public.users where id = new.owner_id);
  return new;
end $$;
create trigger trg_boards_owner_email before insert on public.boards
  for each row execute function public.boards_set_owner_email();

-- Ba mức quyền, nhận diện theo Gmail trong phiên đăng nhập (không phụ thuộc user_id):
--   chủ bảng  : mọi quyền, kể cả chia sẻ, đóng, xóa;
--   đồng quản lý (editor): đọc và ghi dữ liệu bảng, không đổi chủ / đóng / xóa / chia sẻ;
--   chỉ xem (viewer): đọc toàn bộ dữ liệu như giáo viên, không sửa.
create function public.is_board_owner(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from boards where id = b
                 and (owner_id = auth.uid() or lower(owner_email) = lower(auth.jwt()->>'email')));
$$;

-- Người quản lý = chủ bảng hoặc đồng quản lý (có quyền ghi).
create function public.is_board_manager(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_board_owner(b)
      or exists (select 1 from board_collaborators
                 where board_id = b and role = 'editor' and lower(email) = lower(auth.jwt()->>'email'));
$$;

-- Thành viên = chủ bảng hoặc bất kỳ ai được chia sẻ (có quyền đọc).
create function public.is_board_member(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_board_owner(b)
      or exists (select 1 from board_collaborators
                 where board_id = b and lower(email) = lower(auth.jwt()->>'email'));
$$;

-- Giới hạn chia sẻ: tối đa 20 người mỗi bảng, không mời chính chủ bảng.
create function public.collaborators_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from board_collaborators where board_id = new.board_id) >= 20 then
    raise exception 'Mỗi bảng chia sẻ tối đa 20 giáo viên';
  end if;
  if exists (select 1 from boards where id = new.board_id and lower(owner_email) = new.email) then
    raise exception 'Đây là chủ bảng, không cần mời';
  end if;
  return new;
end $$;
create trigger trg_collaborators_guard before insert on public.board_collaborators
  for each row execute function public.collaborators_guard();

-- Đồng quản lý không được đổi chủ, mã chia sẻ, đóng bảng, chuyển vào thùng rác hay đánh dấu mẫu.
create function public.boards_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_board_owner(old.id) and (
       new.owner_id is distinct from old.owner_id or new.share_token is distinct from old.share_token
    or new.archived_at is distinct from old.archived_at or new.deleted_at is distinct from old.deleted_at
    or new.is_template is distinct from old.is_template) then
    raise exception 'Chỉ chủ bảng được thực hiện thao tác này';
  end if;
  return new;
end $$;
create trigger trg_boards_guard before update on public.boards
  for each row execute function public.boards_guard();

-- ===== RLS =====
alter table public.users enable row level security;
alter table public.boards enable row level security;
alter table public.board_collaborators enable row level security;
alter table public.cards enable row level security;
alter table public.comments enable row level security;
alter table public.board_tasks enable row level security;
alter table public.board_lessons enable row level security;
alter table public.board_roster enable row level security;

create policy users_self on public.users for select using (id = auth.uid());

-- Bảng: thành viên đọc; chủ bảng tạo và xóa; chủ + đồng quản lý sửa (trigger boards_guard chặn các cột chỉ chủ được đổi).
-- Chủ bảng đọc trực tiếp (không qua hàm): lệnh INSERT ... RETURNING chưa "thấy" dòng mới bên trong hàm is_board_member.
create policy boards_select on public.boards for select
  using (owner_id = auth.uid() or lower(owner_email) = lower(auth.jwt()->>'email') or public.is_board_member(id));
create policy boards_insert on public.boards for insert with check (owner_id = auth.uid());
create policy boards_update on public.boards for update
  using (public.is_board_manager(id)) with check (public.is_board_manager(id));
create policy boards_delete on public.boards for delete using (public.is_board_owner(id));

-- Chia sẻ: chủ bảng quản lý danh sách; thành viên xem danh sách; mỗi người tự rời khỏi bảng được.
create policy collab_owner on public.board_collaborators for all
  using (public.is_board_owner(board_id)) with check (public.is_board_owner(board_id));
create policy collab_member_read on public.board_collaborators for select using (public.is_board_member(board_id));
create policy collab_self_delete on public.board_collaborators for delete
  using (lower(email) = lower(auth.jwt()->>'email'));

-- Người chỉ xem cũng đọc được toàn bộ dữ liệu của bảng được chia sẻ.
create policy tasks_read on public.board_tasks for select using (public.is_board_member(board_id));
create policy lessons_read on public.board_lessons for select using (public.is_board_member(board_id));
create policy lessons_manage on public.board_lessons for all
  using (public.is_board_manager(board_id)) with check (public.is_board_manager(board_id));
create policy roster_read on public.board_roster for select using (public.is_board_member(board_id));
create policy cards_read on public.cards for select using (public.is_board_member(board_id));

create policy tasks_manage on public.board_tasks for all
  using (public.is_board_manager(board_id)) with check (public.is_board_manager(board_id));
create policy roster_manage on public.board_roster for all
  using (public.is_board_manager(board_id)) with check (public.is_board_manager(board_id));

-- Quản lý: toàn quyền với thẻ trong bảng của mình
create policy cards_manage on public.cards for all
  using (public.is_board_manager(board_id)) with check (public.is_board_manager(board_id));

-- Khách không đăng nhập được INSERT thẻ mới khi bảng bật allow_guest_post (link ở chế độ nộp).
-- Chỉ được tạo bài nộp. Trạng thái cuối cùng (chờ duyệt / đã duyệt) do trigger cards_guard quyết định theo chế độ kiểm duyệt của bảng, không tin giá trị khách gửi.
-- Khách không đọc được bảng boards (RLS), nên điều kiện kiểm tra nằm trong hàm SECURITY DEFINER.
create function public.guest_can_post(b uuid, st text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from boards where id = b and allow_guest_post);
$$;
create policy cards_guest_insert on public.cards for insert to anon, authenticated
  with check (
    kind = 'submission'
    and status in ('pending','approved')
    and teacher_note is null
    and public.guest_can_post(board_id, status)
  );

-- Chống spam: tối đa 5 bài / 10 phút cho mỗi mã phiên, giới hạn độ dài
create function public.cards_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare t board_tasks;
begin
  if public.is_board_manager(new.board_id) then return new; end if;
  new.late := false;   -- khách không tự đánh dấu được; máy chủ quyết định bên dưới
  if length(coalesce(new.body,'')) > 8000 or length(coalesce(new.title,'')) > 200 then
    raise exception 'Nội dung quá dài'; end if;
  if (select count(*) from cards where board_id = new.board_id and session_id = new.session_id
      and created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'Gửi quá nhanh, vui lòng đợi vài phút'; end if;
  if (select mode from boards where id = new.board_id) = 'training'
     and length(trim(coalesce(new.group_name,''))) = 0 then
    raise exception 'Cần nhập trường / đơn vị'; end if;
  -- Bài tập: phải thuộc bảng, đã được giao, còn hạn (hoặc cho nộp muộn) và đúng tổ / nhóm / đơn vị được giao.
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
  -- Chế độ kiểm duyệt (settings.moderation): off = hiện ngay; manual = giáo viên duyệt; auto = hệ thống đọc chữ,
  -- sạch thì duyệt luôn, nghi ngờ thì giữ lại cho giáo viên. Ảnh/video/tệp không được quét tự động.
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
create trigger trg_cards_guard before insert on public.cards
  for each row execute function public.cards_guard();

-- Khách KHÔNG đọc thẳng bảng: xem qua hàm get_board_public (bên dưới).
-- Không có policy INSERT/UPDATE/DELETE cho anon -> mọi ghi của khách đi qua RPC.

create policy comments_manage on public.comments for all
  using (exists (select 1 from cards c where c.id = card_id and public.is_board_manager(c.board_id)));

-- ===== RPC cho khách không đăng nhập =====

-- Xem bảng bằng share_token: chỉ thẻ đã duyệt / tiêu biểu / tài liệu
create function public.get_board_public(p_token text) returns jsonb
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
    -- Học sinh chỉ thấy bài tập đã đến giờ giao.
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label, 'lesson_id', t.lesson_id, 'kind', t.kind,
                                                            'instructions', t.instructions, 'assigned_at', t.assigned_at, 'due_at', t.due_at,
                                                            'allow_late', t.allow_late, 'target_units', t.target_units) order by t.sort)
              from board_tasks t where t.board_id = b.id and (t.assigned_at is null or t.assigned_at <= now())), '[]'::jsonb),
    'votes', coalesce((select jsonb_agg(jsonb_build_object('card_id', v.card_id, 'option_id', v.option_id, 'n', v.n))
              from (select card_id, option_id, count(*) as n from card_votes
                    where card_id in (select id from cards where board_id = b.id) group by card_id, option_id) v), '[]'::jsonb),
    'ratings', coalesce((select jsonb_agg(jsonb_build_object('card_id', r.card_id, 'n', r.n, 'sum', r.s))
              from (select card_id, count(*) as n, sum(stars) as s from card_ratings
                    where card_id in (select id from cards where board_id = b.id) group by card_id) r), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'card_id', m.card_id, 'author', m.author_name,
                                                              'body', m.body, 'at', m.created_at) order by m.created_at)
              from comments m where m.board_id = b.id and m.status = 'visible'), '[]'::jsonb),
    'cards', coalesce((select jsonb_agg((case when coalesce((b.settings->>'showGrades')::boolean, false) then to_jsonb(c) else to_jsonb(c) - 'grade' end) - 'edit_token' - 'session_id' order by c.created_at desc)
              from cards c where c.board_id = b.id
              and (c.kind = 'resource' or c.status in ('approved','featured'))), '[]'::jsonb));
end $$;

-- Sửa / xóa bài của chính mình trong 15 phút đầu
create function public.edit_card(p_id uuid, p_edit_token text, p_title text, p_body text, p_delete boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c cards;
begin
  select * into c from cards where id = p_id and edit_token = p_edit_token;
  if not found then raise exception 'Không có quyền sửa bài này'; end if;
  if c.created_at < now() - interval '15 minutes' then raise exception 'Đã quá 15 phút'; end if;
  if p_delete then delete from cards where id = p_id;
  else update cards set title = p_title, body = p_body where id = p_id; end if;
end $$;

revoke all on function public.edit_card, public.get_board_public from public;
grant execute on function public.edit_card, public.get_board_public to anon, authenticated;

-- ===== Thăm dò ý kiến (bình chọn gắn vào bài) =====
create table public.card_votes (
  card_id uuid not null references public.cards(id) on delete cascade,
  session_id text not null,                 -- mỗi trình duyệt một phiếu cho mỗi bài
  option_id text not null,
  created_at timestamptz default now(),
  primary key (card_id, session_id)
);
alter table public.card_votes enable row level security;
create policy votes_manage_read on public.card_votes for select
  using (exists (select 1 from cards c where c.id = card_id and public.is_board_member(c.board_id)));

-- Bỏ phiếu: chỉ khi bảng đang mở nhận bài, bài đã duyệt và lựa chọn có thật; đổi ý thì ghi đè phiếu cũ.
create function public.vote_card(p_card uuid, p_session text, p_option text) returns void
language plpgsql security definer set search_path = public as $$
declare c cards; b boards;
begin
  select * into c from cards where id = p_card and kind = 'submission' and status in ('approved','featured');
  if not found then raise exception 'Không tìm thấy bài để bình chọn'; end if;
  select * into b from boards where id = c.board_id;
  if not b.allow_guest_post then raise exception 'Bảng không nhận bình chọn'; end if;
  if c.poll is null or not exists (select 1 from jsonb_array_elements(c.poll) o where o->>'id' = p_option) then
    raise exception 'Lựa chọn không hợp lệ'; end if;
  if length(coalesce(p_session,'')) < 8 then raise exception 'Thiếu mã phiên'; end if;
  insert into card_votes(card_id, session_id, option_id) values (p_card, p_session, p_option)
  on conflict (card_id, session_id) do update set option_id = excluded.option_id;
end $$;
grant execute on function public.vote_card to anon, authenticated;

-- ===== Kho tệp (Storage) =====
-- Bucket công khai để đọc (địa chỉ chứa UUID ngẫu nhiên, không đoán được); ghi bị khóa bằng chính sách.
-- Giới hạn 50 MB / tệp (tối đa của gói miễn phí) và danh sách loại tệp áp dụng ngay tại kho, không thể vượt qua từ trình duyệt.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('board-files', 'board-files', true, 52428800, array['image/jpeg','image/png','image/webp','image/gif','image/bmp','image/avif','video/webm','video/mp4','video/quicktime','audio/webm','audio/mpeg','audio/mp4','audio/aac','audio/ogg','audio/wav','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain','text/csv'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Thư mục đầu tiên của đường dẫn là id bảng: chỉ ghi được khi bảng nhận bài từ khách, hoặc người ghi là chủ/đồng quản lý.
create function public.can_upload_to_board(folder text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from boards b where b.id::text = folder
                 and (b.allow_guest_post or public.is_board_manager(b.id)));
$$;
create policy board_files_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'board-files' and public.can_upload_to_board((storage.foldername(name))[1]));
create policy board_files_manager_delete on storage.objects for delete to authenticated
  using (bucket_id = 'board-files' and public.is_board_manager(((storage.foldername(name))[1])::uuid));

-- ===== Nhật ký hoạt động =====
create table public.board_activity (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  actor text not null,
  action text not null,       -- mã hành động: nop_bai, doi_trang_thai, cham_diem, xoa_bai, cai_dat, dong_bang…
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index on public.board_activity(board_id, created_at desc);
alter table public.board_activity enable row level security;
create policy activity_manage on public.board_activity for all
  using (public.is_board_manager(board_id)) with check (public.is_board_manager(board_id));

-- Sự kiện về bài nộp được ghi bằng trigger (khách cũng kích hoạt được nhưng không sửa/đọc được nhật ký).
create function public.log_card_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text := coalesce(auth.jwt()->>'email', 'Khách');
begin
  if tg_op = 'INSERT' then
    if new.kind = 'submission' then
      insert into board_activity(board_id, actor, action, detail)
      values (new.board_id, who, 'nop_bai', new.author_name || ' · ' || coalesce(new.title, ''));
    end if;
  elsif tg_op = 'UPDATE' then
    if new.kind = 'submission' and new.status is distinct from old.status then
      insert into board_activity(board_id, actor, action, detail)
      values (new.board_id, who, 'doi_trang_thai', new.author_name || ': ' || old.status || ' → ' || new.status);
    end if;
    if new.kind = 'submission' and new.grade is distinct from old.grade then
      insert into board_activity(board_id, actor, action, detail)
      values (new.board_id, who, 'cham_diem', new.author_name || ': ' || coalesce(new.grade::text, 'bỏ điểm'));
    end if;
  elsif tg_op = 'DELETE' then
    -- Khi cả bảng bị xóa (cascade) thì bảng đã mất: bỏ qua để không vi phạm khóa ngoại.
    if old.kind = 'submission' and exists (select 1 from boards where id = old.board_id) then
      insert into board_activity(board_id, actor, action, detail)
      values (old.board_id, who, 'xoa_bai', old.author_name || ' · ' || coalesce(old.title, ''));
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_cards_activity after insert or update or delete on public.cards
  for each row execute function public.log_card_activity();

-- Dọn thùng rác: xóa vĩnh viễn bảng của chính người gọi đã nằm trong thùng quá 30 ngày. App gọi khi mở trang.
create function public.purge_trashed_boards() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from boards where deleted_at < now() - interval '30 days'
    and (owner_id = auth.uid() or lower(owner_email) = lower(auth.jwt()->>'email'));
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.purge_trashed_boards to authenticated;

-- Người xem được chia sẻ cũng đọc nhật ký.
create policy activity_read on public.board_activity for select using (public.is_board_member(board_id));

-- ===== Đánh giá giữa các bạn: chấm sao và nhận xét có bộ lọc ngôn ngữ =====
alter table public.card_ratings enable row level security;
create policy ratings_read on public.card_ratings for select
  using (exists (select 1 from cards c where c.id = card_id and public.is_board_member(c.board_id)));
create policy comments_read on public.comments for select using (public.is_board_member(board_id));
-- Giáo viên (đồng quản lý) ẩn / xóa nhận xét qua chính sách comments_manage ở trên.

-- Danh sách từ chặn: nằm trong bảng, không ai đọc trực tiếp được (chỉ hàm của máy chủ đọc).
create table public.blocked_terms (
  term text not null check (term ~ '^[[:alpha:]]+( [[:alpha:]]+)*$'),
  kind text not null check (kind in ('accent','plain','allow')),
  primary key (term, kind)
);
alter table public.blocked_terms enable row level security;

-- BEGIN moderation terms (tự sinh từ src/data/blockedTerms.json; sửa ở đó rồi chạy `npm run gen:moderation`)
delete from public.blocked_terms;
insert into public.blocked_terms(term, kind) values
  ('địt','accent'),
  ('đụ','accent'),
  ('đéo','accent'),
  ('lồn','accent'),
  ('cặc','accent'),
  ('buồi','accent'),
  ('cứt','accent'),
  ('đĩ','accent'),
  ('đm','accent'),
  ('đmm','accent'),
  ('đcm','accent'),
  ('đkm','accent'),
  ('vcl','accent'),
  ('vkl','accent'),
  ('đồ chó','accent'),
  ('thằng chó','accent'),
  ('con chó đẻ','accent'),
  ('chó đẻ','accent'),
  ('óc chó','accent'),
  ('mặt chó','accent'),
  ('đồ lợn','accent'),
  ('mặt lợn','accent'),
  ('đồ súc vật','accent'),
  ('súc vật','accent'),
  ('mẹ mày','accent'),
  ('mẹ kiếp','accent'),
  ('chết mẹ','accent'),
  ('đồ khốn','accent'),
  ('khốn nạn','accent'),
  ('đồ điên','accent'),
  ('thằng điên','accent'),
  ('con điên','accent'),
  ('điên khùng','accent'),
  ('khùng điên','accent'),
  ('đồ khùng','accent'),
  ('thằng khùng','accent'),
  ('con khùng','accent'),
  ('ngu','accent'),
  ('ngu ngốc','accent'),
  ('ngu si','accent'),
  ('ngu dốt','accent'),
  ('đồ ngu','accent'),
  ('thằng ngu','accent'),
  ('con ngu','accent'),
  ('đần','accent'),
  ('đần độn','accent'),
  ('đồ đần','accent'),
  ('ngốc nghếch','accent'),
  ('đồ ngốc','accent'),
  ('thằng ngốc','accent'),
  ('con ngốc','accent'),
  ('khờ khạo','accent'),
  ('thiểu năng','accent'),
  ('dốt','accent'),
  ('dốt nát','accent'),
  ('đồ dốt','accent'),
  ('mất trí','accent'),
  ('đồ tâm thần','accent'),
  ('thằng tâm thần','accent'),
  ('con tâm thần','accent'),
  ('đồ thần kinh','accent'),
  ('thằng thần kinh','accent'),
  ('con thần kinh','accent'),
  ('đồ tự kỷ','accent'),
  ('thằng tự kỷ','accent'),
  ('béo ú','accent'),
  ('mập ú','accent'),
  ('béo như lợn','accent'),
  ('mập như lợn','accent'),
  ('xấu xí','accent'),
  ('xấu hoắc','accent'),
  ('xấu quắc','accent'),
  ('lùn tịt','accent'),
  ('đen thui','accent'),
  ('mặt mụn','accent'),
  ('mặt xấu','accent'),
  ('răng hô','accent'),
  ('đồ mọi','accent'),
  ('mọi rợ','accent'),
  ('đồ nhà quê','accent'),
  ('giết','accent'),
  ('giết chết','accent'),
  ('đánh chết','accent'),
  ('đập chết','accent'),
  ('chém chết','accent'),
  ('đâm chết','accent'),
  ('tao đánh','accent'),
  ('tao giết','accent'),
  ('đi chết','accent'),
  ('chết đi','accent'),
  ('đáng chết','accent'),
  ('muốn chết','accent'),
  ('tự tử','accent'),
  ('cút','accent'),
  ('cút đi','accent'),
  ('biến đi','accent'),
  ('câm mồm','accent'),
  ('câm miệng','accent'),
  ('im mồm','accent'),
  ('im đi','accent'),
  ('đồ rác','accent'),
  ('rác rưởi','accent'),
  ('thứ rác','accent'),
  ('phế vật','accent'),
  ('vô dụng','accent'),
  ('đồ vô dụng','accent'),
  ('vô học','accent'),
  ('mất dạy','accent'),
  ('láo toét','accent'),
  ('đồ láo','accent'),
  ('hỗn láo','accent'),
  ('ăn hại','accent'),
  ('đồ ăn hại','accent'),
  ('đồ hèn','accent'),
  ('đồ ranh','accent'),
  ('đồ bẩn','accent'),
  ('đồ dơ','accent'),
  ('sếch','accent'),
  ('khiêu dâm','accent'),
  ('dâm đãng','accent'),
  ('dâm ô','accent'),
  ('hiếp dâm','accent'),
  ('cưỡng hiếp','accent'),
  ('thủ dâm','accent'),
  ('gái điếm','accent'),
  ('làm tình','accent'),
  ('biến thái','accent'),
  ('đồ biến thái','accent'),
  ('dmm','plain'),
  ('dcm','plain'),
  ('dkm','plain'),
  ('vcl','plain'),
  ('vkl','plain'),
  ('clgt','plain'),
  ('cmm','plain'),
  ('clm','plain'),
  ('dit','plain'),
  ('dit me','plain'),
  ('dit con me','plain'),
  ('du ma','plain'),
  ('con me may','plain'),
  ('me may','plain'),
  ('dm may','plain'),
  ('fuck','plain'),
  ('fck','plain'),
  ('fuk','plain'),
  ('shit','plain'),
  ('bitch','plain'),
  ('dick','plain'),
  ('pussy','plain'),
  ('asshole','plain'),
  ('idiot','plain'),
  ('stupid','plain'),
  ('moron','plain'),
  ('loser','plain'),
  ('dumb','plain'),
  ('retard','plain'),
  ('slut','plain'),
  ('whore','plain'),
  ('kys','plain'),
  ('kill yourself','plain'),
  ('sex','plain'),
  ('porn','plain'),
  ('thang cho','plain'),
  ('do cho','plain'),
  ('oc cho','plain'),
  ('do ngu','plain'),
  ('thang ngu','plain'),
  ('ngu nhu bo','plain'),
  ('do dien','plain'),
  ('thang dien','plain'),
  ('mat day','plain'),
  ('vo hoc','plain'),
  ('do khon','plain'),
  ('khon nan','plain'),
  ('do rac','plain'),
  ('phe vat','plain'),
  ('ngu công','allow'),
  ('dâm bụt','allow'),
  ('cây cứt lợn','allow')
on conflict do nothing;
-- END moderation terms

-- Mẫu regex cho một từ/cụm: mỗi chữ cái có thể lặp ("nguuuu"), cụm từ cách nhau khoảng trắng, phải là từ nguyên vẹn.
create function public.term_pattern(t text) returns text
language sql immutable as $$
  select '(^|[^[:alnum:]])'
      || array_to_string(array(select regexp_replace(w, '(.)', '\1+', 'g')
                               from unnest(regexp_split_to_array(trim(t), '[[:space:]]+')) as w), '[[:space:]]+')
      || '($|[^[:alnum:]])';
$$;

-- TRUE nếu văn bản có từ ngữ không lành mạnh.
-- Cùng thuật toán với src/lib/moderation.ts: bỏ cụm hợp lệ, gom chữ tách rời ("n g u"), khớp theo chữ có dấu
-- (tránh nhầm "ngu" với "ngủ") và theo chữ bỏ dấu + đổi số/ký hiệu (viết không dấu, né lọc).
create function public.text_profanity(p text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare a text := lower(coalesce(p, '')); sq text := ''; u text; us text; m text[]; t record;
begin
  for t in select term from blocked_terms where kind = 'allow' loop a := replace(a, t.term, ' '); end loop;
  for m in select regexp_matches(a, '(?<![[:alpha:]])((?:[[:alpha:]][[:space:].*_-]+){2,}[[:alpha:]])(?![[:alpha:]])', 'g') loop
    sq := sq || ' ' || regexp_replace(m[1], '[[:space:].*_-]', '', 'g');
  end loop;
  for t in select term from blocked_terms where kind = 'accent' loop
    if a ~ public.term_pattern(t.term) or sq ~ public.term_pattern(t.term) then return true; end if;
  end loop;
  u  := regexp_replace(translate(unaccent(a),  '0134578@$!', 'oieastbasi'), '[*_]', '', 'g');
  us := regexp_replace(translate(unaccent(sq), '0134578@$!', 'oieastbasi'), '[*_]', '', 'g');
  for t in select term from blocked_terms where kind = 'plain' loop
    if u ~ public.term_pattern(unaccent(t.term)) or us ~ public.term_pattern(unaccent(t.term)) then return true; end if;
  end loop;
  return false;
end $$;

-- Trả về NULL nếu nhận xét sạch, hoặc mã lỗi: empty | long | contact | profanity.
create function public.comment_problem(p text) returns text
language plpgsql stable security definer set search_path = public as $$
declare a text := lower(coalesce(p, ''));
begin
  if length(trim(a)) = 0 then return 'empty'; end if;
  if length(a) > 300 then return 'long'; end if;
  if a ~ '(https?://|www\.|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|(^|[^a-z0-9-])[a-z0-9-]+\.(com|net|org|vn|me|io|xyz|info)([^a-z]|$))'
     or a ~ '(^|[^0-9])(\+?84|0)([ .-]?[0-9]){8,10}($|[^0-9])' then
    return 'contact';
  end if;
  if public.text_profanity(a) then return 'profanity'; end if;
  return null;
end $$;

-- Chế độ "hệ thống tự duyệt" cho bài nộp: đọc chữ của tên, tổ/đơn vị, tiêu đề, nội dung, lựa chọn thăm dò, tên tệp.
create function public.post_flagged(p_author text, p_group text, p_title text, p_body text, p_poll jsonb, p_attachments jsonb) returns boolean
language sql stable security definer set search_path = public as $$
  select public.text_profanity(concat_ws(' ', p_author, p_group, p_title, p_body,
    (select string_agg(o->>'label', ' ') from jsonb_array_elements(coalesce(p_poll, '[]'::jsonb)) o),
    (select string_agg(o->>'name', ' ') from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) o)));
$$;

-- Người nộp hỏi trạng thái thật của bài vừa nộp (khách không đọc được bài chờ duyệt) bằng mã sửa bài của mình.
create function public.my_card_status(p_id uuid, p_edit_token text) returns text
language sql stable security definer set search_path = public as $$
  select status from cards where id = p_id and edit_token = p_edit_token;
$$;
grant execute on function public.my_card_status to anon, authenticated;

-- Học sinh chấm sao bài của bạn.
create function public.rate_card(p_card uuid, p_session text, p_stars int) returns void
language plpgsql security definer set search_path = public as $$
declare c cards; b boards;
begin
  select * into c from cards where id = p_card and kind = 'submission' and status in ('approved','featured');
  if not found then raise exception 'Không tìm thấy bài để chấm sao'; end if;
  select * into b from boards where id = c.board_id;
  if not b.allow_guest_post then raise exception 'Bảng đang khóa, chưa chấm sao được'; end if;
  if not coalesce((b.settings->>'peerStars')::boolean, true) then raise exception 'Giáo viên chưa bật chấm sao giữa các bạn'; end if;
  if length(coalesce(p_session, '')) < 8 then raise exception 'Thiếu mã phiên'; end if;
  if c.session_id is not distinct from p_session then raise exception 'Bạn không chấm sao cho bài của chính mình được'; end if;
  if p_stars not between 1 and 5 then raise exception 'Số sao từ 1 đến 5'; end if;
  insert into card_ratings(card_id, session_id, stars) values (p_card, p_session, p_stars)
  on conflict (card_id, session_id) do update set stars = excluded.stars, created_at = now();
end $$;

-- Học sinh nhận xét bài của bạn: kiểm duyệt ở máy chủ, giới hạn tốc độ.
create function public.post_comment(p_card uuid, p_session text, p_author text, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c cards; b boards; prob text; r comments; st text;
begin
  select * into c from cards where id = p_card and kind = 'submission' and status in ('approved','featured');
  if not found then raise exception 'Không tìm thấy bài để nhận xét'; end if;
  select * into b from boards where id = c.board_id;
  if not b.allow_guest_post then raise exception 'Bảng đang khóa, chưa nhận xét được'; end if;
  if not coalesce((b.settings->>'peerComments')::boolean, true) then raise exception 'Giáo viên chưa bật nhận xét giữa các bạn'; end if;
  if length(coalesce(p_session, '')) < 8 then raise exception 'Thiếu mã phiên'; end if;
  if length(trim(coalesce(p_author, ''))) = 0 then raise exception 'Hãy nhập tên của bạn'; end if;
  prob := public.comment_problem(p_body);
  if prob is null then prob := public.comment_problem(p_author); if prob in ('empty','long','contact') then prob := null; end if; end if;
  if prob = 'empty' then raise exception 'Hãy viết nội dung nhận xét.'; end if;
  if prob = 'long' then raise exception 'Nhận xét tối đa 300 ký tự.'; end if;
  if prob = 'contact' then raise exception 'Không đưa số điện thoại, email hoặc liên kết vào nhận xét.'; end if;
  if prob = 'profanity' then raise exception 'Nhận xét có từ chưa phù hợp. Hãy góp ý nhẹ nhàng, tôn trọng bạn nhé.'; end if;
  if (select count(*) from comments where board_id = c.board_id and session_id = p_session
        and created_at > now() - interval '1 minute') >= 5 then
    raise exception 'Bạn nhận xét nhanh quá, đợi một chút nhé.';
  end if;
  -- Chế độ kiểm duyệt: manual = nhận xét chờ giáo viên duyệt; off/auto = đã qua bộ lọc nên hiện ngay.
  st := case coalesce(b.settings->>'moderation', 'manual') when 'manual' then 'pending' else 'visible' end;
  insert into comments(card_id, board_id, author_name, body, session_id, status)
  values (p_card, c.board_id, trim(p_author), trim(p_body), p_session, st) returning * into r;
  return jsonb_build_object('id', r.id, 'card_id', r.card_id, 'author', r.author_name, 'body', r.body, 'at', r.created_at, 'status', r.status);
end $$;

-- Học sinh xóa nhận xét của chính mình trong 15 phút đầu.
create function public.delete_comment(p_id uuid, p_session text) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from comments where id = p_id and session_id = p_session and created_at > now() - interval '15 minutes';
  if not found then raise exception 'Không xóa được nhận xét này (đã quá 15 phút hoặc không phải của bạn)'; end if;
end $$;

grant execute on function public.rate_card, public.post_comment, public.delete_comment to anon, authenticated;

-- Trình bày thẻ tài liệu (nhãn nhỏ, màu, các bước)
alter table public.cards add column if not exists meta jsonb;
