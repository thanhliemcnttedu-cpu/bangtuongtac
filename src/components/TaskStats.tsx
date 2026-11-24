import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import type { TaskSubItem } from '../types/board';
import type { MyTask } from '../lib/myTasks';
import { PERIODS, buildCsv, computeStats, periodRange } from '../lib/taskStats';
import type { Period, Row } from '../lib/taskStats';

const pct = (a: number, b: number): number => (b > 0 ? Math.round((a / b) * 100) : 0);

function Bar({ value, tone = 'from-brand-500 to-teal2-500' }: { value: number; tone?: string }) {
  return <div className="h-2 overflow-hidden rounded-full bg-brand-100" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><div className={`h-full rounded-full bg-gradient-to-r ${tone}`} style={{ width: `${value}%` }} /></div>;
}

function Table({ title, rows, hint }: { title: string; rows: Row[]; hint?: string }) {
  if (rows.length === 0) return null;
  return (
    <section className="rounded-2xl border-[1.5px] border-brand-100 bg-white p-3" aria-label={title}>
      <h2 className="text-sm font-extrabold">{title}</h2>
      {hint && <p className="mb-1 text-xs text-ink-2">{hint}</p>}
      <div className="overflow-x-auto">
        <table className="mt-1 w-full min-w-[420px] text-left text-sm">
          <thead><tr className="text-xs text-ink-3"><th className="py-1 pr-2 font-bold">Tên</th><th className="px-2 font-bold">Số lượt</th><th className="px-2 font-bold">Xong</th><th className="px-2 font-bold">Xong trễ</th><th className="px-2 font-bold">Quá hạn</th><th className="w-32 pl-2 font-bold">Hoàn thành</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.label}-${i}`} className="border-t border-brand-100">
                <td className="max-w-[16rem] truncate py-1.5 pr-2 font-bold" title={r.label}>{r.label}</td><td className="px-2">{r.total}</td><td className="px-2">{r.done}</td>
                <td className={`px-2 ${r.late > 0 ? 'font-bold text-amber-700' : ''}`}>{r.late}</td><td className={`px-2 ${r.overdue > 0 ? 'font-bold text-rose-700' : ''}`}>{r.overdue}</td>
                <td className="pl-2"><span className="flex items-center gap-2"><span className="w-full"><Bar value={pct(r.done, r.total)} /></span><span className="w-9 text-xs font-bold">{pct(r.done, r.total)}%</span></span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Thống kê công việc theo kỳ: tổng, hoàn thành đúng hạn / trễ, đang làm, quá hạn, hoãn / hủy; theo nhóm; việc lặp tính RIÊNG TỪNG LƯỢT;
 * đầu việc thành phần. Số liệu lấy thẳng từ công việc đã lưu. Xuất CSV (mở được bằng Excel).
 */
export function TaskStats({ tasks, items, now }: { tasks: MyTask[]; items: TaskSubItem[]; now: number }) {
  const [period, setPeriod] = useState<Period>('month');
  const range = useMemo(() => periodRange(period, now), [period, now]);
  const s = useMemo(() => computeStats(tasks, items, now, range), [tasks, items, now, range]);
  const inRangeTasks = useMemo(() => tasks.filter((t) => { const d = t.dueAt ? Date.parse(t.dueAt) : NaN; return !Number.isNaN(d) && (range.from === null || d >= range.from) && (range.to === null || d <= range.to); }), [tasks, range]);

  const download = (): void => {
    const blob = new Blob([buildCsv(inRangeTasks, items, now)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `thong-ke-cong-viec-${new Date(now).toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const cards: [string, number, string][] = [
    ['Tổng việc có hạn', s.total, 'bg-white ring-brand-200'], ['Xong đúng hạn', s.doneOnTime, 'bg-emerald-50 text-emerald-900 ring-emerald-200'], ['Xong trễ hạn', s.doneLate, 'bg-amber-50 text-amber-900 ring-amber-200'],
    ['Đang làm / chưa làm', s.doing + s.todo + s.waiting, 'bg-indigo-50 text-indigo-900 ring-indigo-200'], ['Quá hạn', s.overdue, 'bg-rose-50 text-rose-900 ring-rose-200'], ['Hoãn / hủy', s.postponed + s.cancelled, 'bg-violet-50 text-violet-900 ring-violet-200'],
  ];
  return (
    <section aria-label="Thống kê công việc" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Chọn kỳ thống kê">
          {PERIODS.map(([id, label]) => <button key={id} type="button" aria-pressed={period === id} onClick={() => setPeriod(id)} className={`chip cursor-pointer !px-3 !py-1.5 text-sm max-lg:!min-h-[44px] ${period === id ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-2 ring-brand-200 hover:bg-brand-50'}`}>{label}</button>)}
        </div>
        <button type="button" onClick={download} disabled={inRangeTasks.length === 0} className="btn-ghost ml-auto max-lg:min-h-[44px]"><Download className="h-4 w-4" aria-hidden /> Tải bảng CSV (Excel)</button>
      </div>
      <p className="text-xs text-ink-2">Tính theo hạn hoàn thành của việc trong kỳ.{s.noDue > 0 ? ` ${s.noDue} việc chưa đặt hạn không nằm trong thống kê.` : ''} Việc lặp: mỗi lượt là một việc riêng nên số lượt luôn đủ.</p>

      {s.total === 0 ? <p className="rounded-2xl border border-dashed border-brand-200 bg-white/70 p-8 text-center text-ink-2">Chưa có việc nào có hạn trong kỳ này.</p> : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {cards.map(([l, n, tone]) => <div key={l} className={`rounded-2xl p-3 ring-1 ${tone}`}><p className="text-2xl font-extrabold leading-none">{n}</p><p className="mt-1 text-xs font-bold">{l}</p></div>)}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-2xl border-[1.5px] border-brand-100 bg-white p-3">
              <p className="text-xs font-extrabold uppercase tracking-wide text-ink-3">Tỷ lệ hoàn thành</p>
              <p className="mt-1 text-3xl font-extrabold text-brand-700">{s.completionPct}%</p><Bar value={s.completionPct} />
              <p className="mt-1 text-xs text-ink-2">Hoàn thành / (tổng − đã hủy){s.cancelled > 0 ? `; ${s.cancelled} việc đã hủy không tính` : ''}.</p>
            </div>
            <div className="rounded-2xl border-[1.5px] border-brand-100 bg-white p-3">
              <p className="text-xs font-extrabold uppercase tracking-wide text-ink-3">Tỷ lệ hoàn thành đúng hạn</p>
              <p className="mt-1 text-3xl font-extrabold text-emerald-700">{s.onTimePct === null ? '—' : `${s.onTimePct}%`}</p>{s.onTimePct !== null && <Bar value={s.onTimePct} tone="from-emerald-500 to-teal2-500" />}
              <p className="mt-1 text-xs text-ink-2">{s.onTimePct === null ? 'Chưa có việc nào có ngày hoàn thành thực tế để so với hạn.' : `Đúng hạn / (đúng hạn + trễ).`}{s.doneUnknown > 0 ? ` ${s.doneUnknown} việc đã xong nhưng chưa ghi ngày hoàn thành nên không tính.` : ''}</p>
            </div>
          </div>
          {s.items.all > 0 && (
            <div className="rounded-2xl border-[1.5px] border-brand-100 bg-white p-3">
              <p className="text-xs font-extrabold uppercase tracking-wide text-ink-3">Đầu việc thành phần</p>
              <p className="mt-1 text-sm"><b>{s.items.done}</b> / {s.items.all} đầu việc đã hoàn thành{s.items.overdue > 0 ? <> · <b className="text-rose-700">{s.items.overdue} quá hạn</b></> : null}</p><div className="mt-1"><Bar value={pct(s.items.done, s.items.all)} /></div>
            </div>
          )}
          <Table title="Theo nhóm công việc" rows={s.byCategory} />
          <Table title="Việc lặp theo chu kỳ" rows={s.series} hint="Mỗi lượt của một việc lặp được tính riêng; “Xong trễ” là lượt hoàn thành sau hạn." />
        </>
      )}
    </section>
  );
}
