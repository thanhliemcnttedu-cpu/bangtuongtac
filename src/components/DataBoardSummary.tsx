import { CheckCircle2, Clock3, Hourglass, Target, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Kpis, ProgressFilter } from '../types/board';

interface Props {
  kpis: Kpis;
  active: ProgressFilter;
  /** Bấm thẻ KPI → lọc danh sách theo trạng thái tương ứng (bấm lại thẻ đang chọn → bỏ lọc). */
  onSelect: (filter: ProgressFilter) => void;
}

interface Item {
  key: string;
  filter: ProgressFilter;
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
  tone: string;
}

export function DataBoardSummary({ kpis, active, onSelect }: Props) {
  const items: Item[] = [
    { key: 'total', filter: 'all', label: 'Tổng người tham gia', value: String(kpis.total), hint: 'Theo danh sách sĩ số', icon: <Users className="h-5 w-5" />, tone: 'text-brand-700 bg-brand-100' },
    { key: 'submitted', filter: 'submitted', label: 'Đã nộp bài', value: String(kpis.submitted), hint: 'Có ít nhất 1 bài', icon: <CheckCircle2 className="h-5 w-5" />, tone: 'text-emerald-700 bg-emerald-100' },
    { key: 'waiting', filter: 'waiting', label: 'Chờ duyệt / Đang làm', value: String(kpis.waiting), hint: 'Cần giáo viên xem', icon: <Hourglass className="h-5 w-5" />, tone: 'text-amber-800 bg-amber-100' },
    { key: 'not', filter: 'not_submitted', label: 'Chưa nộp', value: String(kpis.notSubmitted), hint: 'Nhắc bài cuối giờ', icon: <Clock3 className="h-5 w-5" />, tone: 'text-rose-700 bg-rose-100' },
    { key: 'done', filter: 'done', label: 'Tỉ lệ hoàn thành', value: `${kpis.completionPct}%`, hint: 'Đã duyệt + tiêu biểu', icon: <Target className="h-5 w-5" />, tone: 'text-teal2-700 bg-teal2-100' },
  ];

  return (
    <section aria-label="Tổng hợp số liệu" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {items.map((it) => {
        const selected = active === it.filter;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onSelect(selected && it.filter !== 'all' ? 'all' : it.filter)}
            aria-pressed={selected}
            className={`glass group rounded-3xl p-4 text-left transition duration-200 hover:-translate-y-1 hover:shadow-lift ${
              selected ? 'ring-2 ring-brand-600' : ''
            } ${it.key === 'total' ? 'col-span-2 md:col-span-1' : ''}`}
          >
            <div className="flex items-center justify-between">
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${it.tone}`}>{it.icon}</span>
              <span className="text-3xl font-extrabold tracking-tight">{it.value}</span>
            </div>
            <p className="mt-3 text-sm font-bold">{it.label}</p>
            <p className="text-xs text-ink-2">{it.hint}</p>
            {it.key === 'done' && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-100" aria-hidden>
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 to-teal2-500 transition-all duration-500"
                  style={{ width: `${kpis.completionPct}%` }}
                />
              </div>
            )}
          </button>
        );
      })}
    </section>
  );
}
