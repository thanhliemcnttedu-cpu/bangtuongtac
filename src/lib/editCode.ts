/** Mã sửa bài: 10 ký tự dễ đọc, bỏ các ký tự dễ nhầm (0 O 1 I L), đủ dài để người lạ không đoán được. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newEditCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** Dạng dễ chép: ABCDE-FGHJK */
export const formatEditCode = (code: string): string => (code.length === 10 ? `${code.slice(0, 5)}-${code.slice(5)}` : code);

/** Học sinh gõ hoa hay thường, có hay không có dấu gạch, có khoảng trắng đều nhận. */
export const normalizeEditCode = (input: string): string => input.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Tên dùng làm chìa khóa: không phân biệt hoa thường, bỏ khoảng trắng thừa (khớp với hàm SQL get_cards_by_name). */
export const normalizeName = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();

const KEY = 'bt.myCodes';
export interface MyCode { code: string; title: string; token: string; at: number }

/** Các mã bài đã nộp trên trình duyệt này, để học sinh bấm chọn thay vì gõ lại. */
export function myCodes(boardToken: string): MyCode[] {
  try { return (JSON.parse(localStorage.getItem(KEY) ?? '[]') as MyCode[]).filter((c) => c.token === boardToken); } catch { return []; }
}
export function rememberCode(entry: MyCode): void {
  try {
    const all = (JSON.parse(localStorage.getItem(KEY) ?? '[]') as MyCode[]).filter((c) => c.code !== entry.code);
    localStorage.setItem(KEY, JSON.stringify([entry, ...all].slice(0, 30)));
  } catch { /* bỏ qua */ }
}
export function forgetCode(code: string): void {
  try { localStorage.setItem(KEY, JSON.stringify((JSON.parse(localStorage.getItem(KEY) ?? '[]') as MyCode[]).filter((c) => c.code !== code))); } catch { /* bỏ qua */ }
}
