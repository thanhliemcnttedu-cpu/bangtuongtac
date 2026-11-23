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
              where c.board_id = b.id and (m or c.kind = 'resource' or c.status in ('approved','featured'))), '')
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
                   attachments = p_attachments, status = st where id = c.id;
  return st;
end $$;
grant execute on function public.update_card_by_code to anon, authenticated;
