import { useMemo, useState } from 'react';
import { taskTitle } from '../lib/lessons';
import { Rows3, Search, Trash2, X } from 'lucide-react';
import type { BoardData, FilterState, ProgressFilter, TimeFilter, ViewMode } from '../types/board';
import { normalize } from '../lib/boardLogic';
import { LayoutMenu } from './LayoutMenu';

interface Props {
  board: BoardData;
  filters: FilterState;
  view: ViewMode;
  resultCount: number;
  onChange: (patch: Partial<FilterState>) => void;
  onViewChange: (v: ViewMode) => void;
  onClear: () => void;
  isFiltered: boolean;
  /** Người xem không phải giáo viên chỉ có Lưới thẻ + Chia cột. */
  allowedViews: ViewMode[];
  /** Giáo viên: xóa mọi bài đang hiển thị theo bộ lọc (số bài, hàm mở hộp xác nhận). */
  deletableCount?: number;
  onDeleteShown?: () => void;
}


const PROGRESS_OPTIONS: { value: ProgressFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả tiến trình' },
  { value: 'submitted', label: 'Đã nộp' },
  { value: 'in_progress', label: 'Đang thực hiện' },
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'not_submitted', label: 'Chưa nộp' },
  { value: 'needs_edit', label: 'Cần sửa' },
  { value: 'done', label: 'Đã hoàn thành (duyệt + tiêu biểu)' },
  { value: 'featured', label: 'Tiêu biểu' },
];

const TIME_OPTIONS: { value: TimeFilter; label: string }[] = [
  { value: 'all', label: 'Mọi thời gian' },
  { value: 'today', label: 'Hôm nay' },
  { value: '24h', label: '24 giờ qua' },
  { value: '7d', label: '7 ngày qua' },
  { value: 'session', label: 'Theo buổi…' },
];

export function MultiFilterBar({
  board, filters, view, resultCount, onChange, onViewChange, onClear, isFiltered, allowedViews, deletableCount, onDeleteShown }: Props) {
  const [focused, setFocused] = useState(false);

  const titles = useMemo(() => [...new Set(board.cards.map((c) => c.title))], [board.cards]);

  // Gợi ý nhanh: tên người nộp và tổ/đội/đơn vị khớp với chữ đang gõ.
  const suggestions = useMemo(() => {
    const q = normalize(filters.search);
    const units = [...new Set(board.roster.map((m) => m.unit).filter(Boolean))].map((u) => ({ kind: 'unit' as const, text: u }));
    const names = board.roster.map((m) => ({ kind: 'name' as const, text: m.name }));
    const pool = q ? [...units, ...names].filter((s) => normalize(s.text).includes(q)) : units;
    return pool.filter((s) => normalize(s.text) !== q).slice(0, 6);
  }, [filters.search, board.roster]);

  return (
    <section aria-label="Tìm kiếm và bộ lọc" className="rounded-3xl border border-brand-200/80 bg-white/90 p-3 shadow-soft sm:p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <input
              type="search"
              value={filters.search}
              onChange={(e) => onChange({ search: e.target.value })}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 120)}
              placeholder={board.mode === 'classroom' ? 'Tìm tên học sinh hoặc tổ…' : 'Tìm tên giáo viên hoặc trường…'}
              aria-label="Tìm theo tên người nộp"
              className="input pl-9"
            />
            {focused && suggestions.length > 0 && (
              <ul className="pop-in absolute z-20 mt-1 w-full overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-lift">
                {suggestions.map((s) => (
                  <li key={s.kind + s.text}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onChange({ search: s.text })}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-brand-50"
                    >
                      <span>{s.text}</span>
                      <span className="text-xs font-bold text-brand-700">{s.kind === 'unit' ? (board.mode === 'classroom' ? 'Tổ/Lớp' : 'Đơn vị') : 'Tên'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <LayoutMenu view={view} allowed={allowedViews} onChange={onViewChange} />
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <select aria-label="Lọc theo tên bài" value={filters.title} onChange={(e) => onChange({ title: e.target.value })} className="input">
            <option value="">Tất cả tên bài</option>
            {titles.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select aria-label="Lọc theo nhiệm vụ" value={filters.taskId} onChange={(e) => onChange({ taskId: e.target.value })} className="input">
            <option value="">Tất cả nhiệm vụ</option>
            {board.tasks.map((t) => <option key={t.id} value={t.id}>{taskTitle(board, t)}</option>)}
          </select>
          <select aria-label="Lọc theo tiến trình" value={filters.progress} onChange={(e) => onChange({ progress: e.target.value as ProgressFilter })} className="input">
            {PROGRESS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            aria-label="Lọc theo thời gian"
            value={filters.time}
            onChange={(e) => {
              const time = e.target.value as TimeFilter;
              onChange({ time, sessionId: time === 'session' ? filters.sessionId || board.sessions[0]?.id || '' : '' });
            }}
            className="input"
          >
            {TIME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {filters.time === 'session' ? (
            <select aria-label="Chọn buổi" value={filters.sessionId} onChange={(e) => onChange({ sessionId: e.target.value })} className="input">
              {board.sessions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          ) : (
            <button type="button" onClick={onClear} disabled={!isFiltered} className="btn-ghost">
              <X className="h-4 w-4" aria-hidden /> Xóa bộ lọc
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-2">
          <span aria-live="polite" className="inline-flex items-center gap-1.5">
            <Rows3 className="h-4 w-4" aria-hidden />
            Hiển thị <b className="text-ink">{resultCount}</b> kết quả
          </span>
          {onDeleteShown && (deletableCount ?? 0) > 0 && (
            <button type="button" onClick={onDeleteShown} className="btn-ghost btn-sm hover:!border-rose-300 hover:!bg-rose-50 hover:!text-rose-700">
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Xóa {deletableCount} bài đang hiển thị
            </button>
          )}
          {filters.time === 'session' && (
            <button type="button" onClick={onClear} disabled={!isFiltered} className="btn-ghost btn-sm">
              <X className="h-3.5 w-3.5" aria-hidden /> Xóa bộ lọc
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
