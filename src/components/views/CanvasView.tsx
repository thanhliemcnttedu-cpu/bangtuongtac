import { useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { GripVertical, Wand2 } from 'lucide-react';
import { Tile } from '../GridAndColumnsView';
import { EmptyLayout, withCards } from './viewTypes';
import type { LayoutViewProps } from './viewTypes';

const CARD_W = 264;
const SLOT_H = 330;
const GAP = 24;
const COLS = 4;
const MARGIN = 24;

/** Bảng trắng: thẻ đặt tự do trên mặt phẳng. Giáo viên kéo thanh tay cầm để đổi chỗ; vị trí được lưu lại. */
export function CanvasView({ rows, board, canManage, onLayout, ...actions }: LayoutViewProps) {
  const items = useMemo(() => withCards(rows), [rows]);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const startRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  // Bản sao đồng bộ của trạng thái kéo: sự kiện chuột đến nhanh hơn vòng vẽ lại của React.
  const dragRef = useRef<{ id: string; x: number; y: number } | null>(null);

  const auto = (i: number): { x: number; y: number } => ({
    x: MARGIN + (i % COLS) * (CARD_W + GAP),
    y: MARGIN + Math.floor(i / COLS) * SLOT_H,
  });
  const posOf = (i: number): { x: number; y: number } => {
    const c = items[i].card;
    if (drag && drag.id === c.id) return { x: drag.x, y: drag.y };
    return c.pos ?? auto(i);
  };

  if (items.length === 0) return <EmptyLayout />;

  const all = items.map((_, i) => posOf(i));
  const width = Math.max(...all.map((p) => p.x)) + CARD_W + MARGIN * 2;
  const height = Math.max(...all.map((p) => p.y)) + SLOT_H;

  const down = (e: ReactPointerEvent<HTMLButtonElement>, i: number): void => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = posOf(i);
    startRef.current = { px: e.clientX, py: e.clientY, ox: p.x, oy: p.y };
    dragRef.current = { id: items[i].card.id, ...p };
    setDrag(dragRef.current);
  };
  const move = (e: ReactPointerEvent<HTMLButtonElement>): void => {
    const s = startRef.current;
    const d = dragRef.current;
    if (!s || !d) return;
    dragRef.current = { id: d.id, x: Math.max(0, Math.round(s.ox + e.clientX - s.px)), y: Math.max(0, Math.round(s.oy + e.clientY - s.py)) };
    setDrag(dragRef.current);
  };
  const up = (): void => {
    const d = dragRef.current;
    if (d) onLayout(d.id, { pos: { x: d.x, y: d.y } });
    startRef.current = null;
    dragRef.current = null;
    setDrag(null);
  };

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-2">
          <span>Kéo thanh <GripVertical className="inline h-4 w-4" aria-hidden /> ở đầu mỗi thẻ để đặt vị trí tự do.</span>
          <button type="button" onClick={() => items.forEach((r) => { if (r.card.pos) onLayout(r.card.id, { pos: null }); })} className="btn-ghost btn-sm">
            <Wand2 className="h-3.5 w-3.5" aria-hidden /> Xếp lại tự động
          </button>
        </div>
      )}
      <div className="max-h-[78vh] overflow-auto rounded-3xl border-[1.5px] border-brand-200 bg-white/70"
        style={{ backgroundImage: 'radial-gradient(#cfe0fb 1.2px, transparent 1.2px)', backgroundSize: '24px 24px' }}>
        <div className="relative" style={{ width, height }} role="list" aria-label="Bảng trắng">
          {items.map((r, i) => {
            const p = all[i];
            const dragging = drag?.id === r.card.id;
            return (
              <div key={r.card.id} role="listitem" className={`absolute ${dragging ? 'z-10 cursor-grabbing' : ''}`} style={{ left: p.x, top: p.y, width: CARD_W, transition: dragging ? 'none' : 'left .2s, top .2s' }}>
                {canManage && (
                  <button type="button" aria-label={`Kéo thẻ ${r.card.title}`} onPointerDown={(e) => down(e, i)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
                    className="flex h-6 w-full cursor-grab touch-none items-center justify-center rounded-t-2xl bg-brand-600 text-white">
                    <GripVertical className="h-4 w-4 rotate-90" aria-hidden />
                  </button>
                )}
                <div className={dragging ? 'shadow-lift' : ''}>
                  <Tile row={r} board={board} compact canManage={canManage} {...actions} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
