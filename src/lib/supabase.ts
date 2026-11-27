import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

// Hai biến này lấy từ tệp .env (xem .env.example). Khóa "anon" được phép nằm ở trình duyệt:
// an toàn nhờ Row Level Security trong docs/schema.sql. TUYỆT ĐỐI không đưa khóa service_role vào đây.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Chạy thử an toàn: mở địa chỉ kèm ?thu=1 thì dùng dữ liệu mẫu, mọi thao tác chỉ nằm trong trình duyệt,
 * không đọc hay ghi máy chủ. Giữ cho tới khi đóng thẻ hoặc mở ?thu=0.
 */
function trialMode(): boolean {
  try {
    const flag = new URLSearchParams(window.location.search).get('thu');
    if (flag === '1') window.sessionStorage.setItem('bt.thu', '1');
    if (flag === '0') window.sessionStorage.removeItem('bt.thu');
    return window.sessionStorage.getItem('bt.thu') === '1';
  } catch { return false; }
}

/** null khi chưa cấu hình .env hoặc đang chạy thử → ứng dụng chạy bằng dữ liệu mẫu. */
export const supabase: SupabaseClient | null =
  url && anonKey && !trialMode() ? createClient(url, anonKey, { auth: { persistSession: true, detectSessionInUrl: true } }) : null;

export const isSupabaseConfigured: boolean = supabase !== null;
