import { supabase } from './supabase';
import type { NotifPrefs } from './notifications';

/**
 * Nhắc việc đẩy (Web Push): nhận thông báo cả khi đã đóng trang. Trình duyệt đăng ký với dịch vụ đẩy, phần mềm lưu đăng ký vào bảng
 * push_subscriptions (Supabase); hàm máy chủ send-reminders chạy định kỳ và gửi nhắc việc sắp / quá hạn (xem docs/HUONG-DAN-NHAC-VIEC-DAY.md).
 */
const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export type PushState = 'unsupported' | 'unconfigured' | 'denied' | 'off' | 'on';

export const pushSupported = (): boolean => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';

/** Đăng ký service worker một lần khi mở trang (cần cho cả việc cài ứng dụng). */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => { /* chạy không có service worker */ }); });
}

const toKey = (b64: string): Uint8Array => {
  const raw = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const prefsPayload = (p: NotifPrefs) => ({ soonHours: p.soonHours, overdue: p.overdue, report: p.report, items: p.items });

async function currentSub(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration('/');
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (!supabase || !VAPID_KEY) return 'unconfigured';
  if (Notification.permission === 'denied') return 'denied';
  try { return (await currentSub()) ? 'on' : 'off'; } catch { return 'off'; }
}

/** Xin quyền, đăng ký đẩy và lưu lên máy chủ. Ném lỗi bằng câu tiếng Việt khi không bật được. */
export async function enablePush(prefs: NotifPrefs): Promise<void> {
  if (!pushSupported()) throw new Error('Trình duyệt này không hỗ trợ nhắc đẩy. Trên iPhone, hãy thêm phần mềm vào Màn hình chính trước.');
  if (!supabase || !VAPID_KEY) throw new Error('Máy chủ chưa cấu hình nhắc đẩy (thiếu VITE_VAPID_PUBLIC_KEY). Xem docs/HUONG-DAN-NHAC-VIEC-DAY.md.');
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Hãy đăng nhập để bật nhắc đẩy.');
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Bạn chưa cho phép thông báo. Mở biểu tượng khóa cạnh địa chỉ trang để cho phép.');
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_KEY) as BufferSource });
  const j = sub.toJSON();
  if (!j.endpoint || !j.keys?.p256dh || !j.keys.auth) throw new Error('Trình duyệt trả về đăng ký đẩy không hợp lệ.');
  const { error } = await supabase.from('push_subscriptions').upsert({ user_id: u.user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, prefs: prefsPayload(prefs), updated_at: new Date().toISOString() }, { onConflict: 'endpoint' });
  if (error) throw new Error(/push_subscriptions|schema cache|does not exist/i.test(error.message) ? 'Máy chủ chưa có bảng nhắc đẩy. Hãy chạy docs/cap-nhat-nhac-viec-day.sql trong Supabase.' : `Không lưu được đăng ký: ${error.message}`);
}

export async function disablePush(): Promise<void> {
  const sub = pushSupported() ? await currentSub() : null;
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  if (supabase) await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
}

/** Đổi cài đặt nhắc (trước hạn mấy giờ, loại nhắc) thì cập nhật cho thiết bị đã đăng ký. Im lặng nếu chưa đăng ký. */
export async function syncPushPrefs(prefs: NotifPrefs): Promise<void> {
  if (!supabase || !pushSupported()) return;
  const sub = await currentSub().catch(() => null);
  if (!sub) return;
  await supabase.from('push_subscriptions').update({ prefs: prefsPayload(prefs), updated_at: new Date().toISOString() }).eq('endpoint', sub.endpoint);
}
