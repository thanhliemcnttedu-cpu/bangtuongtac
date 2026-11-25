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
