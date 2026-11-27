import { useState } from 'react';
import { CheckCheck, ClipboardCopy, Download, Eye, Star } from 'lucide-react';
import type { BoardData, BoardRow } from '../types/board';
import { PROGRESS_LABEL, formatDateTime } from '../lib/format';
import { downloadCsv } from '../lib/csv';
import { buildReport, reportFilename } from '../lib/report';
import { StatusBadge } from './StatusBadge';
import { DownloadFiles } from './DownloadFiles';
import type { RowActions } from './GridAndColumnsView';

interface Props extends RowActions {
  rows: BoardRow[];
  board: BoardData;
}

/** Bảng đối chiếu sĩ số: ai đã nộp, ai chưa, tiến trình, thời gian nộp, thao tác nhanh. */
export function SubmissionTableView({ rows, board, canManage, onOpen, onSetStatus, selection }: Props) {
  const pickable = canManage && !!selection;
  const cardIds = rows.flatMap((r) => (r.card ? [r.card.id] : []));
  const allOn = cardIds.length > 0 && !!selection && cardIds.every((id) => selection.ids.has(id));
  const [copied, setCopied] = useState(false);
  const unitLabel = board.mode === 'classroom' ? 'Tổ / Lớp' : 'Trường / Đơn vị';
  const missing = rows.filter((r) => r.progress === 'not_submitted' || r.progress === 'in_progress');

  const exportCsv = (): void => downloadCsv(reportFilename(board, 'danh-sach-nop-bai'), buildReport(board, rows));

  const copyMissing = async (): Promise<void> => {
    const text = missing.map((r) => `${r.member.name}${r.member.unit ? ` (${r.member.unit})` : ''}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Sao chép danh sách chưa nộp:', text);
    }
  };

  return (
    <div className="glass overflow-hidden rounded-3xl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-100 p-3">
        <p className="text-sm text-ink-2">
          <b className="text-ink">{rows.length}</b> dòng · <b className="text-rose-700">{missing.length}</b> người chưa nộp hoặc đang làm
        </p>
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <button type="button" onClick={copyMissing} disabled={missing.length === 0} className="btn-ghost btn-sm">
              <ClipboardCopy className="h-4 w-4" aria-hidden /> {copied ? 'Đã sao chép' : 'Sao chép danh sách chưa nộp'}
            </button>
          )}
          <button type="button" onClick={exportCsv} className="btn-primary btn-sm">
            <Download className="h-4 w-4" aria-hidden /> Xuất CSV
          </button>
        </div>
      </div>

      {/* Điện thoại: mỗi người một thẻ, không phải cuộn ngang. */}
      <ul className="divide-y divide-brand-100 sm:hidden" aria-label="Danh sách bài nộp">
        {rows.length === 0 && <li className="px-3 py-8 text-center text-sm text-ink-2">Không có dòng nào phù hợp bộ lọc.</li>}
        {rows.map((r, i) => (
          <li key={r.member.id} className={`space-y-1.5 p-3 ${r.card && selection?.ids.has(r.card.id) ? 'bg-amber-50' : ''}`}>
            <div className="flex items-start gap-2">
              {pickable && r.card && <label className="flex h-11 w-8 shrink-0 items-center"><input type="checkbox" className="h-5 w-5 accent-amber-600" checked={selection?.ids.has(r.card.id) ?? false} onChange={() => selection?.toggle(r.card!.id)} aria-label={`Chọn bài của ${r.member.name}`} /></label>}
              <div className="min-w-0 flex-1">
                <p className="break-words font-bold">{i + 1}. {r.member.name}</p>
                <p className="text-xs text-ink-2">{r.member.unit || '—'}{r.card ? ` · ${formatDateTime(r.card.resubmittedAt ?? r.card.submittedAt)}` : ''}{canManage && r.card?.grade !== undefined ? ` · Điểm ${String(r.card.grade).replace('.', ',')}` : ''}</p>
              </div>
              <span className="flex shrink-0 flex-col items-end gap-1"><StatusBadge progress={r.progress} />{r.card?.late && <span className="chip bg-orange-100 text-orange-900 ring-orange-200">Nộp muộn</span>}</span>
            </div>
            {r.card && (
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => onOpen(r.card!.id)} className="btn-ghost btn-sm"><Eye className="h-3.5 w-3.5" aria-hidden /> Xem nhanh</button>
                {canManage && <DownloadFiles card={r.card} />}
                {canManage && r.card.status === 'pending' && <button type="button" onClick={() => onSetStatus(r.card!.id, 'approved')} className="btn btn-sm bg-emerald-600 text-white"><CheckCheck className="h-3.5 w-3.5" aria-hidden /> Duyệt</button>}
                {canManage && <button type="button" aria-pressed={r.card.status === 'featured'} onClick={() => onSetStatus(r.card!.id, r.card!.status === 'featured' ? 'approved' : 'featured')} className={`btn btn-sm ${r.card.status === 'featured' ? 'bg-yellow-400 text-ink' : 'border-[1.5px] border-yellow-300 bg-white text-yellow-800'}`}><Star className={`h-3.5 w-3.5 ${r.card.status === 'featured' ? 'fill-current' : ''}`} aria-hidden /> Tiêu biểu</button>}
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="overflow-x-auto max-sm:hidden">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase tracking-wide text-ink-2">
            <tr>
              {pickable && <th scope="col" className="w-10 px-3 py-3"><input type="checkbox" className="h-4 w-4 cursor-pointer accent-amber-600" checked={allOn} onChange={() => selection?.setMany(cardIds, !allOn)} aria-label="Chọn tất cả bài đang hiển thị" /></th>}
              <th scope="col" className="w-12 px-3 py-3">STT</th>
              <th scope="col" className="px-3 py-3">Họ tên</th>
              <th scope="col" className="px-3 py-3">{unitLabel}</th>
              <th scope="col" className="px-3 py-3">Trạng thái</th>
              <th scope="col" className="px-3 py-3">Thời gian nộp</th>
              {canManage && <th scope="col" className="px-3 py-3">Điểm</th>}
              <th scope="col" className="px-3 py-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-100">
            {rows.length === 0 && (
              <tr><td colSpan={(canManage ? 7 : 6) + (pickable ? 1 : 0)} className="px-3 py-10 text-center text-ink-2">Không có dòng nào phù hợp bộ lọc.</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.member.id} className={`transition-colors duration-150 hover:bg-brand-50/70 ${r.card && selection?.ids.has(r.card.id) ? 'bg-amber-50' : ''}`}>
                {pickable && <td className="px-3 py-2.5">{r.card && <input type="checkbox" className="h-4 w-4 cursor-pointer accent-amber-600" checked={selection?.ids.has(r.card.id) ?? false} onChange={() => selection?.toggle(r.card!.id)} aria-label={`Chọn bài của ${r.member.name}`} />}</td>}
                <td className="px-3 py-2.5 font-semibold text-ink-2">{i + 1}</td>
                <td className="px-3 py-2.5">
                  <span className="font-bold">{r.member.name}</span>
                  {(r.member.role ?? '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => <span key={x} className="chip ml-1.5 bg-indigo-100 text-indigo-800 ring-indigo-200">{x}</span>)}
                  {!r.inRoster && <span className="chip ml-2 bg-violet-100 text-violet-800 ring-violet-200">Ngoài danh sách</span>}
                </td>
                <td className="px-3 py-2.5 text-ink-2">{r.member.unit || '—'}</td>
                <td className="px-3 py-2.5"><StatusBadge progress={r.progress} />{r.card?.late && <span className="chip ml-1 bg-orange-100 text-orange-900 ring-orange-200">Nộp muộn</span>}</td>
                <td className="px-3 py-2.5 text-ink-2">{r.card ? formatDateTime(r.card.resubmittedAt ?? r.card.submittedAt) : '—'}{r.card?.resubmittedAt && <span className="chip ml-1 bg-violet-100 text-violet-800 ring-violet-200" title={`Nộp đầu lúc ${formatDateTime(r.card.submittedAt)}`}>Bản nộp lại</span>}</td>
                {canManage && <td className="px-3 py-2.5 font-extrabold">{r.card?.grade !== undefined ? String(r.card.grade).replace('.', ',') : <span className="font-normal text-ink-3">—</span>}</td>}
                <td className="px-3 py-2.5">
                  <div className="flex justify-end gap-1.5">
                    {r.card && (
                      <button type="button" onClick={() => onOpen(r.card!.id)} className="btn-ghost btn-sm">
                        <Eye className="h-3.5 w-3.5" aria-hidden /> Xem nhanh
                      </button>
                    )}
                    {canManage && r.card && <DownloadFiles card={r.card} />}
                    {canManage && r.card && (
                      <>
                        {r.card.status === 'pending' && (
                          <button type="button" onClick={() => onSetStatus(r.card!.id, 'approved')} className="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700">
                            <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Duyệt
                          </button>
                        )}
                        <button type="button" aria-label={r.card.status === 'featured' ? 'Bỏ đánh dấu tiêu biểu' : 'Đánh dấu tiêu biểu'}
                          aria-pressed={r.card.status === 'featured'}
                          onClick={() => onSetStatus(r.card!.id, r.card!.status === 'featured' ? 'approved' : 'featured')}
                          className={`btn btn-sm !px-2.5 ${r.card.status === 'featured' ? 'bg-yellow-400 text-ink' : 'border-[1.5px] border-yellow-300 bg-white text-yellow-800'}`}>
                          <Star className={`h-3.5 w-3.5 ${r.card.status === 'featured' ? 'fill-current' : ''}`} aria-hidden /> Đánh dấu
                        </button>
                      </>
                    )}
                    {!r.card && <span className="text-xs text-ink-3">Chưa có bài</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
