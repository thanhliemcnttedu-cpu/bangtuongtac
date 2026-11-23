import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Check, Eraser, Trash2, Undo2 } from 'lucide-react';

interface Props {
  onDone: (file: File) => void;
  onClose: () => void;
}

const COLORS = ['#0a1730', '#1668f2', '#129a4b', '#f59e0b', '#e11d48', '#7c3aed'];
const SIZES = [3, 7, 14];
const W = 960;
const H = 600;
const MAX_UNDO = 20;

/** Bảng vẽ tay: chuột, bút cảm ứng hoặc ngón tay. Xuất ra ảnh PNG nền trắng. */
export function DrawingPad({ onDone, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const undoRef = useRef<ImageData[]>([]);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [erase, setErase] = useState(false);
  const [dirty, setDirty] = useState(false);

  const ctx = (): CanvasRenderingContext2D | null => canvasRef.current?.getContext('2d') ?? null;

  useEffect(() => {
    const c = ctx();
    if (!c) return;
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, W, H);
    c.lineCap = 'round';
    c.lineJoin = 'round';
  }, []);

  const point = (e: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const down = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    const c = ctx();
    if (!c) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    undoRef.current.push(c.getImageData(0, 0, W, H));
    if (undoRef.current.length > MAX_UNDO) undoRef.current.shift();
    drawingRef.current = true;
    const p = point(e);
    lastRef.current = p;
    c.strokeStyle = erase ? '#ffffff' : color;
    c.fillStyle = erase ? '#ffffff' : color;
    c.lineWidth = erase ? size * 2.5 : size;
    c.beginPath();
    c.arc(p.x, p.y, c.lineWidth / 2, 0, Math.PI * 2); // chạm một điểm cũng để lại chấm
    c.fill();
    setDirty(true);
  };

  const move = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!drawingRef.current) return;
    const c = ctx();
    const last = lastRef.current;
    if (!c || !last) return;
    const p = point(e);
    c.beginPath();
    c.moveTo(last.x, last.y);
    c.lineTo(p.x, p.y);
    c.stroke();
    lastRef.current = p;
  };

  const up = (): void => { drawingRef.current = false; lastRef.current = null; };

  const undo = (): void => {
    const prev = undoRef.current.pop();
    const c = ctx();
    if (prev && c) c.putImageData(prev, 0, 0);
    if (undoRef.current.length === 0) setDirty(false);
  };

  const clear = (): void => {
    const c = ctx();
    if (!c) return;
    undoRef.current.push(c.getImageData(0, 0, W, H));
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, W, H);
  };

  const finish = (): void => {
    canvasRef.current?.toBlob((blob) => {
      if (blob) onDone(new File([blob], `hinh-ve-${Date.now()}.png`, { type: 'image/png' }));
    }, 'image/png');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Màu bút" className="flex gap-1.5">
          {COLORS.map((c) => (
            <button key={c} type="button" aria-label={`Màu ${c}`} aria-pressed={!erase && color === c} onClick={() => { setColor(c); setErase(false); }}
              className={`h-8 w-8 rounded-full border-2 transition duration-150 ${!erase && color === c ? 'scale-110 border-ink' : 'border-white shadow'}`} style={{ background: c }} />
          ))}
        </div>
        <div role="group" aria-label="Cỡ nét" className="flex gap-1">
          {SIZES.map((s) => (
            <button key={s} type="button" aria-label={`Nét ${s}`} aria-pressed={size === s} onClick={() => setSize(s)}
              className={`flex h-9 w-9 items-center justify-center rounded-xl border-2 ${size === s ? 'border-brand-600 bg-brand-50' : 'border-brand-100 bg-white'}`}>
              <span className="rounded-full bg-ink" style={{ width: s + 3, height: s + 3 }} />
            </button>
          ))}
        </div>
        <button type="button" aria-pressed={erase} onClick={() => setErase((v) => !v)} className={`btn-ghost btn-sm ${erase ? '!border-brand-600 !bg-brand-50' : ''}`}><Eraser className="h-4 w-4" aria-hidden /> Tẩy</button>
        <button type="button" onClick={undo} className="btn-ghost btn-sm"><Undo2 className="h-4 w-4" aria-hidden /> Hoàn tác</button>
        <button type="button" onClick={clear} className="btn-ghost btn-sm"><Trash2 className="h-4 w-4" aria-hidden /> Xóa hết</button>
      </div>

      <canvas ref={canvasRef} width={W} height={H} aria-label="Khung vẽ"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
        className="w-full cursor-crosshair touch-none rounded-2xl border-2 border-brand-200 bg-white" />

      <div className="flex justify-between gap-2">
        <button type="button" onClick={onClose} className="btn-ghost">Đóng</button>
        <button type="button" onClick={finish} disabled={!dirty} className="btn-primary"><Check className="h-4 w-4" aria-hidden /> Dùng hình vẽ này</button>
      </div>
    </div>
  );
}
