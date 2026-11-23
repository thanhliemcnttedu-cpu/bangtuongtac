import type { SubmissionCard } from '../types/board';

// Trình duyệt này nhớ: bài nào là của mình, mình đã chấm mấy sao, nhận xét nào của mình.
// Học sinh không có tài khoản nên đây là cách nhận ra "bài của bạn" (không chấm sao cho chính mình) và cho xóa nhận xét của mình.
const RATINGS_KEY = 'bt.myRatings';
const CARDS_KEY = 'bt.myCards';
const COMMENTS_KEY = 'bt.myComments';

function read<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}
function write(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* trình duyệt chặn lưu: mất tiện ích nhớ, không ảnh hưởng dữ liệu */ }
}

export const getMyRatings = (): Record<string, number> => read<Record<string, number>>(RATINGS_KEY, {});
export function rememberRating(cardId: string, stars: number): void { write(RATINGS_KEY, { ...getMyRatings(), [cardId]: stars }); }

export const getMyCardIds = (): Set<string> => new Set(read<string[]>(CARDS_KEY, []));
export function rememberMyCard(id: string): void { write(CARDS_KEY, [...new Set([...read<string[]>(CARDS_KEY, []), id])].slice(-200)); }

/** Mã nhận xét của mình → thời điểm gửi (ms): chỉ xóa được trong 15 phút đầu. */
export const getMyComments = (): Record<string, number> => read<Record<string, number>>(COMMENTS_KEY, {});
export function rememberMyComment(id: string): void { write(COMMENTS_KEY, { ...getMyComments(), [id]: Date.now() }); }

/** Điểm sao trung bình của các bạn, hoặc null nếu chưa ai chấm. */
export function ratingAvg(card: Pick<SubmissionCard, 'ratingCount' | 'ratingSum'>): number | null {
  const n = card.ratingCount ?? 0;
  return n > 0 ? (card.ratingSum ?? 0) / n : null;
}

export const formatStars = (n: number): string => (Math.round(n * 10) / 10).toString().replace('.', ',');
