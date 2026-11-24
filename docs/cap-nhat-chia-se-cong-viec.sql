-- =====================================================================
-- CẬP NHẬT: CHIA SẺ "CÔNG VIỆC CỦA TÔI" BẰNG LINK (chỉ xem, hoặc xem và sửa khi đăng nhập đúng Gmail chủ)
-- Chạy MỘT LẦN trong Supabase -> SQL Editor -> New query -> Run. Chạy lại nhiều lần vẫn an toàn.
-- Chỉ THÊM một hàm đọc công khai và một chỉ mục; không đổi bảng hay dữ liệu đang có.
-- Cần chạy sau cap-nhat-cong-viec-nang-cao.sql (bảng task_items).
--
-- Cách hoạt động:
--  * Chủ tài khoản bật chia sẻ trong trang "Công việc của tôi"; phần mềm tạo một mã chia sẻ riêng (không phải mã link của bảng)
--    và lưu trong cài đặt của bảng việc riêng.
--  * Ai có link đều ĐỌC được công việc (hàm này); không ai ghi được qua link: sửa chỉ làm được sau khi đăng nhập đúng Gmail chủ.
--  * Tắt chia sẻ hoặc tạo link mới thì link cũ ngừng hoạt động ngay.
-- Cách quay lại: drop function public.get_shared_tasks(text); drop index if exists public.boards_task_share_idx;
-- =====================================================================

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
