import { useState } from 'react';
import { CheckCheck, ClipboardCopy, Download, Eye, Star } from 'lucide-react';
import type { BoardData, BoardRow } from '../types/board';
import { PROGRESS_LABEL, formatDateTime } from '../lib/format';
import { downloadCsv } from '../lib/csv';
import { buildReport, reportFilename } from '../lib/report';
import { StatusBadge } from './StatusBadge';
import type { RowActions } from './GridAndColumnsView';

interface Props extends RowActions {
  rows: BoardRow[];
  board: BoardData;
}

/** Bảng đối chiếu sĩ số: ai đã nộp, ai chưa, tiến trình, thời gian nộp, thao tác nhanh. */
export function SubmissionTableView({ rows, board, canManage, onOpen, onSetStatus }: Props) {
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

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase tracking-wide text-ink-2">
            <tr>
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
              <tr><td colSpan={canManage ? 7 : 6} className="px-3 py-10 text-center text-ink-2">Không có dòng nào phù hợp bộ lọc.</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.member.id} className="transition-colors duration-150 hover:bg-brand-50/70">
                <td className="px-3 py-2.5 font-semibold text-ink-2">{i + 1}</td>
                <td className="px-3 py-2.5">
                  <span className="font-bold">{r.member.name}</span>
                  {!r.inRoster && <span className="chip ml-2 bg-violet-100 text-violet-800 ring-violet-200">Ngoài danh sách</span>}
                </td>
                <td className="px-3 py-2.5 text-ink-2">{r.member.unit || '—'}</td>
                <td className="px-3 py-2.5"><StatusBadge progress={r.progress} />{r.card?.late && <span className="chip ml-1 bg-orange-100 text-orange-900 ring-orange-200">Nộp muộn</span>}</td>
                <td className="px-3 py-2.5 text-ink-2">{r.card ? formatDateTime(r.card.submittedAt) : '—'}</td>
                {canManage && <td className="px-3 py-2.5 font-extrabold">{r.card?.grade !== undefined ? String(r.card.grade).replace('.', ',') : <span className="font-normal text-ink-3">—</span>}</td>}
                <td className="px-3 py-2.5">
                  <div className="flex justify-end gap-1.5">
                    {r.card && (
                      <button type="button" onClick={() => onOpen(r.card!.id)} className="btn-ghost btn-sm">
                        <Eye className="h-3.5 w-3.5" aria-hidden /> Xem nhanh
                      </button>
                    )}
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
