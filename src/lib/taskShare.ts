/** Mã riêng của link chia sẻ "Công việc của tôi": 24 ký tự chữ và số, sinh bằng bộ số ngẫu nhiên của trình duyệt. */
export function newShareKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const buf = new Uint32Array(24);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join('');
}

/** Địa chỉ link chia sẻ theo mã. */
export const shareUrl = (key: string): string => `${window.location.origin}/v/${key}`;
