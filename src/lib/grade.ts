/** Đọc điểm gõ vào: "8,5" hoặc "8.5"; để trống = bỏ điểm; ngoài 0–10 là lỗi. Làm tròn 1 chữ số thập phân. */
export function parseGrade(text: string): { ok: true; value: number | null } | { ok: false } {
  const t = text.trim().replace(',', '.');
  if (t === '') return { ok: true, value: null };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 10) return { ok: false };
  return { ok: true, value: Math.round(n * 10) / 10 };
}

export const formatGrade = (n: number): string => String(n).replace('.', ',');
