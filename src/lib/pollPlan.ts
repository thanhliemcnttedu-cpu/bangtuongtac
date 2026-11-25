/** Nhịp tự làm mới: lớp đang sôi nổi thì hỏi nhanh, lâu không có gì mới thì thưa dần để nhiều người dùng cùng lúc máy chủ vẫn chịu được. */
export function pollDelay(base: number, quietMs: number): number {
  if (quietMs < 2 * 60_000) return base;
  if (quietMs < 10 * 60_000) return base * 2;
  return base * 4;
}

/** Các bảng không mở trên màn hình chỉ cần hỏi thưa. */
export const SWEEP_MS = 30_000;

/** Lượt này hỏi những bảng nào: bảng đang xem mỗi lượt, cả loạt thì theo chu kỳ thưa. */
export function tokensToCheck(all: string[], watched: string, sinceSweepMs: number): { tokens: string[]; sweep: boolean } {
  if (sinceSweepMs >= SWEEP_MS) return { tokens: all, sweep: true };
  return { tokens: all.filter((t) => t === watched), sweep: false };
}
