// Phần tính toán dùng chung của trình thiết kế sơ đồ tư duy: đo chữ, bố cục từng ô và vẽ ra ảnh PNG.
// Chữ xuống dòng được tính ở đây một lần để giao diện và ảnh xuất ra luôn giống nhau.

export const WORLD_W = 2400;
export const WORLD_H = 1500;
export const PAD = 10;

export const FONTS = {
  sans: '"Be Vietnam Pro", system-ui, sans-serif',
  serif: '"Lora", Georgia, serif',
  hand: '"Patrick Hand", "Comic Sans MS", cursive',
} as const;

export interface MMNode {
  id: string;
  parent: string | null;
  x: number;
  y: number;
  w: number;
  text: string;
  /** Ảnh dạng data URL (đã thu nhỏ) và tỉ lệ cao / rộng. */
  img?: string;
  imgRatio?: number;
  /** Ảnh gốc trước khi cắt / xoay, để khôi phục. */
  imgOrig?: string;
  /** Màu viền và màu nét nối (theo nhánh chính). */
  color: string;
  fill: string;
  textColor: string;
  /** 'sans' | 'serif' | 'hand' (font của phần mềm) hoặc tên một font bất kỳ trong máy / web font. */
  font: string;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: 'left' | 'center' | 'right';
  /** 0 = ô chính giữa, 1 = nhánh chính, 2+ = nhánh phụ. */
  level: number;
  /** Độ dày nét nối từ ô cha tới ô này (px); thiếu thì theo cấp. */
  thick?: number;
  /** Ô văn bản tự do (tên chủ đề, ghi chú): không nối với nhánh nào, kéo thả ở bất cứ đâu. */
  note?: boolean;
  /** Chiều cao tối thiểu do người dùng kéo (px); thiếu thì tự theo nội dung. */
  h?: number;
}

export const radiusOf = (n: MMNode): number => (n.note ? 12 : n.level === 0 ? 30 : 18);

export const defaultThick = (level: number): number => (level <= 1 ? 36 : 6);

let counter = 0;
export const newId = (): string => `n${Date.now().toString(36)}${(counter += 1).toString(36)}`;

let ctx: CanvasRenderingContext2D | null = null;
const measure = (): CanvasRenderingContext2D => {
  if (!ctx) ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ canvas');
  return ctx;
};

/** Đổi tên font thành khai báo CSS đầy đủ (kèm font dự phòng). */
export const cssFamily = (name: string): string => (name in FONTS ? FONTS[name as keyof typeof FONTS] : `"${name.replace(/"/g, '')}", system-ui, sans-serif`);

export const fontString = (n: Pick<MMNode, 'italic' | 'bold' | 'size' | 'font'>): string =>
  `${n.italic ? 'italic ' : ''}${n.bold ? 700 : 500} ${n.size}px ${cssFamily(n.font)}`;

function wrapText(n: MMNode): string[] {
  const c = measure();
  c.font = fontString(n);
  const maxW = n.w - PAD * 2 - 6;
  const out: string[] = [];
  for (const para of n.text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      let w = word;
      // Từ dài hơn cả dòng thì cắt theo ký tự.
      while (c.measureText(w).width > maxW && w.length > 1) {
        let k = w.length - 1;
        while (k > 1 && c.measureText(w.slice(0, k)).width > maxW) k -= 1;
        if (line) { out.push(line); line = ''; }
        out.push(w.slice(0, k));
        w = w.slice(k);
      }
      const t = line ? `${line} ${w}` : w;
      if (c.measureText(t).width <= maxW || !line) line = t;
      else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}

export interface NodeLayout { lines: string[]; lineH: number; imgH: number; h: number; auto: number; contentH: number }

export function layoutNode(n: MMNode): NodeLayout {
  const lines = n.text ? wrapText(n) : [];
  const lineH = Math.round(n.size * 1.3);
  const imgH = n.img ? Math.round((n.w - PAD * 2) * (n.imgRatio ?? 0.75)) : 0;
  const textH = lines.length * lineH;
  const contentH = PAD * 2 + imgH + (imgH && textH ? 6 : 0) + textH + 6;
  const auto = Math.max(44, contentH);
  return { lines, lineH, imgH, h: Math.max(auto, n.h ?? 0), auto, contentH };
}

/** Đọc ảnh, thu nhỏ tối đa 480px để sơ đồ nhẹ, trả về data URL và tỉ lệ cao / rộng. */
export function readImage(file: File): Promise<{ src: string; ratio: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 480 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      const g = c.getContext('2d');
      if (!g) { URL.revokeObjectURL(url); reject(new Error('canvas')); return; }
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve({ src: c.toDataURL('image/jpeg', 0.88), ratio: c.height / c.width });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}

/** Nét nối dạng "cành cây": dày ở gốc, thon dần về đầu cành. Trả về các điểm của đa giác để vẽ cả trên màn hình lẫn ảnh xuất. */
export function branchPolygon(a: { x: number; y: number }, b: { x: number; y: number }, thick: number): Array<[number, number]> {
  const mx = (a.x + b.x) / 2;
  const pt = (t: number): [number, number] => {
    const u = 1 - t;
    return [u * u * u * a.x + 3 * u * u * t * mx + 3 * u * t * t * mx + t * t * t * b.x, u * u * u * a.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t * t * t * b.y];
  };
  const left: Array<[number, number]> = [];
  const right: Array<[number, number]> = [];
  const N = 28;
  for (let i = 0; i <= N; i += 1) {
    const t = i / N;
    const [x, y] = pt(t);
    const [x2, y2] = pt(Math.min(1, t + 0.01));
    const [x1, y1] = pt(Math.max(0, t - 0.01));
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const nx = -(y2 - y1) / len; const ny = (x2 - x1) / len;
    // Gốc dày đúng độ dày đã chọn, thon nhanh về ngọn (còn khoảng 6%, tối thiểu 2px).
    const half = Math.max(1, thick * (0.06 + 0.94 * (1 - t) ** 1.3)) / 2;
    left.push([x + nx * half, y + ny * half]);
    right.push([x - nx * half, y - ny * half]);
  }
  return [...left, ...right.reverse()];
}

const loadImg = (src: string): Promise<HTMLImageElement> => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Vẽ toàn bộ sơ đồ (nét nối, ô, hình, chữ) thành ảnh PNG nền trắng. */
export interface PageRect { x: number; y: number; w: number; h: number }

export async function drawMindMapPng(nodes: MMNode[], page?: PageRect): Promise<Blob> {
  try {
    // Nạp đủ các font đang dùng (font web) trước khi vẽ để ảnh xuất ra đúng kiểu chữ.
    await Promise.all(nodes.map((n) => document.fonts.load(fontString(n), n.text || 'Aa')));
    await document.fonts?.ready;
  } catch { /* bỏ qua */ }
  const lay = new Map(nodes.map((n) => [n.id, layoutNode(n)]));
  // Có khổ trang: xuất đúng khung trang (phần nằm ngoài bị cắt); không thì ôm sát các nhánh.
  const minX = page ? page.x : Math.min(...nodes.map((n) => n.x)) - 40;
  const minY = page ? page.y : Math.min(...nodes.map((n) => n.y)) - 40;
  const maxX = page ? page.x + page.w : Math.max(...nodes.map((n) => n.x + n.w)) + 40;
  const maxY = page ? page.y + page.h : Math.max(...nodes.map((n) => n.y + (lay.get(n.id)?.h ?? 0))) + 40;
  const scale = Math.min(2, 4500 / Math.max(maxX - minX, maxY - minY));
  const c = document.createElement('canvas');
  c.width = Math.round((maxX - minX) * scale);
  c.height = Math.round((maxY - minY) * scale);
  const g = c.getContext('2d');
  if (!g) throw new Error('canvas');
  g.scale(scale, scale);
  g.translate(-minX, -minY);
  g.fillStyle = '#ffffff';
  g.fillRect(minX, minY, maxX - minX, maxY - minY);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const center = (n: MMNode) => ({ x: n.x + n.w / 2, y: n.y + (lay.get(n.id)?.h ?? 0) / 2 });
  g.lineCap = 'round';
  for (const n of nodes) {
    const p = n.parent ? byId.get(n.parent) : null;
    if (!p) continue;
    const a = center(p); const b = center(n); const mx = (a.x + b.x) / 2;
    void mx;
    const poly = branchPolygon(a, b, n.thick ?? defaultThick(n.level));
    g.fillStyle = n.color;
    g.beginPath(); poly.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y))); g.closePath(); g.fill();
  }

  for (const n of nodes) {
    const l = lay.get(n.id);
    if (!l) continue;
    const r = radiusOf(n);
    roundRect(g, n.x, n.y, n.w, l.h, r);
    g.fillStyle = n.fill; g.fill();
    g.lineWidth = 3; g.strokeStyle = n.color; g.stroke();
    // Ô cao hơn nội dung: nhánh thường căn giữa theo chiều dọc, ô văn bản căn trên (khớp với màn hình).
    let y = n.y + PAD + (n.note ? 0 : Math.max(0, (l.h - l.contentH) / 2));
    if (n.img && l.imgH) {
      const im = await loadImg(n.img);
      g.save(); roundRect(g, n.x + PAD, y, n.w - PAD * 2, l.imgH, 10); g.clip();
      const bw = n.w - PAD * 2; const k = Math.max(bw / im.width, l.imgH / im.height);
      g.drawImage(im, n.x + PAD + (bw - im.width * k) / 2, y + (l.imgH - im.height * k) / 2, im.width * k, im.height * k);
      g.restore();
      y += l.imgH + (l.lines.length ? 6 : 0);
    }
    g.font = fontString(n); g.fillStyle = n.textColor; g.textBaseline = 'middle';
    for (const line of l.lines) {
      const tw = g.measureText(line).width;
      const x = n.align === 'left' ? n.x + PAD : n.align === 'right' ? n.x + n.w - PAD - tw : n.x + (n.w - tw) / 2;
      g.fillText(line, x, y + l.lineH / 2);
      if (n.underline && line.trim()) {
        g.fillRect(x, y + l.lineH / 2 + n.size * 0.55, tw, Math.max(1, n.size / 14));
      }
      y += l.lineH;
    }
  }
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('png'))), 'image/png'));
}
