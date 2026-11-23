import { useMemo } from 'react';
import { Tile } from '../GridAndColumnsView';
import { EmptyLayout, withCards } from './viewTypes';
import type { LayoutViewProps } from './viewTypes';

const DAY_FORMAT = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

/** Dòng thời gian: các bài xếp theo ngày nộp, thứ tự theo cài đặt sắp xếp của bảng (cũ nhất trước nếu chọn "Cũ nhất lên đầu"). */
export function TimelineView({ rows, board, onLayout: _onLayout, ...actions }: LayoutViewProps) {
  const groups = useMemo(() => {
    const asc = board.settings.sortBy === 'oldest';
    const sorted = [...withCards(rows)].sort((a, b) => (asc ? 1 : -1) * (new Date(a.card.submittedAt).getTime() - new Date(b.card.submittedAt).getTime()));
    const map = new Map<string, typeof sorted>();
    for (const r of sorted) {
      const key = new Date(r.card.submittedAt).toDateString();
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()].map(([key, list]) => ({ key, label: DAY_FORMAT.format(new Date(key)), list }));
  }, [rows, board.settings.sortBy]);

  if (groups.length === 0) return <EmptyLayout />;

  return (
    <ol className="relative space-y-8 border-l-4 border-brand-200 pl-5 sm:pl-8" aria-label="Dòng thời gian">
      {groups.map((g) => (
        <li key={g.key} className="relative">
          <span className="absolute -left-[34px] top-1 h-5 w-5 rounded-full border-4 border-white bg-brand-600 shadow-glow sm:-left-[46px]" aria-hidden />
          <h3 className="mb-3 inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-sm font-extrabold capitalize text-brand-800 shadow-soft ring-1 ring-brand-200">
            {g.label}
            <span className="chip bg-brand-100 text-brand-800 ring-brand-200">{g.list.length} bài</span>
          </h3>
          <div className="grid grid-cols-1 gap-4 min-[560px]:grid-cols-2 min-[1024px]:grid-cols-3">
            {g.list.map((r) => <Tile key={r.card.id} row={r} board={board} compact {...actions} />)}
          </div>
        </li>
      ))}
    </ol>
  );
}
