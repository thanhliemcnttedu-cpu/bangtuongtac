import { supabase } from './supabase';
import { gatewayVersion, loadDefaultGateway } from './drive';

export interface CheckItem {
  key: string;
  label: string;
  /** ok = có; missing = thiếu phần cập nhật; unknown = chưa kiểm được (mất mạng, chưa đăng nhập…). */
  state: 'ok' | 'missing' | 'unknown';
  /** Việc cần làm khi thiếu. */
  fix: string;
}

const SQL_FIX = 'Chạy docs/cap-nhat-tong-hop.sql trong Supabase → SQL Editor.';

/** Thiếu cột / bảng / hàm thì Supabase trả các mã này. */
const isMissing = (e: { code?: string; message?: string } | null): boolean =>
  !!e && (['42703', '42P01', 'PGRST202', 'PGRST204', 'PGRST205', '42883'].includes(e.code ?? '') || /does not exist|could not find|schema cache/i.test(e.message ?? ''));

async function probe(key: string, label: string, run: () => PromiseLike<{ error: { code?: string; message?: string } | null }>, fix = SQL_FIX): Promise<CheckItem> {
  try {
    const { error } = await run();
    if (!error) return { key, label, state: 'ok', fix: '' };
    return { key, label, state: isMissing(error) ? 'missing' : 'unknown', fix };
  } catch { return { key, label, state: 'unknown', fix }; }
}

/**
 * Kiểm tra máy chủ đã có đủ các phần cập nhật chưa (chỉ khi dùng Supabase thật, đã đăng nhập).
 * Chỉ đọc, không ghi gì. Mỗi mục thiếu kèm việc cần làm.
 */
export async function runSystemCheck(): Promise<CheckItem[]> {
  const db = supabase;
  if (!db) return [];
  const items = await Promise.all([
    probe('roster', 'Danh sách thành viên có vai trò và Gmail (tổ công tác)', () => db.from('board_roster').select('role,email').limit(0)),
    probe('tasks1', 'Công việc có tài liệu, minh chứng, chỉ đọc (tổ công tác)', () => db.from('board_tasks').select('attachments,needs_evidence,ack_only').limit(0)),
    probe('tasks2', 'Việc riêng, ưu tiên, giao theo Gmail (Công việc của tôi)', () => db.from('board_tasks').select('progress,priority,assignee_emails').limit(0)),
    probe('tasks3', 'Việc định kỳ hằng tuần / tháng', () => db.from('board_tasks').select('repeat_rule,series_id').limit(0)),
    probe('attendance', 'Điểm danh lớp tập huấn', () => db.from('board_attendance').select('day').limit(0)),
    probe('my_tasks', 'Gom việc người khác giao cho tôi (hàm my_tasks)', () => db.rpc('my_tasks')),
    probe('fingerprint', 'Tự làm mới và sửa bài bằng tên', () => db.rpc('board_fingerprint', { p_token: 'kiem-tra', p_manage: false })),
    probe('roster_public', 'Học sinh chọn tên trong danh sách (hàm get_roster_public)', () => db.rpc('get_roster_public', { p_token: 'kiem-tra' })),
  ]);
  // Cổng Google Drive (nếu đã kết nối trên máy này): phiên bản 4 mới gửi được email và gói ZIP từ Drive.
  const gw = loadDefaultGateway();
  if (gw) {
    try {
      const v = await gatewayVersion(gw);
      items.push({ key: 'gateway', label: `Cổng Google Drive (phiên bản ${v})`, state: v >= 4 ? 'ok' : 'missing', fix: 'Dán lại mã cổng mới ở Cài đặt bảng → Google Drive, triển khai lại và cho phép quyền gửi email.' });
    } catch { items.push({ key: 'gateway', label: 'Cổng Google Drive', state: 'unknown', fix: 'Không gọi được cổng. Kiểm tra địa chỉ và mật khẩu cổng.' }); }
  }
  return items;
}
