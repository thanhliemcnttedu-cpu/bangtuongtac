import type { BoardData } from '../types/board';
import { PROGRESS_LABEL, formatDateTime } from '../lib/format';
import { buildRows, computeKpis } from '../lib/boardLogic';
import { ModalShell } from './ModalShell';

/** Thông tin tổng quan của bảng: chủ bảng, ngày tạo, số lượng và phân bố trạng thái. */
export function BoardDetailsModal({ board, onClose }: { board: BoardData; onClose: () => void }) {
  const rows = buildRows(board);
  const k = computeKpis(rows);
  const attachments = board.cards.reduce((n, c) => n + c.attachments.length, 0);
  const byStatus = (['pending', 'approved', 'featured', 'needs_edit'] as const).map((s) => ({ s, n: board.cards.filter((c) => c.status === s).length }));

  const facts: [string, string][] = [
    ['Loại bảng', board.mode === 'classroom' ? 'Lớp học' : 'Tập huấn'],
    ['Chủ bảng', board.ownerEmail ?? '—'],
    ['Ngày tạo', board.createdAt ? formatDateTime(board.createdAt) : '—'],
    ['Nhiệm vụ', `${board.tasks.length}`],
    ['Tài liệu ghim', `${board.pinned.length}`],
    ['Danh sách sĩ số', `${board.roster.length} người`],
    ['Bài nộp', `${board.cards.length} bài · ${attachments} đính kèm`],
    ['Tỉ lệ hoàn thành', `${k.completionPct}% (${k.done}/${k.total})`],
    ['Trạng thái bảng', board.archivedAt ? `Đã đóng lúc ${formatDateTime(board.archivedAt)}` : 'Đang mở'],
  ];

  return (
    <ModalShell title="Chi tiết bảng" onClose={onClose}>
      <h3 className="text-lg font-extrabold">{board.title}</h3>
      <dl className="mt-3 divide-y divide-brand-100 rounded-2xl bg-brand-50/60 text-sm">
        {facts.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 px-3 py-2">
            <dt className="text-ink-2">{label}</dt>
            <dd className="min-w-0 break-words text-right font-bold">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        {byStatus.map(({ s, n }) => <span key={s} className="chip bg-white text-ink ring-brand-200">{PROGRESS_LABEL[s]}: {n}</span>)}
      </div>
    </ModalShell>
  );
}
