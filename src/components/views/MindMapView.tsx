import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { PROGRESS_LABEL } from '../../lib/format';
import { EmptyLayout, withCards } from './viewTypes';
import type { CardRow, LayoutViewProps } from './viewTypes';

const ROW_H = 78;
const NODE_H = 64;
const X_ROOT = 0;
const W_ROOT = 190;
const X_GROUP = 270;
const W_GROUP = 210;
const X_CARD = 560;
const W_CARD = 270;
const TOTAL_W = X_CARD + W_CARD + 16;

const DOT: Record<string, string> = {
  pending: 'bg-amber-400', approved: 'bg-emerald-500', featured: 'bg-yellow-400', needs_edit: 'bg-rose-500',
};

interface Group { id: string; label: string; cards: CardRow[] }

/** Đường cong nối hai nút (bezier ngang). */
const curve = (x1: number, y1: number, x2: number, y2: number): string => {
  const mid = (x1 + x2) / 2;
  return `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`;
};

/** Sơ đồ động não: tên bảng ở giữa, nhánh theo nhiệm vụ, lá là từng bài. Bấm nhánh để thu gọn / mở rộng. */
export function MindMapView({ rows, board, onOpen }: LayoutViewProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const items = useMemo(() => withCards(rows), [rows]);

  const layout = useMemo(() => {
    const groups: Group[] = board.tasks.map((t) => ({ id: t.id, label: t.label, cards: items.filter((r) => r.card.taskId === t.id) }));
    const known = new Set(board.tasks.map((t) => t.id));
    const other = items.filter((r) => !known.has(r.card.taskId));
    if (other.length > 0) groups.push({ id: '__other', label: 'Khác', cards: other });

    let cursor = 0;
    const laid = groups.map((g) => {
      const open = !collapsed.has(g.id);
      const leafCount = open ? Math.max(1, g.cards.length) : 1;
      const top = cursor;
      cursor += leafCount * ROW_H;
      const leaves = open ? g.cards.map((r, i) => ({ r, y: top + i * ROW_H + ROW_H / 2 })) : [];
      return { g, open, y: top + (leafCount * ROW_H) / 2, leaves };
    });
    const height = Math.max(ROW_H, cursor);
    const rootY = laid.length ? laid.reduce((n, l) => n + l.y, 0) / laid.length : height / 2;
    return { laid, height, rootY };
  }, [board.tasks, items, collapsed]);

  if (items.length === 0) return <EmptyLayout />;

  const toggle = (id: string): void => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="overflow-auto rounded-3xl border-[1.5px] border-brand-200 bg-white/70 p-4" role="tree" aria-label="Sơ đồ động não">
      <div className="relative" style={{ width: TOTAL_W, height: layout.height }}>
        <svg className="pointer-events-none absolute inset-0" width={TOTAL_W} height={layout.height} aria-hidden>
          {layout.laid.map(({ g, y, leaves }) => (
            <g key={g.id} fill="none" strokeLinecap="round">
              <path d={curve(X_ROOT + W_ROOT, layout.rootY, X_GROUP, y)} stroke="#5c9bf8" strokeWidth="3" />
              {leaves.map(({ r, y: ly }) => <path key={r.card.id} d={curve(X_GROUP + W_GROUP, y, X_CARD, ly)} stroke="#a8c7f8" strokeWidth="2" />)}
            </g>
          ))}
        </svg>

        <div className="absolute flex items-center justify-center rounded-3xl bg-gradient-to-b from-brand-500 to-brand-600 px-4 text-center text-sm font-extrabold text-white shadow-glow"
          style={{ left: X_ROOT, top: layout.rootY - NODE_H / 2, width: W_ROOT, height: NODE_H }} role="treeitem" aria-level={1}>
          <span className="line-clamp-3">{board.title}</span>
        </div>

        {layout.laid.map(({ g, open, y, leaves }) => (
          <div key={g.id}>
            <button type="button" onClick={() => toggle(g.id)} aria-expanded={open} role="treeitem" aria-level={2}
              className="absolute flex items-center justify-between gap-2 rounded-2xl bg-teal2-600 px-3 text-left text-sm font-extrabold text-white shadow-soft transition duration-150 hover:bg-teal2-700"
              style={{ left: X_GROUP, top: y - NODE_H / 2, width: W_GROUP, height: NODE_H }}>
              <span className="line-clamp-2 min-w-0">{g.label}</span>
              <span className="flex shrink-0 items-center gap-1 text-xs"><span className="rounded-full bg-white/25 px-2 py-0.5">{g.cards.length}</span>{open ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}</span>
            </button>
            {open && g.cards.length === 0 && (
              <p className="absolute flex items-center rounded-2xl border border-dashed border-brand-200 px-3 text-xs text-ink-3" style={{ left: X_CARD, top: y - 18, width: W_CARD, height: 36 }}>Chưa có bài</p>
            )}
            {leaves.map(({ r, y: ly }) => (
              <button key={r.card.id} type="button" onClick={() => onOpen(r.card.id)} role="treeitem" aria-level={3}
                className="absolute flex items-center gap-2 rounded-2xl border-[1.5px] border-brand-200 bg-white px-3 text-left shadow-soft transition duration-150 hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-lift"
                style={{ left: X_CARD, top: ly - NODE_H / 2 + 4, width: W_CARD, height: NODE_H - 8 }}>
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[r.card.status] ?? 'bg-slate-300'}`} title={PROGRESS_LABEL[r.card.status]} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-extrabold">{r.card.title}</span>
                  <span className="block truncate text-xs text-ink-2">{r.card.authorName}{r.card.unit ? ` · ${r.card.unit}` : ''}</span>
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
