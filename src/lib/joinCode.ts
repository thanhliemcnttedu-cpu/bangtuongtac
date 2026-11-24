/** Mã vào lớp: 6 chữ số, học sinh nhập ở trang chủ thay cho đường link. */

/** Chỉ giữ chữ số, tối đa 6 ký tự (học sinh hay gõ có dấu cách hoặc dán "482 915"). */
export const cleanJoinCode = (raw: string): string => raw.replace(/\D/g, '').slice(0, 6);

/** "482915" → "482 915" để dễ đọc và dễ chép tay. */
export const formatJoinCode = (code: string): string => (code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code);

/** Mã ngẫu nhiên 6 số, không bắt đầu bằng 0 (đọc to, chép tay đỡ nhầm). */
export function randomJoinCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(100000 + (buf[0] % 900000));
}

/** Người dùng dán cả đường link /b/<mã> vào ô mã: lấy luôn phần mã trong link để vào lớp. */
export function tokenFromLink(raw: string): string | null {
  const m = raw.trim().match(/\/b\/([A-Za-z0-9_-]{4,40})/);
  return m ? m[1] : null;
}
