import { layoutNode, newId } from './mindmapCore';
import type { LinkStyle, MMNode } from './mindmapCore';

/** Mẫu kiểu sơ đồ tư duy để học sinh chọn: mỗi mẫu có cách nối nhánh, hình ô và bố cục riêng. */
export interface MindMapTemplate {
  id: LinkStyle;
  label: string;
  hint: string;
}

export const TEMPLATES: MindMapTemplate[] = [
  { id: 'branch', label: 'Cây nhánh tự nhiên', hint: 'Mặc định: nhánh cong thon dần, tỏa ra từ ý chính.' },
  { id: 'elbow', label: 'Sơ đồ khối (đường gấp khúc)', hint: 'Ô chữ nhật xếp từ trên xuống, nối bằng đường gấp khúc, như sơ đồ tổ chức.' },
  { id: 'arrow', label: 'Bong bóng và mũi tên', hint: 'Ô tròn trịa nối bằng mũi tên thẳng, hợp với phân loại, liệt kê.' },
  { id: 'indent', label: 'Cây thụt lề', hint: 'Các ý xếp dọc, thụt vào theo cấp, nối bằng đường gấp góc.' },
];

interface Look { fill: string; color: string; text: string; bold: boolean; radius: number }

/** Kiểu ô theo mẫu và theo cấp (0 = ô chính giữa); null = dùng kiểu mặc định của cây nhánh. */
export function lookFor(style: LinkStyle, level: number): Look | null {
  if (style === 'elbow') {
    if (level === 0) return { fill: '#2e9d4f', color: '#2e9d4f', text: '#ffffff', bold: true, radius: 6 };
    if (level === 1) return { fill: '#e0f2fe', color: '#1668f2', text: '#0a1730', bold: true, radius: 6 };
    return { fill: '#ffedd5', color: '#f59e0b', text: '#0a1730', bold: false, radius: 6 };
  }
  if (style === 'arrow') {
    if (level === 0) return { fill: '#f9a8d4', color: '#0ea5e9', text: '#0a1730', bold: true, radius: 999 };
    if (level === 1) return { fill: '#fbcfe8', color: '#0ea5e9', text: '#0a1730', bold: true, radius: 14 };
    return { fill: '#fce7f3', color: '#0ea5e9', text: '#0a1730', bold: false, radius: 14 };
  }
  if (style === 'indent') {
    if (level === 0) return { fill: '#65b741', color: '#0891b2', text: '#ffffff', bold: true, radius: 12 };
    if (level === 1) return { fill: '#86c95b', color: '#0891b2', text: '#0a1730', bold: true, radius: 12 };
    return { fill: '#bde59c', color: '#0891b2', text: '#0a1730', bold: false, radius: 12 };
  }
  return null;
}

interface Spec { text: string; kids?: Spec[] }

const SAMPLE: Spec = {
  text: 'Chủ đề chính',
  kids: [
    { text: 'Ý 1', kids: [{ text: 'Ý nhỏ 1a' }, { text: 'Ý nhỏ 1b' }] },
    { text: 'Ý 2', kids: [{ text: 'Ý nhỏ 2a' }] },
    { text: 'Ý 3', kids: [{ text: 'Ý nhỏ 3a' }, { text: 'Ý nhỏ 3b' }] },
  ],
};

function mkNode(style: LinkStyle, level: number, parent: string | null, text: string, w: number): MMNode {
  const lk = lookFor(style, level) ?? { fill: '#ffffff', color: '#1668f2', text: '#0a1730', bold: false, radius: 18 };
  const n: MMNode = {
    id: parent === null ? 'root' : newId(), parent, x: 0, y: 0, w, text, color: lk.color, fill: lk.fill, textColor: lk.text,
    font: 'sans', size: level === 0 ? 24 : level === 1 ? 20 : 17, bold: lk.bold, italic: false, underline: false, align: 'center', level, thick: 3, radius: lk.radius,
  };
  if (lk.radius >= 999) n.radius = Math.floor(layoutNode(n).h / 2);
  return n;
}

/** Dựng sơ đồ mẫu cho một kiểu, đặt giữa điểm (cx, cy). Chữ trong ô là chữ gợi ý để học sinh sửa. */
export function buildTemplate(style: LinkStyle, cx: number, cy: number, rootText: string): MMNode[] {
  const spec: Spec = { ...SAMPLE, text: rootText || SAMPLE.text };
  const out: MMNode[] = [];
  const widths = [220, 150, 130];
  const GAP = 26;
  if (style === 'indent') {
    // Danh sách dọc: mỗi ô một hàng, thụt vào 110px theo cấp.
    let row = 0;
    const ROW = 74;
    const walk = (s: Spec, level: number, parent: string | null): void => {
      const n = mkNode(style, level, parent, s.text, widths[Math.min(level, 2)] + (level === 0 ? 40 : 0));
      n.x = level * 110; n.y = row * ROW; row += 1;
      out.push(n);
      (s.kids ?? []).forEach((k) => walk(k, level + 1, n.id));
    };
    walk(spec, 0, null);
    const maxX = Math.max(...out.map((n) => n.x + n.w)); const maxY = Math.max(...out.map((n) => n.y + layoutNode(n).h));
    out.forEach((n) => { n.x = Math.round(n.x + cx - maxX / 2); n.y = Math.round(n.y + cy - maxY / 2); });
    return out;
  }
  // Cây từ trên xuống: lá xếp lần lượt, ô cha nằm giữa các ô con.
  let leaf = 0;
  const place = (s: Spec, level: number, parent: string | null): MMNode => {
    const n = mkNode(style, level, parent, s.text, widths[Math.min(level, 2)]);
    out.push(n);
    n.y = level * 130;
    const kids = (s.kids ?? []).map((k) => place(k, level + 1, n.id));
    if (kids.length === 0) { n.x = leaf; leaf += n.w + GAP; } else { n.x = (kids[0].x + kids[kids.length - 1].x + kids[kids.length - 1].w) / 2 - n.w / 2; }
    return n;
  };
  place(spec, 0, null);
  const minX = Math.min(...out.map((n) => n.x)); const maxX = Math.max(...out.map((n) => n.x + n.w)); const maxY = Math.max(...out.map((n) => n.y + layoutNode(n).h));
  out.forEach((n) => { n.x = Math.round(n.x - (minX + maxX) / 2 + cx); n.y = Math.round(n.y + cy - maxY / 2); });
  return out;
}
