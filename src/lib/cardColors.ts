/** Màu thẻ tài liệu do giáo viên chọn: vạch đầu thẻ, nền nhạt cho biểu tượng / nhãn, chữ và nút chính. */
export interface CardColor { id: string; label: string; bar: string; btn: string; soft: string; text: string }

export const CARD_COLORS: CardColor[] = [
  { id: 'blue', label: 'Xanh dương', bar: 'linear-gradient(90deg,#1668f2,#7aa8ff)', btn: 'linear-gradient(180deg,#4d98ff,#1262f0)', soft: '#e3eeff', text: '#0b4fd0' },
  { id: 'orange', label: 'Cam', bar: 'linear-gradient(90deg,#d9633a,#f4a98a)', btn: 'linear-gradient(180deg,#ec8a63,#c2552e)', soft: '#fde8df', text: '#b4441f' },
  { id: 'green', label: 'Xanh lá', bar: 'linear-gradient(90deg,#16a34a,#86efac)', btn: 'linear-gradient(180deg,#34c27a,#0f8f6c)', soft: '#dcfce7', text: '#166534' },
  { id: 'purple', label: 'Tím', bar: 'linear-gradient(90deg,#7c3aed,#c4b5fd)', btn: 'linear-gradient(180deg,#a26cf5,#6d2ed6)', soft: '#ede9fe', text: '#5b21b6' },
  { id: 'rose', label: 'Hồng đỏ', bar: 'linear-gradient(90deg,#e11d48,#fda4af)', btn: 'linear-gradient(180deg,#f0587a,#c81a43)', soft: '#ffe4e6', text: '#9f1239' },
  { id: 'amber', label: 'Vàng', bar: 'linear-gradient(90deg,#d97706,#fcd34d)', btn: 'linear-gradient(180deg,#f5ac2a,#d17a05)', soft: '#fef3c7', text: '#92400e' },
  { id: 'teal', label: 'Ngọc', bar: 'linear-gradient(90deg,#0d9488,#5eead4)', btn: 'linear-gradient(180deg,#2fb8aa,#0d7f76)', soft: '#ccfbf1', text: '#115e59' },
  { id: 'slate', label: 'Xám', bar: 'linear-gradient(90deg,#475569,#94a3b8)', btn: 'linear-gradient(180deg,#64748b,#3f4c5f)', soft: '#e2e8f0', text: '#334155' },
];

export const colorOf = (id?: string): CardColor | undefined => CARD_COLORS.find((c) => c.id === id);
