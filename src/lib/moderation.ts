// Bộ lọc nhận xét của học sinh: chặn từ ngữ không lành mạnh (chửi thề, xúc phạm, bắt nạt ngoại hình/trí tuệ,
// đe dọa, tình dục, tự hại) và thông tin liên lạc (số điện thoại, email, liên kết).
// Đây là lớp kiểm tra NHANH ở trình duyệt để học sinh thấy ngay lời nhắc; quyền quyết định cuối cùng nằm ở
// hàm `post_comment` trong CSDL (docs/schema.sql) dùng CÙNG danh sách src/data/blockedTerms.json.
import terms from '../data/blockedTerms.json';

export type CommentProblem = 'empty' | 'long' | 'profanity' | 'contact';
export const MAX_COMMENT = 300;

export const PROBLEM_MESSAGE: Record<CommentProblem, string> = {
  empty: 'Hãy viết nội dung nhận xét.',
  long: `Nhận xét tối đa ${MAX_COMMENT} ký tự.`,
  profanity: 'Nhận xét có từ chưa phù hợp. Hãy góp ý nhẹ nhàng, tôn trọng bạn nhé.',
  contact: 'Không đưa số điện thoại, email hoặc liên kết vào nhận xét.',
};

export type CommentCheck = { ok: true } | { ok: false; problem: CommentProblem; message: string };

const stripAccents = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', $: 's', '!': 'i' };
const leet = (s: string): string => s.replace(/[0134578@$!]/g, (c) => LEET[c] ?? c);
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Mỗi chữ cái cho phép lặp ("nguuuu"), các từ trong cụm cách nhau bằng khoảng trắng, và phải là từ nguyên vẹn. */
function termRegex(term: string): RegExp {
  const body = term
    .split(/\s+/)
    .map((w) => Array.from(w).map((ch) => `${escapeRe(ch)}+`).join(''))
    .join('\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'u');
}

const ACCENT_RE = terms.accent.map((t) => termRegex(t.toLowerCase()));
const PLAIN_RE = terms.plain.map((t) => termRegex(stripAccents(t.toLowerCase())));
const ALLOW = terms.allow.map((t) => t.toLowerCase());

/** Chữ cái tách rời để né lọc: "n g u", "n.g.u", "n-g-u" (từ 3 chữ trở lên). */
const SPACED = /(?<![\p{L}])(?:\p{L}[\s.\-_*]+){2,}\p{L}(?![\p{L}])/gu;

// Số điện thoại Việt Nam (0… hoặc +84…), có thể ngăn bằng dấu cách, chấm, gạch.
const PHONE = /(?<!\d)(?:\+?84|0)(?:[\s.\-]?\d){8,10}(?!\d)/;
const URL_OR_MAIL = /(https?:\/\/|www\.|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\b[a-z0-9-]+\.(com|net|org|vn|me|io|xyz|info)\b)/i;

/** TRUE nếu văn bản (đã hạ chữ thường) có từ ngữ không lành mạnh. Dùng cho cả nhận xét và chế độ tự duyệt bài. */
function profanityIn(lower: string): boolean {
  let cleaned = lower;
  for (const phrase of ALLOW) cleaned = cleaned.split(phrase).join(' ');
  const squashed = (cleaned.match(SPACED) ?? []).map((m) => m.replace(/[\s.\-_*]/g, '')).join(' ');

  const accentTexts = [cleaned, squashed];
  if (accentTexts.some((t) => t && ACCENT_RE.some((r) => r.test(t)))) return true;

  const plainTexts = accentTexts.map((t) => leet(stripAccents(t)).replace(/[*_]/g, ''));
  return plainTexts.some((t) => t && PLAIN_RE.some((r) => r.test(t)));
}

/** Chế độ "hệ thống tự duyệt" bài nộp: TRUE nếu bất kỳ đoạn chữ nào (tên, tiêu đề, nội dung, tên tệp…) có từ cần kiểm tra. */
export function textFlagged(parts: (string | undefined | null)[]): boolean {
  return profanityIn(parts.filter((p): p is string => !!p).join(' \n ').normalize('NFC').toLowerCase());
}

export function checkComment(raw: string): CommentCheck {
  const text = raw.normalize('NFC').trim();
  const fail = (problem: CommentProblem): CommentCheck => ({ ok: false, problem, message: PROBLEM_MESSAGE[problem] });
  if (!text) return fail('empty');
  if (text.length > MAX_COMMENT) return fail('long');

  const lower = text.toLowerCase();
  if (URL_OR_MAIL.test(lower) || PHONE.test(lower)) return fail('contact');
  if (profanityIn(lower)) return fail('profanity');
  return { ok: true };
}
