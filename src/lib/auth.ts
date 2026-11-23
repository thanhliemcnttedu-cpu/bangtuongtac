import type { User } from '@supabase/supabase-js';
import type { GmailAccount } from '../types/board';
import { supabase } from './supabase';

const KNOWN_KEY = 'bt.knownAccounts';

function hueFromEmail(email: string): number {
  let h = 0;
  for (const ch of email) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function userToAccount(user: User): GmailAccount {
  const email = user.email ?? '';
  const meta = user.user_metadata as { full_name?: string; name?: string };
  return { id: user.id, email, name: meta.full_name ?? meta.name ?? email, hue: hueFromEmail(email) };
}

/**
 * Đăng nhập Google. `prompt: 'select_account'` luôn hiện danh sách Gmail để chọn,
 * nhờ đó giáo viên đổi qua lại giữa Gmail dạy học và Gmail công tác/tập huấn.
 * `loginHint` (tùy chọn) gợi sẵn một Gmail đã dùng trước đó.
 */
export async function signInWithGoogle(loginHint?: string): Promise<void> {
  if (!supabase) throw new Error('Chưa cấu hình Supabase (.env).');
  const queryParams: Record<string, string> = { prompt: 'select_account' };
  if (loginHint) queryParams.login_hint = loginHint;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin, queryParams },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** Danh sách Gmail đã từng đăng nhập trên trình duyệt này (chỉ email/tên, KHÔNG lưu mã phiên). */
export function loadKnownAccounts(): GmailAccount[] {
  try {
    const raw = localStorage.getItem(KNOWN_KEY);
    return raw ? (JSON.parse(raw) as GmailAccount[]) : [];
  } catch {
    return [];
  }
}

export function rememberAccount(account: GmailAccount): GmailAccount[] {
  const list = [account, ...loadKnownAccounts().filter((a) => a.email !== account.email)].slice(0, 6);
  try {
    localStorage.setItem(KNOWN_KEY, JSON.stringify(list));
  } catch {
    /* trình duyệt chặn lưu trữ: bỏ qua, chỉ mất tiện ích chuyển nhanh */
  }
  return list;
}
