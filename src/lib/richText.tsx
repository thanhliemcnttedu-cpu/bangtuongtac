import type { CSSProperties, ReactNode } from 'react';
import { FONTS } from './boardSettings';

/**
 * Định dạng chữ cho phần "Nội dung" của bài nộp, lưu thẳng trong cột văn bản sẵn có (không đổi cơ sở dữ liệu):
 *   [b]đậm[/b] · [i]nghiêng[/i] · [u]gạch chân[/u] · [c=#e11d48]chữ đỏ[/c]
 *   cỡ chữ [z=sm|lg|xl]…[/z] · phông chữ [f=pacifico]…[/f] (chỉ nhận mã trong danh sách của phần mềm)
 *   cả dòng căn giữa / phải: [center]…[/center], [right]…[/right]
 * Hiển thị bằng phần tử React (không chèn HTML thô) và chỉ nhận màu trong bảng màu cố định, nên người nộp bài không thể
 * chèn mã độc. Văn bản thường (bài cũ) vẫn hiện bình thường. Gặp thẻ hỏng thì bỏ qua thẻ, giữ nguyên chữ.
 */

export const RICH_COLORS: { name: string; hex: string }[] = [
  { name: 'Đỏ', hex: '#e11d48' }, { name: 'Cam', hex: '#ea580c' }, { name: 'Vàng', hex: '#ca8a04' }, { name: 'Xanh lá', hex: '#16a34a' },
  { name: 'Xanh ngọc', hex: '#0d9488' }, { name: 'Xanh dương', hex: '#1668f2' }, { name: 'Tím', hex: '#7c3aed' }, { name: 'Hồng', hex: '#db2777' },
  { name: 'Xám', hex: '#64748b' },
];
/** Màu chữ mặc định của phần mềm: chọn màu này nghĩa là bỏ màu. */
export const INK = '#0a1730';
const PALETTE = new Set(RICH_COLORS.map((c) => c.hex));

/** Cỡ chữ: tên, nhãn, cỡ hiển thị (em, theo chữ xung quanh) và số tương ứng của lệnh fontSize trong ô soạn. */
export const RICH_SIZES: { id: 'sm' | 'lg' | 'xl'; label: string; em: number; html: number }[] = [
  { id: 'sm', label: 'Nhỏ', em: 0.85, html: 2 },
  { id: 'lg', label: 'Lớn', em: 1.4, html: 5 },
  { id: 'xl', label: 'Rất lớn', em: 1.9, html: 6 },
];
const SIZE_BY_ID = new Map(RICH_SIZES.map((z) => [z.id as string, z]));
const sizeFromHtml = (n: string | null): string | undefined => {
  const v = Number(n);
  return v <= 2 && v >= 1 ? 'sm' : v >= 4 && v <= 5 ? 'lg' : v >= 6 ? 'xl' : undefined;
};
/** Tên phông (ví dụ "Pacifico" hoặc "'Be Vietnam Pro', sans-serif") → mã trong danh sách phông; lạ thì bỏ. */
const fontKey = (face: string | null | undefined): string | undefined => {
  if (!face) return undefined;
  const first = face.split(',')[0].replace(/["']/g, '').trim().toLowerCase();
  return Object.keys(FONTS).find((k) => FONTS[k].label.toLowerCase() === first || k === first);
};

export type Align = 'left' | 'center' | 'right';
interface Seg { text: string; b: boolean; i: boolean; u: boolean; c?: string; z?: string; f?: string }
interface Line { align?: Align; segs: Seg[] }

const TAG = /\[(\/?)(b|i|u|c|z|f)(?:=(#[0-9a-fA-F]{6}|[a-z0-9]{1,12}))?\]/g;

function parseLine(raw: string): Line {
  let align: Align | undefined;
  let s = raw;
  const m = /^\[(left|center|right)\]([\s\S]*)\[\/\1\]$/.exec(s);
  if (m) { align = m[1] as Align; s = m[2]; }
  const segs: Seg[] = [];
  let b = false; let i = false; let u = false;
  const colors: string[] = [];
  const zs: string[] = [];
  const fs: string[] = [];
  const push = (text: string): void => { if (text) segs.push({ text, b, i, u, c: colors[colors.length - 1] || undefined, z: zs[zs.length - 1] || undefined, f: fs[fs.length - 1] || undefined }); };
  let last = 0;
  TAG.lastIndex = 0;
  let t: RegExpExecArray | null;
  while ((t = TAG.exec(s)) !== null) {
    push(s.slice(last, t.index));
    last = t.index + t[0].length;
    const close = t[1] === '/';
    if (t[2] === 'b') b = !close;
    else if (t[2] === 'i') i = !close;
    else if (t[2] === 'u') u = !close;
    else if (t[2] === 'z') { if (close) zs.pop(); else zs.push(t[3] && SIZE_BY_ID.has(t[3]) ? t[3] : (zs[zs.length - 1] ?? '')); }
    else if (t[2] === 'f') { if (close) fs.pop(); else fs.push(t[3] && FONTS[t[3]] ? t[3] : (fs[fs.length - 1] ?? '')); }
    else if (close) colors.pop();
    else if (t[3] && PALETTE.has(t[3].toLowerCase())) colors.push(t[3].toLowerCase());
    else colors.push(colors[colors.length - 1] ?? '');
  }
  push(s.slice(last));
  return { align, segs };
}

export const parseRich = (text: string): Line[] => text.replace(/\r\n/g, '\n').split('\n').map(parseLine);

/** Bỏ hết thẻ định dạng, chỉ còn chữ (dùng khi lọc từ ngữ, xuất tệp, tóm tắt). */
export const stripRich = (text: string): string => text.replace(/\[\/?(?:b|i|u|c|z|f|left|center|right)(?:=(?:#[0-9a-fA-F]{6}|[a-z0-9]{1,12}))?\]/g, '');

/** Có thẻ định dạng nào không. */
export const hasRich = (text: string): boolean => /\[\/?(?:b|i|u|c|z|f|left|center|right)(?:=(?:#[0-9a-fA-F]{6}|[a-z0-9]{1,12}))?\]/.test(text);

function segNode(seg: Seg, key: string): ReactNode {
  if (!seg.b && !seg.i && !seg.u && !seg.c && !seg.z && !seg.f) return seg.text;
  const st: CSSProperties = {};
  if (seg.b) st.fontWeight = 800;
  if (seg.i) st.fontStyle = 'italic';
  if (seg.u) st.textDecoration = 'underline';
  if (seg.c) st.color = seg.c;
  if (seg.z) st.fontSize = `${SIZE_BY_ID.get(seg.z)?.em ?? 1}em`;
  if (seg.f && FONTS[seg.f]) st.fontFamily = FONTS[seg.f].family;
  return <span key={key} style={st}>{seg.text}</span>;
}

/**
 * Dựng nội dung để hiển thị. `inline`: các dòng cách nhau bằng xuống dòng và bỏ căn lề, dùng được trong khối cắt dòng (line-clamp).
 */
export function renderRich(text: string, opts: { inline?: boolean } = {}): ReactNode {
  const lines = parseRich(text);
  if (opts.inline) {
    return lines.map((ln, li) => (
      <span key={li}>{li > 0 && <br />}{ln.segs.map((s, si) => segNode(s, `${li}-${si}`))}</span>
    ));
  }
  return lines.map((ln, li) => (
    <span key={li} className="block min-h-[1.2em]" style={ln.align ? { textAlign: ln.align } : undefined}>
      {ln.segs.length === 0 ? '​' : ln.segs.map((s, si) => segNode(s, `${li}-${si}`))}
    </span>
  ));
}

/* ---------- Cầu nối với ô soạn thảo (contenteditable) ---------- */

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Văn bản định dạng → HTML để nạp vào ô soạn thảo (đã thoát ký tự, chỉ dùng b, i, u, font màu và căn lề). */
export function richToHtml(text: string): string {
  return parseRich(text).map((ln) => {
    const inner = ln.segs.map((s) => {
      let h = esc(s.text);
      if (s.u) h = `<u>${h}</u>`;
      if (s.i) h = `<i>${h}</i>`;
      if (s.b) h = `<b>${h}</b>`;
      if (s.c) h = `<font color="${s.c}">${h}</font>`;
      if (s.f && FONTS[s.f]) h = `<font face="${FONTS[s.f].label}">${h}</font>`;
      if (s.z && SIZE_BY_ID.has(s.z)) h = `<font size="${SIZE_BY_ID.get(s.z)?.html}">${h}</font>`;
      return h;
    }).join('');
    return `<div${ln.align && ln.align !== 'left' ? ` style="text-align:${ln.align}"` : ''}>${inner || '<br>'}</div>`;
  }).join('');
}

const rgbToHex = (v: string): string => {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(v);
  if (!m) return v.toLowerCase();
  return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
};
const paletteColor = (v: string | null | undefined): string | undefined => {
  if (!v) return undefined;
  const hex = rgbToHex(v.trim());
  return PALETTE.has(hex) ? hex : undefined;
};

interface Style { b: boolean; i: boolean; u: boolean; c?: string; z?: string; f?: string }

function wrapInline(text: string, st: Style): string {
  if (!text) return '';
  let out = text;
  if (st.u) out = `[u]${out}[/u]`;
  if (st.i) out = `[i]${out}[/i]`;
  if (st.b) out = `[b]${out}[/b]`;
  if (st.c) out = `[c=${st.c}]${out}[/c]`;
  if (st.f) out = `[f=${st.f}]${out}[/f]`;
  if (st.z) out = `[z=${st.z}]${out}[/z]`;
  return out;
}

const BLOCK = new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE']);

function inlineOf(node: Node, st: Style): string {
  if (node.nodeType === Node.TEXT_NODE) return wrapInline((node.textContent ?? '').replace(/​/g, ''), st);
  if (!(node instanceof HTMLElement)) return '';
  if (node.tagName === 'BR') return '\n';
  const next: Style = { ...st };
  const tag = node.tagName;
  if (tag === 'B' || tag === 'STRONG') next.b = true;
  if (tag === 'I' || tag === 'EM') next.i = true;
  if (tag === 'U') next.u = true;
  if (tag === 'FONT') {
    if (node.hasAttribute('color')) next.c = paletteColor(node.getAttribute('color'));
    if (node.hasAttribute('size')) next.z = sizeFromHtml(node.getAttribute('size'));
    if (node.hasAttribute('face')) next.f = fontKey(node.getAttribute('face'));
  }
  if (node.style.fontFamily) next.f = fontKey(node.style.fontFamily);
  const fw = node.style.fontWeight; if (fw === 'bold' || Number(fw) >= 600) next.b = true;
  if (node.style.fontStyle === 'italic') next.i = true;
  if (node.style.textDecorationLine?.includes('underline') || node.style.textDecoration?.includes('underline')) next.u = true;
  if (node.style.color) next.c = paletteColor(node.style.color);
  let out = '';
  node.childNodes.forEach((ch) => { out += inlineOf(ch, next); });
  return out;
}

function alignOf(el: HTMLElement): Align | undefined {
  const a = (el.style.textAlign || el.getAttribute('align') || '').toLowerCase();
  return a === 'center' || a === 'right' ? a : undefined;
}

const withAlign = (line: string, a: Align | undefined): string => (a && line !== '' ? `[${a}]${line}[/${a}]` : line);

function blockLines(el: HTMLElement, st: Style, inherited?: Align): string[] {
  const align = alignOf(el) ?? inherited;
  if ([...el.children].some((c) => BLOCK.has(c.tagName))) {
    const lines: string[] = [];
    let cur = '';
    let has = false;
    el.childNodes.forEach((ch) => {
      if (ch instanceof HTMLElement && BLOCK.has(ch.tagName)) {
        if (has) { lines.push(withAlign(cur, align)); cur = ''; has = false; }
        lines.push(...blockLines(ch, st, align));
      } else { cur += inlineOf(ch, st); has = true; }
    });
    if (has) lines.push(withAlign(cur, align));
    return lines;
  }
  return inlineOf(el, st).replace(/\n$/, '').split('\n').map((l) => withAlign(l, align));
}

/** Nội dung ô soạn thảo → văn bản định dạng (chuỗi lưu vào bài). */
export function domToRich(root: HTMLElement): string {
  const base: Style = { b: false, i: false, u: false };
  const lines: string[] = [];
  let cur = '';
  let has = false;
  root.childNodes.forEach((ch) => {
    if (ch instanceof HTMLElement && BLOCK.has(ch.tagName)) {
      if (has) { lines.push(cur); cur = ''; has = false; }
      lines.push(...blockLines(ch, base));
    } else if (ch instanceof HTMLElement && ch.tagName === 'BR') {
      lines.push(cur); cur = ''; has = false;
    } else { cur += inlineOf(ch, base); has = true; }
  });
  if (has) lines.push(cur);
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  // Gộp các thẻ liền kề cùng loại cho gọn: [b]a[/b][b]b[/b] → [b]ab[/b]
  let out = lines.join('\n');
  for (let prev = ''; prev !== out;) { prev = out; out = out.replace(/\[\/([biu])\]\[\1\]/g, ''); }
  return out;
}
