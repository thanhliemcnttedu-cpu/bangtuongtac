import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlignCenter, AlignLeft, AlignRight, Bold, Heading, StickyNote, Check, ClipboardPaste, ImagePlus, Italic, Maximize2, Minus, Pencil, Plus, Redo2, RotateCw, Trash2, Underline, Undo2, X,
} from 'lucide-react';
import { ColorPanel } from './ColorPanel';
import { ImageEditor } from './ImageEditor';
import { FontPicker } from './FontPicker';
import { PAD, cssFamily, radiusOf, WORLD_H, WORLD_W, branchPolygon, defaultThick, drawMindMapPng, layoutNode, newId, readImage } from './mindmapCore';
import type { MMNode } from './mindmapCore';

const BRANCH_COLORS = ['#1668f2', '#16a34a', '#f59e0b', '#e11d48', '#7c3aed', '#0d9488', '#ea580c'];

/** Khổ trang vẽ (px, 96 dpi): A4 = 210×297 mm, A0 = 841×1189 mm, Full HD = màn hình 1920×1080. */
const PAGES = [
  { id: 'free', label: 'Tự do (không giới hạn)', w: 0, h: 0 },
  { id: 'a4l', label: 'A4 ngang (1123×794)', w: 1123, h: 794 },
  { id: 'a4p', label: 'A4 dọc (794×1123)', w: 794, h: 1123 },
  { id: 'a0l', label: 'A0 ngang (4494×3179)', w: 4494, h: 3179 },
  { id: 'a0p', label: 'A0 dọc (3179×4494)', w: 3179, h: 4494 },
  { id: 'hd', label: 'Màn hình 1920×1080', w: 1920, h: 1080 },
] as const;
const MARGIN = 240;

interface Props {
  /** Tên sơ đồ (hiện trên đầu và đặt tên tệp). */
  title?: string;
  /** Chữ sẵn có ở ô trung tâm. */
  rootText?: string;
  onDone: (file: File) => void;
  onClose: () => void;
}

function makeRoot(text: string): MMNode {
  return { id: 'root', parent: null, x: WORLD_W / 2 - 110, y: WORLD_H / 2 - 40, w: 220, text, color: '#1668f2', fill: '#1668f2', textColor: '#ffffff', font: 'sans', size: 26, bold: true, italic: false, underline: false, align: 'center', level: 0 };
}

const rect = (n: MMNode) => ({ x: n.x, y: n.y, w: n.w, h: layoutNode(n).h });
const centerOf = (n: MMNode) => { const r = rect(n); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; };

/** Dòng chữ của một nhánh, vẽ bằng từng dòng riêng để khớp hoàn toàn với ảnh xuất ra. */
function NodeBody({ n }: { n: MMNode }) {
  const lay = layoutNode(n);
  return (
    <div style={{ padding: PAD, fontFamily: cssFamily(n.font), fontSize: n.size, fontWeight: n.bold ? 700 : 500, fontStyle: n.italic ? 'italic' : 'normal', lineHeight: `${lay.lineH}px`, color: n.textColor, textAlign: n.align }}>
      {n.img && <img src={n.img} alt="" draggable={false} style={{ width: n.w - PAD * 2, height: lay.imgH, objectFit: 'cover', borderRadius: 10, display: 'block', marginBottom: n.text ? 6 : 0, pointerEvents: 'none' }} />}
      {n.text && lay.lines.map((l, i) => <div key={i} style={{ minHeight: lay.lineH, textDecoration: n.underline ? 'underline' : 'none', whiteSpace: 'pre' }}>{l || ' '}</div>)}
    </div>
  );
}

/**
 * Trình thiết kế sơ đồ tư duy: kéo thả để đổi vị trí nhánh chính / nhánh phụ, thêm chữ hoặc hình (tải lên, dán), chỉnh phông,
 * cỡ chữ, đậm / nghiêng / gạch chân, căn lề và màu. Xuất ra ảnh PNG để nộp hoặc đính kèm tài liệu.
 */
export function MindMapEditor({ title = 'Sơ đồ tư duy', rootText = 'Ý chính', onDone, onClose }: Props) {
  const [nodes, setNodes] = useState<MMNode[]>(() => {
    const root = makeRoot(rootText);
    const kids: MMNode[] = ['Nhánh 1', 'Nhánh 2', 'Nhánh 3', 'Nhánh 4'].map((t, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 4 + Math.PI / 4;
      const w = 160;
      const c = BRANCH_COLORS[i];
      return { id: newId(), parent: 'root', x: WORLD_W / 2 + Math.cos(a) * 330 - w / 2, y: WORLD_H / 2 + Math.sin(a) * 210 - 30, w, text: t, color: c, fill: c, textColor: '#ffffff', font: 'sans', size: 20, bold: true, italic: false, underline: false, align: 'center', level: 1 } as MMNode;
    });
    return [root, ...kids];
  });
  const [sel, setSelRaw] = useState('root');
  // Chọn nhiều nhánh: giữ Shift / Ctrl (Cmd) khi bấm, hoặc bật nút “Chọn nhiều” trên máy cảm ứng.
  const [extra, setExtra] = useState<string[]>([]);
  const [pickMode, setPickMode] = useState(false);
  const [withKids, setWithKids] = useState(false);
  const [pageId, setPageId] = useState<(typeof PAGES)[number]['id']>('free');
  const [cropFor, setCropFor] = useState<string | null>(null);
  const [colorTarget, setColorTarget] = useState<'link' | 'fill' | 'text' | null>(null);
  const [eyedrop, setEyedrop] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('mm-recent') ?? '[]') as string[]; } catch { return []; } });
  const setSel = (id: string): void => { setSelRaw(id); setExtra([]); };
  const [editing, setEditing] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.7);
  const [busy, setBusy] = useState(false);
  // Điện thoại: thanh định dạng chữ gập lại mặc định để vùng vẽ còn đủ rộng.
  const [fmtOpen, setFmtOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const past = useRef<MMNode[][]>([]);
  const future = useRef<MMNode[][]>([]);
  const box = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(0.7);
  const worldRef = useRef({ w: WORLD_W, h: WORLD_H, px: 0, py: 0, pw: 0, ph: 0 });
  const pendingScroll = useRef<{ x: number; y: number } | null>(null);
  const anchor = useRef<{ wx: number; wy: number; mx: number; my: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ id: string; sx: number; sy: number; start: MMNode[]; moved: boolean; ids: Set<string> } | null>(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  zoomRef.current = zoom;
  const pg = PAGES.find((x) => x.id === pageId) ?? PAGES[0];
  const paged = pg.w > 0;
  // Bảng làm việc: khổ trang cộng lề xung quanh; chế độ tự do dùng bảng cố định 2400×1500.
  const world = paged ? { w: pg.w + MARGIN * 2, h: pg.h + MARGIN * 2, px: MARGIN, py: MARGIN, pw: pg.w, ph: pg.h } : { w: WORLD_W, h: WORLD_H, px: 0, py: 0, pw: 0, ph: 0 };
  worldRef.current = world;
  const selected = nodes.find((n) => n.id === sel) ?? nodes[0];
  const selIds = [...extra.filter((id) => id !== sel && nodes.some((n) => n.id === id)), selected.id];
  const many = selIds.length > 1;
  const onlyRoot = selIds.every((id) => id === 'root');
  /** Chỉ gồm ô chính giữa và ô văn bản tự do: không có nhánh nối để chỉnh độ dày / màu nối. */
  const noLink = selIds.every((id) => id === 'root' || nodes.find((n) => n.id === id)?.note);
  /** Áp một thay đổi định dạng cho tất cả nhánh đang chọn. */
  /** Đổi màu nhánh nối (và viền) của các nhánh đang chọn; chỉ áp cho nhánh con của chúng khi bật “Cả nhánh con”. */
  const patchColor = (c: string): void => {
    const isNote = (id: string): boolean => !!nodesRef.current.find((n) => n.id === id)?.note;
    const ids = new Set<string>(selIds.filter((id) => id !== 'root' && !isNote(id)));
    // Ô chính giữa chỉ là điểm xuất phát: chọn nó không được kéo theo mọi nhánh khác.
    if (withKids) selIds.filter((id) => id !== 'root' && !isNote(id)).forEach((id) => subtree(id, nodesRef.current).forEach((x) => ids.add(x)));
    if (ids.size === 0) { setMsg('Ô chính giữa không có nhánh nối. Hãy chọn một nhánh khác.'); return; }
    commit(nodesRef.current.map((n) => (ids.has(n.id) ? { ...n, color: c } : n)));
  };
  /** Áp màu theo mục đang tô (nhánh nối / nền ô / chữ) và nhớ vào danh sách màu vừa dùng. */
  const applyColor = (c: string): void => {
    if (colorTarget === 'link') patchColor(c);
    else if (colorTarget === 'fill') patchSel({ fill: c });
    else if (colorTarget === 'text') patchSel({ textColor: c });
    setRecent((r) => { const next = [c, ...r.filter((x) => x !== c)].slice(0, 8); try { localStorage.setItem('mm-recent', JSON.stringify(next)); } catch { /* bỏ qua */ } return next; });
  };
  const patchSel = (p: Partial<MMNode>): void => commit(nodesRef.current.map((n) => (selIds.includes(n.id) ? { ...n, ...p } : n)));

  const commit = useCallback((next: MMNode[]) => {
    past.current = [...past.current.slice(-39), nodesRef.current];
    future.current = [];
    setNodes(next);
  }, []);
  const undo = (): void => { const p = past.current.pop(); if (!p) return; future.current.push(nodesRef.current); setNodes(p); setEditing(null); };
  const redo = (): void => { const f = future.current.pop(); if (!f) return; past.current.push(nodesRef.current); setNodes(f); setEditing(null); };
  const patch = (id: string, p: Partial<MMNode>): void => commit(nodesRef.current.map((n) => (n.id === id ? { ...n, ...p } : n)));

  // Vừa khung: thu phóng để thấy hết các nhánh khi mở.
  const fit = useCallback((list: MMNode[] = nodesRef.current) => {
    const el = box.current;
    if (!el) return;
    const w0 = worldRef.current;
    const rs = w0.pw > 0 ? [{ x: w0.px, y: w0.py, w: w0.pw, h: w0.ph }] : list.map(rect);
    const minX = Math.min(...rs.map((r) => r.x)); const maxX = Math.max(...rs.map((r) => r.x + r.w));
    const minY = Math.min(...rs.map((r) => r.y)); const maxY = Math.max(...rs.map((r) => r.y + r.h));
    const z = Math.max(0.05, Math.min(1.4, Math.min(el.clientWidth / (maxX - minX + 100), el.clientHeight / (maxY - minY + 100))));
    pendingScroll.current = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    if (Math.abs(z - zoomRef.current) < 0.0001) { el.scrollLeft = Math.max(0, ((minX + maxX) / 2) * z - el.clientWidth / 2); el.scrollTop = Math.max(0, ((minY + maxY) / 2) * z - el.clientHeight / 2); pendingScroll.current = null; } else setZoom(z);
  }, []);
  // Cuộn tới vùng có nhánh sau khi khung đã đổi cỡ theo mức thu phóng mới.
  useLayoutEffect(() => {
    const el = box.current;
    const t = pendingScroll.current;
    const an = anchor.current;
    if (el && an) { el.scrollLeft = Math.max(0, an.wx * zoom - an.mx); el.scrollTop = Math.max(0, an.wy * zoom - an.my); anchor.current = null; return; }
    if (!el || !t) return;
    el.scrollLeft = Math.max(0, t.x * zoom - el.clientWidth / 2);
    el.scrollTop = Math.max(0, t.y * zoom - el.clientHeight / 2);
    pendingScroll.current = null;
  }, [zoom]);
  useEffect(() => {
    fit();
    // Bố cục thanh công cụ chỉ ổn định sau khi vẽ xong, nên vừa khung lại một lần nữa.
    const t = window.setTimeout(() => fit(), 150);
    return () => window.clearTimeout(t);
  }, [fit]);

  const subtree = (id: string, list: MMNode[]): Set<string> => {
    const out = new Set([id]);
    let grew = true;
    while (grew) { grew = false; for (const n of list) if (n.parent && out.has(n.parent) && !out.has(n.id)) { out.add(n.id); grew = true; } }
    return out;
  };

  const addChild = (extra: Partial<MMNode> = {}): string => {
    const list = nodesRef.current;
    const p0 = list.find((n) => n.id === sel);
    const p = p0 && !p0.note ? p0 : list[0];
    const kids = list.filter((n) => n.parent === p.id);
    const pc = centerOf(p);
    const par = p.parent ? list.find((n) => n.id === p.parent) : null;
    const base = par ? Math.atan2(pc.y - centerOf(par).y, pc.x - centerOf(par).x) : -Math.PI / 2;
    const k = kids.length;
    const angle = par ? base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.6 : base + (k * 2 * Math.PI) / Math.max(5, k + 1);
    const level = p.level + 1;
    const w = level === 1 ? 160 : 140;
    const color = level === 1 ? BRANCH_COLORS[k % BRANCH_COLORS.length] : p.color;
    let dist = (par ? 210 : 330) + (extra.img ? 40 : 0);
    const mk = (): MMNode => ({
      id: newId(), parent: p.id, w, text: 'Nhánh mới', color, level, font: 'sans', size: level === 1 ? 20 : 17, bold: level === 1, italic: false, underline: false, align: 'center',
      fill: level === 1 ? color : '#ffffff', textColor: level === 1 ? '#ffffff' : '#0a1730',
      x: 0, y: 0, ...extra,
    });
    let n = mk();
    const h = layoutNode(n).h;
    for (let i = 0; i < 14; i += 1) {
      n = { ...n, x: Math.max(10, Math.min(world.w - w - 10, pc.x + Math.cos(angle) * dist - w / 2)), y: Math.max(10, Math.min(world.h - h - 10, pc.y + Math.sin(angle) * dist * 0.7 - h / 2)) };
      const hit = list.some((o) => { const r = rect(o); return n.x < r.x + r.w + 14 && n.x + w + 14 > r.x && n.y < r.y + r.h + 14 && n.y + h + 14 > r.y; });
      if (!hit) break;
      dist += 45;
    }
    commit([...list, n]);
    setSel(n.id);
    return n.id;
  };

  /** Thêm ô văn bản tự do ở giữa vùng đang nhìn: kind 'topic' = tên chủ đề (chữ to, không nền), 'note' = ghi chú. */
  const addNote = (kind: 'topic' | 'note'): void => {
    const list = nodesRef.current;
    const el = box.current;
    const w = kind === 'topic' ? 320 : 210;
    // Đặt ở mép trên của vùng đang nhìn để không đè lên sơ đồ: tên chủ đề ở giữa phía trên, ghi chú ở góc trái.
    const left = el ? el.scrollLeft / zoom : 0;
    const top = el ? el.scrollTop / zoom : 0;
    const viewW = el ? el.clientWidth / zoom : world.w;
    const nth = list.filter((n) => n.note && (kind === 'topic') === (n.fill === 'transparent')).length;
    const px = kind === 'topic' ? left + viewW / 2 - w / 2 : left + 24 + (nth % 4) * 14;
    const py = kind === 'topic' ? top + 16 + (nth % 4) * 14 : top + 90 + (nth % 4) * 90;
    const n: MMNode = {
      id: newId(), parent: null, note: true, level: 2, w, text: kind === 'topic' ? 'Tên chủ đề' : 'Ghi chú',
      // Có khổ trang thì ô mới nằm trong khung trang.
      x: world.pw > 0 ? Math.max(world.px + 10, Math.min(world.px + world.pw - w - 10, px)) : Math.max(10, Math.min(world.w - w - 10, px)),
      y: world.pw > 0 ? Math.max(world.py + 10, Math.min(world.py + world.ph - 120, py)) : Math.max(10, py),
      color: kind === 'topic' ? 'transparent' : '#f59e0b', fill: kind === 'topic' ? 'transparent' : '#fef3c7', textColor: '#0a1730',
      font: 'sans', size: kind === 'topic' ? 34 : 18, bold: kind === 'topic', italic: false, underline: false, align: kind === 'topic' ? 'center' : 'left',
    };
    commit([...list, n]);
    setSel(n.id);
    setEditing(n.id);
  };

  /** Đổi khổ trang: dời cả sơ đồ vào giữa trang và co / giãn cho vừa (không nhỏ quá 25%, không to quá 4 lần). */
  const changePage = (id: (typeof PAGES)[number]['id']): void => {
    const target = PAGES.find((x) => x.id === id) ?? PAGES[0];
    const list = nodesRef.current;
    const rs = list.map(rect);
    const minX = Math.min(...rs.map((r) => r.x)); const maxX = Math.max(...rs.map((r) => r.x + r.w));
    const minY = Math.min(...rs.map((r) => r.y)); const maxY = Math.max(...rs.map((r) => r.y + r.h));
    const bw = maxX - minX; const bh = maxY - minY;
    const t = target.w > 0 ? { cx: MARGIN + target.w / 2, cy: MARGIN + target.h / 2, w: target.w, h: target.h } : { cx: WORLD_W / 2, cy: WORLD_H / 2, w: WORLD_W - 200, h: WORLD_H - 200 };
    const f = target.w > 0 ? Math.max(0.25, Math.min(4, Math.min((t.w - 120) / bw, (t.h - 120) / bh))) : 1;
    const ccx = (minX + maxX) / 2; const ccy = (minY + maxY) / 2;
    commit(list.map((n) => ({
      ...n,
      x: Math.round(t.cx + (n.x - ccx) * f), y: Math.round(t.cy + (n.y - ccy) * f),
      w: Math.round(n.w * f), h: n.h ? Math.round(n.h * f) : undefined, size: Math.max(8, Math.round(n.size * f)),
      thick: n.thick !== undefined ? Math.max(2, Math.round(n.thick * f)) : f === 1 ? undefined : Math.max(2, Math.round(defaultThick(n.level) * f)),
    })));
    setPageId(id);
    worldRef.current = target.w > 0 ? { w: target.w + MARGIN * 2, h: target.h + MARGIN * 2, px: MARGIN, py: MARGIN, pw: target.w, ph: target.h } : { w: WORLD_W, h: WORLD_H, px: 0, py: 0, pw: 0, ph: 0 };
    window.setTimeout(() => fit(), 60);
  };

  const remove = (): void => {
    const targets = selIds.filter((id) => id !== 'root');
    if (targets.length === 0) { setMsg('Không xóa được ô chính giữa. Hãy chọn một nhánh khác.'); return; }
    const gone = new Set<string>();
    targets.forEach((id) => subtree(id, nodes).forEach((x) => gone.add(x)));
    commit(nodes.filter((n) => !gone.has(n.id)));
    setSel(nodes.find((n) => n.id === targets[0])?.parent ?? 'root');
    setEditing(null);
  };

  const addImage = async (files: File[], parentSel = true): Promise<void> => {
    const f = files.find((x) => x.type.startsWith('image/'));
    if (!f) { setMsg('Chỉ thêm được tệp ảnh (jpg, png, webp).'); return; }
    try {
      const { src, ratio } = await readImage(f);
      // Hình gắn vào chính nhánh đang chọn (nhánh vẫn giữ chữ mô tả bên dưới hình); thay hình cũ nếu đã có.
      if (parentSel && selected) { patch(selected.id, { img: src, imgOrig: src, imgRatio: ratio, w: Math.max(selected.w, 170) }); setMsg(''); return; }
      else addChild({ img: src, imgOrig: src, imgRatio: ratio, text: '', w: 170 });
      setMsg('');
    } catch { setMsg('Không đọc được ảnh này. Hãy thử ảnh khác.'); }
  };

  const pasteBtn = async (): Promise<void> => {
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) { await addImage([new File([await item.getType(type)], 'dan.png', { type })]); return; }
      }
      setMsg('Chưa có ảnh trong bộ nhớ tạm. Hãy sao chép ảnh rồi bấm lại, hoặc nhấn Ctrl+V.');
    } catch { setMsg('Trình duyệt chưa cho đọc bộ nhớ tạm. Hãy nhấn Ctrl+V để dán ảnh.'); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const typing = (e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.tagName === 'INPUT';
      if (e.key === 'Escape') { if (editing) setEditing(null); else onClose(); }
      if (typing) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && !onlyRoot) { e.preventDefault(); remove(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); const all = nodesRef.current.map((n) => n.id); setSelRaw(all[all.length - 1]); setExtra(all.slice(0, -1)); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    };
    const onPaste = (e: ClipboardEvent): void => {
      // Ảnh luôn được nhận (Ctrl+V, Win+V, chuột phải → Dán), kể cả khi con trỏ đang ở ô gõ chữ.
      const cd = e.clipboardData;
      const files = Array.from(cd?.files ?? []);
      for (const it of Array.from(cd?.items ?? [])) { if (it.kind === 'file' && it.type.startsWith('image/')) { const f = it.getAsFile(); if (f && !files.includes(f)) files.push(f); } }
      if (files.some((f) => f.type.startsWith('image/'))) { e.preventDefault(); e.stopPropagation(); if (editing) setEditing(null); void addImage(files); return; }
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      const text = e.clipboardData?.getData('text/plain')?.trim();
      if (text) { e.preventDefault(); e.stopPropagation(); addChild({ text: text.slice(0, 120) }); }
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('paste', onPaste, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('paste', onPaste, true); document.body.style.overflow = prev; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, extra, editing, nodes]);

  // Kéo thả: kéo một nhánh thì cả các nhánh con đi theo.
  const down = (e: RPointerEvent, n: MMNode): void => {
    if (editing === n.id || e.button === 1) return;
    e.stopPropagation();
    if (eyedrop) {
      const c = colorTarget === 'text' ? n.textColor : colorTarget === 'link' ? n.color : n.fill;
      setEyedrop(false); setMsg('');
      applyColor(c);
      return;
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const add = e.shiftKey || e.ctrlKey || e.metaKey || pickMode;
    if (add) {
      // Thêm / bớt nhánh khỏi nhóm đang chọn, không kéo.
      if (selIds.includes(n.id) && selIds.length > 1) { const rest = selIds.filter((x) => x !== n.id); setSelRaw(rest[rest.length - 1]); setExtra(rest.slice(0, -1)); }
      else if (!selIds.includes(n.id)) { setExtra(selIds); setSelRaw(n.id); }
      return;
    }
    // Bấm vào một nhánh đã nằm trong nhóm thì giữ nhóm để kéo cả nhóm; bấm nhánh khác thì chọn riêng nhánh đó.
    const group = selIds.includes(n.id) ? selIds : [n.id];
    if (!selIds.includes(n.id)) setSel(n.id);
    const ids = new Set<string>();
    group.forEach((g) => subtree(g, nodesRef.current).forEach((x) => ids.add(x)));
    drag.current = { id: n.id, sx: e.clientX, sy: e.clientY, start: nodesRef.current, moved: false, ids };
  };
  const move = (e: RPointerEvent): void => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / zoom; const dy = (e.clientY - d.sy) / zoom;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
    d.moved = true;
    setNodes(d.start.map((n) => (d.ids.has(n.id) ? { ...n, x: Math.max(0, Math.min(world.w - n.w, n.x + dx)), y: Math.max(0, Math.min(world.h - 40, n.y + dy)) } : n)));
  };
  const up = (): void => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) { past.current = [...past.current.slice(-39), d.start]; future.current = []; }
  };

  // Đổi cỡ bằng 8 ô vuông quanh nhánh đang chọn: cạnh trái / phải đổi độ rộng, cạnh trên / dưới đổi độ cao,
  // bốn góc đổi cả hai; giữ Shift khi kéo góc để phóng to / thu nhỏ cả chữ theo tỉ lệ.
  type RzKind = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
  const rz = useRef<{ id: string; kind: RzKind; sx: number; sy: number; start: MMNode[]; n0: MMNode; h0: number; moved: boolean } | null>(null);
  const rzDown = (e: RPointerEvent, n: MMNode, kind: RzKind): void => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    rz.current = { id: n.id, kind, sx: e.clientX, sy: e.clientY, start: nodesRef.current, n0: n, h0: layoutNode(n).h, moved: false };
  };
  const rzMove = (e: RPointerEvent): void => {
    const r = rz.current;
    if (!r) return;
    const dx = (e.clientX - r.sx) / zoom; const dy = (e.clientY - r.sy) / zoom;
    if (!r.moved && Math.abs(dx) + Math.abs(dy) < 2) return;
    r.moved = true;
    const { n0, kind } = r;
    const minW = n0.level === 0 ? 120 : 80;
    const hasE = kind.includes('e'); const hasW = kind.includes('w'); const hasN = kind.includes('n'); const hasS = kind.includes('s');
    let w = n0.w; let x = n0.x; let y = n0.y; let h: number | undefined = n0.h; let size = n0.size;
    if (hasE) w = n0.w + dx;
    if (hasW) w = n0.w - dx;
    w = Math.round(Math.max(minW, Math.min(1200, w)));
    if (hasW) x = n0.x + (n0.w - w);
    if (e.shiftKey && kind.length === 2) {
      // Phóng to / thu nhỏ cả ô theo tỉ lệ độ rộng, chữ đổi theo.
      size = Math.max(8, Math.min(120, Math.round((n0.size * w) / n0.w)));
      h = undefined;
    } else if (hasN || hasS) {
      const want = Math.max(30, Math.round(hasS ? r.h0 + dy : r.h0 - dy));
      h = want;
      if (hasN) { const real = layoutNode({ ...n0, w, size, h: want }).h; y = n0.y + (r.h0 - real); }
    }
    setNodes(r.start.map((n) => (n.id === r.id ? { ...n, w, x: Math.max(0, x), y: Math.max(0, y), h, size } : n)));
  };
  const rzUp = (): void => {
    const r = rz.current;
    rz.current = null;
    if (r?.moved) { past.current = [...past.current.slice(-39), r.start]; future.current = []; }
  };

  /** Thu phóng giữ nguyên điểm dưới con trỏ (hoặc giữa hai ngón tay). */
  const zoomAt = useCallback((next: number, clientX: number, clientY: number) => {
    const el = box.current;
    if (!el) return;
    const z = Math.max(0.05, Math.min(3, next));
    const r = el.getBoundingClientRect();
    const mx = clientX - r.left; const my = clientY - r.top;
    anchor.current = { wx: (el.scrollLeft + mx) / zoomRef.current, wy: (el.scrollTop + my) / zoomRef.current, mx, my };
    setZoom(z);
  }, []);

  // Cuộn chuột = phóng to / thu nhỏ nhanh quanh con trỏ (Ctrl + cuộn hoặc chụm hai ngón trên bàn di chuột cũng vậy); Shift + cuộn = đi ngang.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      if (e.shiftKey) { el.scrollLeft += e.deltaY || e.deltaX; return; }
      zoomAt(zoomRef.current * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // Kéo vào chỗ trống (hoặc giữ nút giữa chuột) để di chuyển giữa các vùng; hai ngón chụm để thu phóng.
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const panRef = useRef<{ sx: number; sy: number; sl: number; st: number; moved: boolean } | null>(null);
  const pinch = useRef<{ d0: number; z0: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const dist = (): { d: number; cx: number; cy: number } => {
    const [a, b] = [...ptrs.current.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  };
  const cDown = (e: RPointerEvent): void => {
    if (e.button === 2) return;
    const el = box.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 1) panRef.current = { sx: e.clientX, sy: e.clientY, sl: el.scrollLeft, st: el.scrollTop, moved: false };
    else if (ptrs.current.size === 2) { pinch.current = { d0: dist().d, z0: zoomRef.current }; panRef.current = null; }
  };
  const cMove = (e: RPointerEvent): void => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const el = box.current;
    if (!el) return;
    if (ptrs.current.size === 2 && pinch.current) { const { d, cx, cy } = dist(); zoomAt(pinch.current.z0 * (d / pinch.current.d0), cx, cy); return; }
    const pr = panRef.current;
    if (!pr) return;
    const dx = e.clientX - pr.sx; const dy = e.clientY - pr.sy;
    if (!pr.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    if (!pr.moved) setPanning(true);
    pr.moved = true;
    el.scrollLeft = pr.sl - dx; el.scrollTop = pr.st - dy;
  };
  const cUp = (e: RPointerEvent): void => {
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size === 0) {
      const pr = panRef.current;
      if (pr && !pr.moved && e.button === 0) { setSel('root'); setEditing(null); }
      panRef.current = null; pinch.current = null; setPanning(false);
    } else if (ptrs.current.size === 1) { pinch.current = null; const [p] = [...ptrs.current.values()]; const el = box.current; if (el) panRef.current = { sx: p.x, sy: p.y, sl: el.scrollLeft, st: el.scrollTop, moved: true }; }
  };

  const links = useMemo(() => nodes.filter((n) => n.parent).map((n) => {
    const p = nodes.find((x) => x.id === n.parent);
    if (!p) return null;
    const a = centerOf(p); const b = centerOf(n);
    return { id: n.id, pts: branchPolygon(a, b, n.thick ?? defaultThick(n.level)).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '), color: n.color };
  }).filter((x): x is NonNullable<typeof x> => x !== null), [nodes]);

  const finish = async (): Promise<void> => {
    setBusy(true);
    try {
      const blob = await drawMindMapPng(nodes, paged ? { x: world.px, y: world.py, w: world.pw, h: world.ph } : undefined);
      onDone(new File([blob], `${title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'so-do-tu-duy'}.png`, { type: 'image/png' }));
    } catch { setMsg('Không tạo được ảnh sơ đồ. Hãy thử lại.'); setBusy(false); }
  };

  const tb = 'btn-ghost !min-h-[44px] !px-3 text-sm';
  const outside = paged && nodes.some((n) => { const r = rect(n); return r.x < world.px || r.y < world.py || r.x + r.w > world.px + world.pw || r.y + r.h > world.py + world.ph; });
  const cropNode = nodes.find((n) => n.id === cropFor);

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-gradient-to-b from-brand-50 to-white" role="dialog" aria-modal="true" aria-label="Thiết kế sơ đồ tư duy">
      <header className="flex flex-wrap items-center gap-2 border-b border-brand-200 bg-white/95 px-3 py-2 shadow-soft">
        <button type="button" onClick={onClose} className="btn-ghost !min-h-[48px]"><X className="h-5 w-5" aria-hidden /> Hủy</button>
        <h2 className="min-w-0 flex-1 truncate text-lg font-extrabold sm:text-xl">{title}</h2>
        <label className="flex items-center gap-1 text-xs font-bold text-ink-2">Khổ trang
          <select aria-label="Khổ trang vẽ" value={pageId} onChange={(e) => changePage(e.target.value as (typeof PAGES)[number]['id'])} className="input !min-h-[44px] !w-auto text-sm">
            {PAGES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </label>
        <button type="button" onClick={undo} aria-label="Hoàn tác" className={tb}><Undo2 className="h-5 w-5" aria-hidden /></button>
        <button type="button" onClick={redo} aria-label="Làm lại" className={tb}><Redo2 className="h-5 w-5" aria-hidden /></button>
        <button type="button" onClick={() => void finish()} disabled={busy} className="btn-primary !min-h-[48px]"><Check className="h-5 w-5" aria-hidden /> {busy ? 'Đang lưu…' : <><span className="sm:hidden">Xong</span><span className="hidden sm:inline">Xong, dùng sơ đồ này</span></>}</button>
      </header>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-brand-100 bg-white/90 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Thêm vào sơ đồ">
          <button type="button" onClick={() => setEditing(addChild())} className="btn-primary !min-h-[44px]"><Plus className="h-5 w-5" aria-hidden /> Thêm nhánh</button>
          <button type="button" onClick={() => addNote('note')} className={tb}><StickyNote className="h-4 w-4" aria-hidden /> Thêm ô văn bản</button>
          <button type="button" onClick={() => addNote('topic')} className={tb}><Heading className="h-4 w-4" aria-hidden /> Tên chủ đề</button>
          <button type="button" onClick={() => setEditing(selected.id)} className={tb}><Pencil className="h-4 w-4" aria-hidden /> Sửa chữ</button>
          <button type="button" aria-pressed={pickMode} onClick={() => setPickMode((v) => !v)} className={`${tb} ${pickMode ? '!border-brand-600 !bg-brand-50' : ''}`}><Check className="h-4 w-4" aria-hidden /> Chọn nhiều</button>
          <button type="button" onClick={() => { const all = nodesRef.current.map((n) => n.id); setSelRaw(all[all.length - 1]); setExtra(all.slice(0, -1)); }} className={tb}>Chọn hết</button>
          <button type="button" aria-expanded={fmtOpen} onClick={() => setFmtOpen((v) => !v)} className={`${tb} md:!hidden ${fmtOpen ? '!border-brand-600 !bg-brand-50' : ''}`}><Bold className="h-4 w-4" aria-hidden /> Định dạng chữ</button>
          <button type="button" onClick={() => fileRef.current?.click()} className={tb}><ImagePlus className="h-4 w-4" aria-hidden /> {selected.img ? 'Đổi hình' : 'Thêm hình'}</button>
          {selected.note && (
            <span className="flex flex-wrap items-center gap-1" role="group" aria-label="Kích thước ô văn bản">
              <button type="button" aria-label="Thu hẹp ô" onClick={() => patch(selected.id, { w: Math.max(90, selected.w - 30) })} className={tb}><Minus className="h-4 w-4" aria-hidden /> Rộng</button>
              <button type="button" aria-label="Mở rộng ô" onClick={() => patch(selected.id, { w: Math.min(1200, selected.w + 30) })} className={tb}><Plus className="h-4 w-4" aria-hidden /> Rộng</button>
              <button type="button" aria-label="Thấp bớt ô" onClick={() => patch(selected.id, { h: Math.max(30, layoutNode(selected).h - 30) })} className={tb}><Minus className="h-4 w-4" aria-hidden /> Cao</button>
              <button type="button" aria-label="Cao thêm ô" onClick={() => patch(selected.id, { h: Math.min(1500, layoutNode(selected).h + 30) })} className={tb}><Plus className="h-4 w-4" aria-hidden /> Cao</button>
            </span>
          )}
          {selected.img && (
            <span className="flex flex-wrap items-center gap-1" role="group" aria-label="Chỉnh hình của nhánh">
              <button type="button" onClick={() => setCropFor(selected.id)} className={tb}><RotateCw className="h-4 w-4" aria-hidden /> Xoay / cắt hình</button>
              <button type="button" aria-label="Thu nhỏ hình" onClick={() => patch(selected.id, { w: Math.max(100, selected.w - 30) })} className={tb}><Minus className="h-4 w-4" aria-hidden /> Hình</button>
              <button type="button" aria-label="Phóng to hình" onClick={() => patch(selected.id, { w: Math.min(600, selected.w + 30) })} className={tb}><Plus className="h-4 w-4" aria-hidden /> Hình</button>
              <button type="button" onClick={() => patchSel({ img: undefined, imgRatio: undefined, imgOrig: undefined })} className={tb}><Trash2 className="h-4 w-4" aria-hidden /> Gỡ hình</button>
            </span>
          )}
          <button type="button" onClick={() => void pasteBtn()} className={tb}><ClipboardPaste className="h-4 w-4" aria-hidden /> Dán hình</button>
          <button type="button" onClick={remove} disabled={onlyRoot} className={`${tb} hover:!border-rose-300 hover:!text-rose-700`}><Trash2 className="h-4 w-4" aria-hidden /> Xóa nhánh</button>
          <span className="ml-auto flex items-center gap-1" role="group" aria-label="Thu phóng">
            <button type="button" aria-label="Thu nhỏ" onClick={() => setZoom((z) => Math.max(0.05, +(z - (z > 0.3 ? 0.1 : 0.05)).toFixed(2)))} className={tb}><Minus className="h-4 w-4" aria-hidden /></button>
            <span className="w-12 text-center text-sm font-bold">{Math.round(zoom * 100)}%</span>
            <button type="button" aria-label="Phóng to" onClick={() => setZoom((z) => Math.min(3, +(z + (z < 0.3 ? 0.05 : 0.1)).toFixed(2)))} className={tb}><Plus className="h-4 w-4" aria-hidden /></button>
            <button type="button" aria-label="Vừa khung" onClick={() => fit()} className={tb}><Maximize2 className="h-4 w-4" aria-hidden /></button>
          </span>
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-label="Chọn ảnh"
            onChange={(e) => { void addImage(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
        </div>

        <div className={`${fmtOpen ? 'flex' : 'hidden'} flex-wrap items-center gap-x-3 gap-y-1.5 md:flex`} role="toolbar" aria-label="Định dạng chữ của nhánh đang chọn">
          <FontPicker value={selected.font} onChange={(f) => patchSel({ font: f })} />
          <span className="flex items-center gap-1" role="group" aria-label="Cỡ chữ">
            <button type="button" aria-label="Chữ nhỏ lại" onClick={() => patchSel({ size: Math.max(11, selected.size - 2) })} className={tb}><Minus className="h-4 w-4" aria-hidden /></button>
            <span className="w-9 text-center text-sm font-bold">{selected.size}</span>
            <button type="button" aria-label="Chữ to lên" onClick={() => patchSel({ size: Math.min(48, selected.size + 2) })} className={tb}><Plus className="h-4 w-4" aria-hidden /></button>
          </span>
          <span className="flex gap-1" role="group" aria-label="Kiểu chữ">
            <button type="button" aria-label="Đậm" aria-pressed={selected.bold} onClick={() => patchSel({ bold: !selected.bold })} className={`${tb} ${selected.bold ? '!border-brand-600 !bg-brand-50' : ''}`}><Bold className="h-4 w-4" aria-hidden /></button>
            <button type="button" aria-label="Nghiêng" aria-pressed={selected.italic} onClick={() => patchSel({ italic: !selected.italic })} className={`${tb} ${selected.italic ? '!border-brand-600 !bg-brand-50' : ''}`}><Italic className="h-4 w-4" aria-hidden /></button>
            <button type="button" aria-label="Gạch chân" aria-pressed={selected.underline} onClick={() => patchSel({ underline: !selected.underline })} className={`${tb} ${selected.underline ? '!border-brand-600 !bg-brand-50' : ''}`}><Underline className="h-4 w-4" aria-hidden /></button>
          </span>
          <span className="flex gap-1" role="group" aria-label="Căn lề">
            {([['left', AlignLeft, 'Căn trái'], ['center', AlignCenter, 'Căn giữa'], ['right', AlignRight, 'Căn phải']] as const).map(([v, Icon, label]) => (
              <button key={v} type="button" aria-label={label} aria-pressed={selected.align === v} onClick={() => patchSel({ align: v })} className={`${tb} ${selected.align === v ? '!border-brand-600 !bg-brand-50' : ''}`}><Icon className="h-4 w-4" aria-hidden /></button>
            ))}
          </span>
          <span className="flex items-center gap-1" role="group" aria-label="Độ dày nhánh nối"><span className="text-xs font-bold text-ink-2">Độ dày nhánh</span>
            <button type="button" aria-label="Nhánh mỏng đi" disabled={noLink} onClick={() => patchSel({ thick: Math.max(2, (selected.thick ?? defaultThick(selected.level)) - 2) })} className={tb}><Minus className="h-4 w-4" aria-hidden /></button>
            <span className="w-8 text-center text-sm font-bold">{noLink ? '–' : selected.thick ?? defaultThick(selected.level)}</span>
            <button type="button" aria-label="Nhánh dày lên" disabled={noLink} onClick={() => patchSel({ thick: Math.min(48, (selected.thick ?? defaultThick(selected.level)) + 2) })} className={tb}><Plus className="h-4 w-4" aria-hidden /></button>
          </span>
          <span className="relative flex flex-wrap items-center gap-1.5" role="group" aria-label="Tô màu">
            <span className="text-xs font-bold text-ink-2">Tô màu</span>
            {([['link', 'Nhánh nối', selected.color], ['fill', 'Nền ô', selected.fill], ['text', 'Chữ', selected.textColor]] as const).map(([k, label, col]) => (
              <button key={k} type="button" aria-expanded={colorTarget === k} onClick={() => setColorTarget(colorTarget === k ? null : k)}
                className={`${tb} !gap-2 ${colorTarget === k ? '!border-brand-600 !bg-brand-50' : ''}`}>
                <span className="h-5 w-5 rounded-full border-2 border-black/15" style={{ background: col }} aria-hidden /> {label}
              </button>
            ))}
            {colorTarget && (
              <ColorPanel title={colorTarget === 'link' ? 'nhánh nối' : colorTarget === 'fill' ? 'nền của ô' : 'chữ'} value={colorTarget === 'link' ? selected.color : colorTarget === 'fill' ? selected.fill : selected.textColor}
                allowNone={colorTarget === 'fill'} recent={recent} onPick={applyColor} onClose={() => setColorTarget(null)} onPickFromMap={() => { setEyedrop(true); setColorTarget(null); setMsg('Bấm vào một nhánh để lấy màu của nó.'); }} />
            )}
            {colorTarget === 'link' && !noLink && (
              <label className="flex items-center gap-1 text-xs font-bold text-ink-2"><input type="checkbox" checked={withKids} onChange={(e) => setWithKids(e.target.checked)} className="h-4 w-4" /> Cả nhánh con</label>
            )}
          </span>
        </div>
        {paged && outside && <p role="status" className="w-full rounded-xl bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-900">Có nhánh nằm ngoài trang {pg.label.split(' (')[0]}: phần ngoài khung xanh sẽ bị cắt khi xuất ảnh.</p>}
        {many && <p className="w-full text-sm font-bold text-brand-700" role="status">Đang chọn {selIds.length} nhánh: mọi định dạng sẽ áp cho tất cả các nhánh này.</p>}
        {msg && <p role="alert" className="w-full rounded-xl bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-900">{msg}</p>}
      </div>

      <div ref={box} className={`min-h-0 flex-1 overflow-auto ${paged ? "bg-slate-300" : "bg-[radial-gradient(circle_at_1px_1px,rgba(22,104,242,.14)_1px,transparent_0)] [background-size:24px_24px]"}`} onPointerDown={cDown} onPointerMove={cMove} onPointerUp={cUp} onPointerCancel={cUp} style={{ touchAction: 'none', cursor: panning ? 'grabbing' : 'grab' }}>
        <div style={{ width: world.w * zoom, height: world.h * zoom }}>
          <div style={{ width: world.w, height: world.h, transform: `scale(${zoom})`, transformOrigin: '0 0', position: 'relative' }}>
            {paged && <div aria-label={`Trang ${pg.label}`} className="pointer-events-none absolute bg-white" style={{ left: world.px, top: world.py, width: world.pw, height: world.ph, boxShadow: '0 0 0 2px #1668f2, 0 20px 60px -10px rgba(10,23,48,.35)' }} />}
            <svg width={world.w} height={world.h} className="pointer-events-none absolute inset-0" aria-hidden>
              {links.map((l) => <polygon key={l.id} points={l.pts} fill={l.color} stroke={l.color} strokeWidth={1} strokeLinejoin="round" />)}
            </svg>
            {nodes.map((n) => {
              const lay = layoutNode(n);
              const on = selIds.includes(n.id);
              return (
                <div key={n.id} role="button" tabIndex={0} aria-label={`Nhánh: ${n.text || 'hình ảnh'}`}
                  onPointerDown={(e) => down(e, n)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
                  onDoubleClick={() => { setSel(n.id); setEditing(n.id); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) setEditing(n.id); }}
                  style={{ position: 'absolute', left: n.x, top: n.y, width: n.w, height: lay.h, background: n.fill, border: `3px solid ${n.color}`, borderRadius: radiusOf(n), touchAction: 'none', cursor: 'grab', display: 'flex', flexDirection: 'column', justifyContent: n.note ? 'flex-start' : 'center', boxShadow: on ? '0 0 0 4px rgba(22,104,242,.35), 0 10px 24px -8px rgba(10,23,48,.35)' : n.fill === 'transparent' ? 'none' : '0 6px 14px -8px rgba(10,23,48,.35)', userSelect: 'none' }}>
                  {editing === n.id ? (
                    <>
                    {n.img && <img src={n.img} alt="" draggable={false} style={{ position: 'absolute', left: PAD, top: PAD, width: n.w - PAD * 2, height: lay.imgH, objectFit: 'cover', borderRadius: 10, pointerEvents: 'none' }} />}
                    <textarea autoFocus defaultValue={n.text} onFocus={(e) => e.currentTarget.select()} onPointerDown={(e) => e.stopPropagation()}
                      onBlur={(e) => { patch(n.id, { text: e.currentTarget.value.slice(0, 160) }); setEditing(null); }}
                      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); patch(n.id, { text: e.currentTarget.value.slice(0, 160) }); setEditing(null); } }}
                      aria-label="Gõ chữ cho nhánh"
                      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: n.img ? PAD + lay.imgH + 6 : 0, width: '100%', resize: 'none', border: 'none', outline: '3px solid #f59e0b', borderRadius: 15, background: '#fffbeb', color: '#0a1730', padding: PAD, fontFamily: cssFamily(n.font), fontSize: n.size, fontWeight: n.bold ? 700 : 500, fontStyle: n.italic ? 'italic' : 'normal', textAlign: n.align, lineHeight: `${lay.lineH}px` }} />
                    </>
                  ) : <NodeBody n={n} />}
                  {on && !many && editing !== n.id && (
                    <>
                      {([
                        ['nw', 'góc trên trái', { left: -7, top: -7, cursor: 'nwse-resize' }], ['n', 'cạnh trên', { left: '50%', top: -7, marginLeft: -6, cursor: 'ns-resize' }], ['ne', 'góc trên phải', { right: -7, top: -7, cursor: 'nesw-resize' }],
                        ['w', 'cạnh trái', { left: -7, top: '50%', marginTop: -6, cursor: 'ew-resize' }], ['e', 'cạnh phải', { right: -7, top: '50%', marginTop: -6, cursor: 'ew-resize' }],
                        ['sw', 'góc dưới trái', { left: -7, bottom: -7, cursor: 'nesw-resize' }], ['s', 'cạnh dưới', { left: '50%', bottom: -7, marginLeft: -6, cursor: 'ns-resize' }], ['se', 'góc dưới phải', { right: -7, bottom: -7, cursor: 'nwse-resize' }],
                      ] as const).map(([k, label, st]) => (
                        <span key={k} role="slider" aria-label={`Kéo để đổi cỡ (${label})`} title={`Kéo ${label} để đổi cỡ`} onPointerDown={(e) => rzDown(e, n, k)} onPointerMove={rzMove} onPointerUp={rzUp} onPointerCancel={rzUp}
                          style={{ position: 'absolute', zIndex: 6, width: 13, height: 13, background: '#fff', border: '2.5px solid #1668f2', borderRadius: 4, touchAction: 'none', boxShadow: '0 1px 4px rgba(10,23,48,.35)', ...st }} />
                      ))}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {cropNode?.img && <ImageEditor src={cropNode.img} original={cropNode.imgOrig} onClose={() => setCropFor(null)} onApply={(src, ratio) => { patch(cropNode.id, { img: src, imgRatio: ratio }); setCropFor(null); }} />}
      <footer className="border-t border-brand-100 bg-white/95 px-3 py-1.5 text-center text-xs text-ink-2">
        Cuộn chuột để phóng to / thu nhỏ · kéo chỗ trống để di chuyển · Shift + cuộn để đi ngang · Ô văn bản kéo tự do · kéo ô vuông trắng quanh nhánh đang chọn để đổi rộng / cao (giữ Shift ở góc để phóng cả chữ) · bấm để chọn · giữ Shift hoặc Ctrl rồi bấm để chọn nhiều nhánh · kéo để di chuyển (các nhánh con đi theo) · bấm đúp hoặc “Sửa chữ” để gõ · Ctrl+V để dán hình vào nhánh đang chọn · hình và chữ mô tả nằm chung một nhánh
      </footer>
    </div>,
    document.body,
  );
}
