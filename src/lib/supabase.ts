import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

// Hai biến này lấy từ tệp .env (xem .env.example). Khóa "anon" được phép nằm ở trình duyệt:
// an toàn nhờ Row Level Security trong docs/schema.sql. TUYỆT ĐỐI không đưa khóa service_role vào đây.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** null khi chưa cấu hình .env → ứng dụng chạy bằng dữ liệu mẫu. */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey, { auth: { persistSession: true, detectSessionInUrl: true } }) : null;

export const isSupabaseConfigured: boolean = supabase !== null;
