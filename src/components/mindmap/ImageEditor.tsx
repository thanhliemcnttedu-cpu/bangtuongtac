import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, RotateCcw, RotateCw, Undo2, X } from 'lucide-react';

interface Props {
  src: string;
  /** Ảnh gốc (trước khi cắt / xoay) để khôi phục. */
  original?: string;
  onApply: (src: string, ratio: number) => void;
  onClose: () => void;
}

interface Crop { x: number; y: number; w: number; h: number }
const FULL: Crop = { x: 0, y: 0, w: 1, h: 1 };
const MIN = 0.06;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

/** Vẽ ảnh đã xoay `deg` độ lên canvas vừa khít (nền trắng), thu nhỏ nếu quá lớn. */
function drawRotated(img: HTMLImageElement, deg: number, c: HTMLCanvasElement): void {
  const rad = (deg * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad)); const cos = Math.abs(Math.cos(rad));
  const w = img.width * cos + img.height * sin; const h = img.width * sin + img.height * cos;
  const k = Math.min(1, 1100 / Math.max(w, h));
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  const g = c.getContext('2d');
  if (!g) return;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.translate(c.width / 2, c.height / 2); g.rotate(rad); g.scale(k, k);
  g.drawImage(img, -img.width / 2, -img.height / 2);
}

/**
 * Chỉnh ảnh của một nhánh: xoay (nút 90° hoặc thanh kéo) và cắt (kéo khung cắt hoặc kéo bốn góc).
 * Kết quả là ảnh mới thay cho ảnh trong nhánh; có thể quay lại ảnh gốc.
 */
export function ImageEditor({ src, original, onApply, onClose }: Props) {
  const [source, setSource] = useState(src);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [rot, setRot] = useState(0);
  const [crop, setCrop] = useState<Crop>(FULL);
  const cv = useRef<HTMLCanvasElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: string; sx: number; sy: number; c: Crop } | null>(null);

  useEffect(() => { let on = true; loadImage(source).then((i) => { if (on) setImg(i); }).catch(() => undefined); return () => { on = false; }; }, [source]);
  useEffect(() => { if (img && cv.current) drawRotated(img, rot, cv.current); }, [img, rot]);

  const turn = (d: number): void => { setRot((r) => { let n = r + d; if (n > 180) n -= 360; if (n < -180) n += 360; return n; }); setCrop(FULL); };

  const down = (e: RPointerEvent): void => {
    const kind = (e.target as HTMLElement).dataset.h;
    if (!kind) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind, sx: e.clientX, sy: e.clientY, c: crop };
  };
  const move = (e: RPointerEvent): void => {
    const d = drag.current; const box = area.current?.getBoundingClientRect();
    if (!d || !box) return;
    const dx = (e.clientX - d.sx) / box.width; const dy = (e.clientY - d.sy) / box.height;
    let { x, y, w, h } = d.c;
    if (d.kind === 'move') { x = clamp(x + dx, 0, 1 - w); y = clamp(y + dy, 0, 1 - h); }
    else {
      if (d.kind.includes('w')) { const nx = clamp(x + dx, 0, x + w - MIN); w += x - nx; x = nx; }
      if (d.kind.includes('e')) w = clamp(w + dx, MIN, 1 - x);
      if (d.kind.includes('n')) { const ny = clamp(y + dy, 0, y + h - MIN); h += y - ny; y = ny; }
      if (d.kind.includes('s')) h = clamp(h + dy, MIN, 1 - y);
    }
    setCrop({ x, y, w, h });
  };
  const up = (): void => { drag.current = null; };

  const apply = (): void => {
    const c = cv.current;
    if (!c) return;
    const sw = Math.max(1, Math.round(crop.w * c.width)); const sh = Math.max(1, Math.round(crop.h * c.height));
    const k = Math.min(1, 640 / Math.max(sw, sh));
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(sw * k)); out.height = Math.max(1, Math.round(sh * k));
    const g = out.getContext('2d');
    if (!g) return;
    g.drawImage(c, Math.round(crop.x * c.width), Math.round(crop.y * c.height), sw, sh, 0, 0, out.width, out.height);
    onApply(out.toDataURL('image/jpeg', 0.9), out.height / out.width);
  };

  const reset = useCallback(() => { setRot(0); setCrop(FULL); }, []);

  const handle = (h: string, style: React.CSSProperties) => <span key={h} data-h={h} style={{ position: 'absolute', width: 26, height: 26, background: '#fff', border: '3px solid #1668f2', borderRadius: 8, touchAction: 'none', ...style }} />;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-ink/60 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label="Xoay và cắt hình">
      <div className="mx-auto flex max-h-full w-full max-w-3xl flex-col gap-3 overflow-y-auto rounded-3xl bg-white p-4 shadow-lift sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold sm:text-xl">Xoay và cắt hình</h2>
          <button type="button" onClick={onClose} aria-label="Đóng" className="btn-ghost btn-sm !px-2.5"><X className="h-4 w-4" aria-hidden /></button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => turn(-90)} className="btn-ghost !min-h-[46px]"><RotateCcw className="h-4 w-4" aria-hidden /> Xoay trái</button>
          <button type="button" onClick={() => turn(90)} className="btn-ghost !min-h-[46px]"><RotateCw className="h-4 w-4" aria-hidden /> Xoay phải</button>
          <label className="flex min-w-[180px] flex-1 items-center gap-2 text-xs font-bold text-ink-2">Xoay nhẹ
            <input type="range" min={-180} max={180} value={rot} aria-label="Xoay nhẹ" onChange={(e) => { setRot(Number(e.target.value)); setCrop(FULL); }} className="h-4 w-full cursor-pointer" />
            <span className="w-12 text-right">{rot}°</span>
          </label>
          <button type="button" onClick={() => setCrop(FULL)} className="btn-ghost !min-h-[46px]">Bỏ khung cắt</button>
          {original && original !== source && <button type="button" onClick={() => { setSource(original); reset(); }} className="btn-ghost !min-h-[46px]"><Undo2 className="h-4 w-4" aria-hidden /> Ảnh gốc</button>}
        </div>

        <div className="flex justify-center overflow-auto rounded-2xl bg-brand-50 p-3">
          <div ref={area} className="relative inline-block select-none" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} style={{ touchAction: 'none' }}>
            <canvas ref={cv} aria-label="Hình đang chỉnh" style={{ display: 'block', maxWidth: 'min(80vw,620px)', maxHeight: '50vh', width: 'auto', height: 'auto' }} />
            {/* Phủ tối phần bị cắt bỏ, giữ sáng phần còn lại */}
            <div className="pointer-events-none absolute inset-0" style={{ background: 'rgba(10,23,48,.45)', clipPath: `polygon(0 0,100% 0,100% 100%,0 100%,0 0,${crop.x * 100}% ${crop.y * 100}%,${crop.x * 100}% ${(crop.y + crop.h) * 100}%,${(crop.x + crop.w) * 100}% ${(crop.y + crop.h) * 100}%,${(crop.x + crop.w) * 100}% ${crop.y * 100}%,${crop.x * 100}% ${crop.y * 100}%)` }} />
            <div data-h="move" style={{ position: 'absolute', left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%`, border: '3px dashed #fff', boxShadow: '0 0 0 2px #1668f2', cursor: 'move', touchAction: 'none' }}>
              {handle('nw', { left: -13, top: -13, cursor: 'nwse-resize' })}
              {handle('ne', { right: -13, top: -13, cursor: 'nesw-resize' })}
              {handle('sw', { left: -13, bottom: -13, cursor: 'nesw-resize' })}
              {handle('se', { right: -13, bottom: -13, cursor: 'nwse-resize' })}
              {handle('n', { left: '50%', top: -13, marginLeft: -13, cursor: 'ns-resize' })}
              {handle('s', { left: '50%', bottom: -13, marginLeft: -13, cursor: 'ns-resize' })}
              {handle('w', { left: -13, top: '50%', marginTop: -13, cursor: 'ew-resize' })}
              {handle('e', { right: -13, top: '50%', marginTop: -13, cursor: 'ew-resize' })}
            </div>
          </div>
        </div>
        <p className="text-xs text-ink-2">Kéo khung trắng để chọn phần giữ lại, kéo các ô vuông ở góc và cạnh để đổi cỡ khung. Bấm “Xong” để dùng.</p>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost !min-h-[48px]">Hủy</button>
          <button type="button" onClick={apply} className="btn-primary !min-h-[48px]"><Check className="h-4 w-4" aria-hidden /> Xong</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
