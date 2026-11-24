-- =====================================================================
-- CẬP NHẬT: GIỚI HẠN NỘP BÀI 10 BÀI / 10 PHÚT (trước là 5 bài), nội dung tối đa 8000 ký tự (trước là 5000)
-- Chạy MỘT LẦN trong Supabase -> SQL Editor -> New query -> Run. Chạy lại nhiều lần vẫn an toàn.
-- Học sinh nộp nhiều bài hoặc nhiều ý tưởng liên tiếp không còn bị chặn quá sớm; vẫn chống spam theo từng trình duyệt.
-- Phần này cũng đã nằm trong cap-nhat-tong-hop.sql; chạy tệp tổng hợp thì không cần chạy tệp này.
-- =====================================================================

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
