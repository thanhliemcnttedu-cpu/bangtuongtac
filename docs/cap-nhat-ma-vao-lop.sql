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
