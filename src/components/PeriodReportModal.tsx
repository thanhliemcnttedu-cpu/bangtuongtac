import { useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, ClipboardCopy, FileSpreadsheet, Printer } from 'lucide-react';
import type { BoardData } from '../types/board';
import { buildPeriodReport, periodHtml, periodRows, periodText } from '../lib/periodReport';
import type { PeriodKind } from '../lib/periodReport';
import { printHtml } from '../lib/taskReport';
import { downloadCsv } from '../lib/csv';
import { ModalShell } from './ModalShell';

interface Props { board: BoardData; onClose: () => void }

/** Tổng hợp theo tuần hoặc tháng: mỗi thành viên làm được bao nhiêu việc đến hạn, ai còn thiếu, từng việc đạt bao nhiêu phần trăm. */
export function PeriodReportModal({ board, onClose }: Props) {
  const [kind, setKind] = useState<PeriodKind>('week');
  const [offset, setOffset] = useState(0);
  const [copied, setCopied] = useState(false);
  const r = useMemo(() => buildPeriodReport(board, kind, offset, Date.now()), [board, kind, offset]);
  const copy = async (): Promise<void> => { try { await navigator.clipboard.writeText(periodText(board, r)); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* không chép được */ } };
  const stat = 'rounded-2xl border-[1.5px] border-brand-100 bg-white px-3 py-2 text-center';

  return (
    <ModalShell title="Tổng hợp tuần / tháng" onClose={onClose} maxWidth="max-w-5xl">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full border-[1.5px] border-brand-200 bg-white p-0.5" role="group" aria-label="Loại kỳ">
            {(['week', 'month'] as const).map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); setOffset(0); }} className={`rounded-full px-3 py-1.5 text-sm font-bold ${kind === k ? 'bg-brand-600 text-white' : 'text-ink-2 hover:bg-brand-50'}`}>{k === 'week' ? 'Theo tuần' : 'Theo tháng'}</button>)}
          </div>
          <button type="button" onClick={() => setOffset(offset - 1)} className="btn-ghost btn-sm" aria-label="Kỳ trước"><ChevronLeft className="h-4 w-4" aria-hidden /></button>
          <b className="text-sm" aria-live="polite">{r.range.label}</b>
          <button type="button" onClick={() => setOffset(offset + 1)} className="btn-ghost btn-sm" aria-label="Kỳ sau"><ChevronRight className="h-4 w-4" aria-hidden /></button>
          {offset !== 0 && <button type="button" onClick={() => setOffset(0)} className="btn-ghost btn-sm">Kỳ hiện tại</button>}
          <span className="ml-auto flex flex-wrap gap-2">
            <button type="button" onClick={() => void copy()} className="btn-ghost btn-sm">{copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <ClipboardCopy className="h-3.5 w-3.5" aria-hidden />} {copied ? 'Đã chép' : 'Chép tóm tắt'}</button>
            <button type="button" onClick={() => downloadCsv(`tong-hop-${kind === 'week' ? 'tuan' : 'thang'}.csv`, periodRows(board, r))} className="btn-ghost btn-sm"><FileSpreadsheet className="h-3.5 w-3.5" aria-hidden /> Tải CSV</button>
            <button type="button" onClick={() => printHtml(periodHtml(board, r))} className="btn-ghost btn-sm"><Printer className="h-3.5 w-3.5" aria-hidden /> In / lưu PDF</button>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <p className={stat}><b className="block text-2xl">{r.tasks.length}</b><span className="text-xs text-ink-2">việc đến hạn</span></p>
          <p className={stat}><b className="block text-2xl">{r.done}/{r.slots}</b><span className="text-xs text-ink-2">lượt đã nộp</span></p>
          <p className={stat}><b className="block text-2xl text-emerald-700">{r.pct}%</b><span className="text-xs text-ink-2">hoàn thành</span></p>
          <p className={stat}><b className="block text-2xl text-orange-700">{r.late}</b><span className="text-xs text-ink-2">nộp muộn</span></p>
        </div>

        {r.tasks.length === 0 ? <p className="rounded-2xl border border-dashed border-brand-200 bg-white/70 p-6 text-center text-ink-2">Không có việc nào đến hạn trong kỳ này.</p> : (
          <>
            <section aria-label="Theo thành viên" className="overflow-x-auto rounded-2xl border-[1.5px] border-brand-100 bg-white">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-brand-50 text-xs font-extrabold uppercase tracking-wide text-ink-2"><tr><th className="px-3 py-2">Thành viên</th><th className="px-2 py-2 text-center">Giao</th><th className="px-2 py-2 text-center">Nộp</th><th className="px-2 py-2 text-center">Muộn</th><th className="px-3 py-2">Còn thiếu</th></tr></thead>
                <tbody className="divide-y divide-brand-100">
                  {r.members.filter((m) => m.assigned > 0).map((m) => (
                    <tr key={m.member.id}>
                      <td className="px-3 py-1.5 font-bold">{m.member.name}{m.member.role ? <span className="ml-1.5 text-xs font-semibold text-indigo-700">{m.member.role}</span> : null}</td>
                      <td className="px-2 text-center">{m.assigned}</td>
                      <td className="px-2 text-center"><span className={`chip ${m.done === m.assigned ? 'bg-emerald-100 text-emerald-900 ring-emerald-200' : 'bg-amber-100 text-amber-900 ring-amber-200'}`}>{m.done}</span></td>
                      <td className="px-2 text-center">{m.late || '—'}</td>
                      <td className="px-3 text-xs text-ink-2">{m.missing.join('; ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section aria-label="Theo công việc">
              <h3 className="mb-1.5 text-sm font-extrabold">Theo công việc</h3>
              <ul className="space-y-1.5">
                {r.tasks.map((t) => (
                  <li key={t.task.id} className="rounded-xl border border-brand-100 bg-white px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><b>{t.task.label}</b><span className="text-xs text-ink-2">{t.report.done.length}/{t.report.total} · {t.report.pct}%{t.report.lateCount ? ` · ${t.report.lateCount} muộn` : ''}</span></div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${t.report.pct === 100 ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${t.report.pct}%` }} /></div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </ModalShell>
  );
}
