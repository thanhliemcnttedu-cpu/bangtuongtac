import type { BoardData, BoardRow } from '../types/board';
import { summarizeByUnit } from '../lib/boardLogic';

interface Props {
  rows: BoardRow[];
  board: BoardData;
  /** Bấm một nhóm → lọc theo tên nhóm (đặt vào ô tìm kiếm). */
  onPickUnit: (unit: string) => void;
}

/** Kiểu 4: tỉ lệ hoàn thành từng Tổ / Đội / Đơn vị. */
export function GroupSummaryView({ rows, board, onPickUnit }: Props) {
  const units = summarizeByUnit(rows);
  const label = board.mode === 'classroom' ? 'tổ' : 'đơn vị';

  if (units.length === 0) {
    return <div className="glass rounded-3xl p-10 text-center text-ink-2">Chưa có dữ liệu để tổng hợp theo {label}.</div>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {units.map((u) => {
        const submittedPct = u.total === 0 ? 0 : Math.round((u.submitted / u.total) * 100);
        return (
          <button key={u.unit} type="button" onClick={() => u.unit.startsWith('(') ? undefined : onPickUnit(u.unit)}
            className="glass pop-in rounded-3xl p-4 text-left transition duration-200 hover:-translate-y-1 hover:shadow-lift">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-extrabold">{u.unit}</h3>
                <p className="text-xs text-ink-2">{u.total} thành viên</p>
              </div>
              <span className="text-2xl font-extrabold text-teal2-700">{u.pct}%</span>
            </div>

            <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-100" role="img"
              aria-label={`${u.done} hoàn thành, ${u.submitted - u.done} đã nộp chờ xử lý, ${u.notSubmitted} chưa nộp`}>
              <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${u.total ? (u.done / u.total) * 100 : 0}%` }} />
              <div className="bg-amber-400 transition-all duration-500" style={{ width: `${u.total ? ((u.submitted - u.done) / u.total) * 100 : 0}%` }} />
            </div>

            <dl className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
              <div className="rounded-xl bg-emerald-50 p-2"><dt className="text-ink-2">Hoàn thành</dt><dd className="text-base font-extrabold text-emerald-700">{u.done}</dd></div>
              <div className="rounded-xl bg-brand-50 p-2"><dt className="text-ink-2">Đã nộp</dt><dd className="text-base font-extrabold text-brand-700">{u.submitted}<span className="text-[10px] font-bold text-ink-3"> ({submittedPct}%)</span></dd></div>
              <div className="rounded-xl bg-amber-50 p-2"><dt className="text-ink-2">Chờ/Đang</dt><dd className="text-base font-extrabold text-amber-800">{u.waiting}</dd></div>
              <div className="rounded-xl bg-rose-50 p-2"><dt className="text-ink-2">Chưa nộp</dt><dd className="text-base font-extrabold text-rose-700">{u.notSubmitted}</dd></div>
            </dl>
          </button>
        );
      })}
    </div>
  );
}
