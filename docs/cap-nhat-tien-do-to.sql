-- =====================================================================
-- CẬP NHẬT: TIẾN ĐỘ NỘP CỦA TỔ CÔNG TÁC
-- Chạy MỘT LẦN trong Supabase → SQL Editor → New query → Run. Chạy lại nhiều lần vẫn an toàn.
-- Cho người có link bảng tổ thấy: ai đã nộp, ai chưa, nộp lúc nào,
-- kể cả khi tổ trưởng tắt "thành viên xem tệp của nhau".
-- Hàm KHÔNG trả nội dung, tệp đính kèm, điểm, mã sửa bài.
-- =====================================================================
create or replace function public.get_team_status(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b boards;
begin
  select * into b from boards where share_token = p_token and deleted_at is null;
  if not found or coalesce(b.settings->>'scope', '') <> 'team' then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
            'id', c.id, 'task_id', c.task_id, 'author_name', c.author_name, 'group_name', c.group_name,
            'status', c.status, 'late', c.late, 'created_at', c.created_at, 'resubmitted_at', c.resubmitted_at)
          order by c.created_at desc)
          from cards c where c.board_id = b.id and c.kind = 'submission'), '[]'::jsonb);
end $$;
grant execute on function public.get_team_status to anon, authenticated;
