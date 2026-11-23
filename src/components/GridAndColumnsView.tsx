import { useState } from 'react';
import { CheckCheck, Clock, FileEdit, MessageCircle, Star, Trash2 } from 'lucide-react';
import type { BoardData, BoardRow, CardStatus, MemberProgress } from '../types/board';
import { PROGRESS_LABEL, formatRelative } from '../lib/format';
import { StatusBadge } from './StatusBadge';
import { AttachmentThumb } from './AttachmentThumb';
import { PollView } from './PollView';
import type { FeedbackActions } from './FeedbackPanel';
import { formatStars, ratingAvg } from '../lib/peer';

export interface RowActions {
  canManage: boolean;
  onOpen: (cardId: string) => void;
  onSetStatus: (cardId: string, status: CardStatus) => void;
  /** Mã các bài do chính trình duyệt này nộp (còn trong 15 phút) — cho phép tự xóa. */
  deletableIds?: ReadonlySet<string>;
  onDelete?: (cardId: string) => void;
  /** Bình chọn trong thăm dò của bài. */
  onVote?: (cardId: string, optionId: string) => void;
  /** Đánh giá & nhận xét (sao, lời phê, bình luận) cho thẻ đang xem. */
  feedback?: FeedbackActions;
  /** Giáo viên: tích chọn từng bài để xóa hoặc chuyển nhiều bài cùng lúc. */
  selection?: { ids: ReadonlySet<string>; toggle: (cardId: string) => void; setMany: (cardIds: string[], on: boolean) => void };
}

export interface TileProps extends RowActions {
  row: BoardRow;
  board: BoardData;
  compact?: boolean;
  /** Kiểu Tường: thẻ cao thấp tự nhiên, xếp như gạch. */
  wall?: boolean;
}

function taskLabel(board: BoardData, taskId: string): string {
  return board.tasks.find((t) => t.id === taskId)?.label ?? '';
}

/** Nút thao tác nhanh của giáo viên trên một thẻ. */
export function CardQuickActions({ row, onSetStatus }: Pick<TileProps, 'row' | 'onSetStatus'>) {
  const card = row.card;
  if (!card) return null;
  const featured = card.status === 'featured';
  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" onClick={() => onSetStatus(card.id, featured ? 'approved' : 'featured')} aria-pressed={featured}
        className={`btn btn-sm ${featured ? 'bg-yellow-400 text-ink' : 'border-[1.5px] border-yellow-300 bg-white text-yellow-800 hover:bg-yellow-50'}`}>
        <Star className={`h-3.5 w-3.5 ${featured ? 'fill-current' : ''}`} aria-hidden /> Tiêu biểu
      </button>
      {card.status === 'pending' && (
        <button type="button" onClick={() => onSetStatus(card.id, 'approved')} className="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700">
          <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Duyệt
        </button>
      )}
      {card.status !== 'needs_edit' && (
        <button type="button" onClick={() => onSetStatus(card.id, 'needs_edit')} className="btn btn-sm border-[1.5px] border-rose-200 bg-white text-rose-700 hover:bg-rose-50">
          <FileEdit className="h-3.5 w-3.5" aria-hidden /> Cần sửa
        </button>
      )}
    </div>
  );
}

export function Tile({ row, board, compact, wall, canManage, onOpen, onSetStatus, deletableIds, onDelete, onVote, selection, feedback }: TileProps) {
  const { card, member } = row;
  const s = board.settings;

  if (!card) {
    return (
      <article className="flex items-center gap-3 rounded-3xl border-[1.5px] border-dashed border-brand-200 bg-white/60 p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700"><Clock className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold">{member.name}</p>
          <p className="truncate text-xs text-ink-2">{member.unit || 'Chưa ghi đơn vị'}</p>
        </div>
        <span className="ml-auto"><StatusBadge progress={row.progress} /></span>
      </article>
    );
  }

  // Ảnh bìa: ưu tiên ảnh/video/nhúng; thẻ có nhiều đính kèm hiện nhãn +N.
  const shownComments = (card.comments ?? []).filter((m) => m.status !== 'hidden' && m.status !== 'pending');
  const commentCount = shownComments.length;
  const pendingComments = canManage ? (card.comments ?? []).filter((m) => m.status === 'pending').length : 0;
  const cover = card.attachments.find((a) => a.type === 'image' || a.type === 'video' || a.type === 'embed') ?? card.attachments[0] ?? null;

  return (
    <article className={`pop-in group relative flex flex-col overflow-hidden rounded-3xl border-[1.5px] bg-white shadow-soft transition duration-200 hover:-translate-y-1 hover:shadow-lift ${selection?.ids.has(card.id) ? 'border-amber-400 ring-4 ring-amber-300' : 'border-brand-200'}`}>
      {canManage && selection && (
        <label className={`absolute left-2 top-2 z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full shadow-lift ring-2 ${selection.ids.has(card.id) ? 'bg-amber-400 ring-white' : 'bg-white/95 ring-brand-200 hover:ring-brand-400'}`} title="Chọn bài này">
          <input type="checkbox" className="h-5 w-5 cursor-pointer accent-amber-600" checked={selection.ids.has(card.id)} onChange={() => selection.toggle(card.id)} aria-label={`Chọn bài ${card.title} của ${card.authorName}`} />
        </label>
      )}
      <button type="button" onClick={() => onOpen(card.id)} className="block text-left" aria-label={`Xem bài ${card.title} của ${card.authorName}`}>
        <div className="relative">
          <AttachmentThumb attachment={cover} className={`w-full ${compact ? 'h-24' : wall ? 'aspect-[4/3]' : 'aspect-[16/9]'}`} />
          {card.attachments.length > 1 && (
            <span className="chip absolute right-2 top-2 bg-ink/80 text-white ring-white/30">{card.attachments.length} đính kèm</span>
          )}
        </div>
        <div className="space-y-1.5 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {!canManage && feedback?.isMine(card.id) && <span className="chip bg-amber-300 text-ink ring-amber-400"><Star className="h-3 w-3 fill-current" aria-hidden /> {board.mode === 'classroom' ? 'Bài của em' : 'Của tôi'}</span>}
            {s.showAuthor && <span className="chip bg-brand-100 text-brand-800 ring-brand-200">{card.authorName}</span>}
            <StatusBadge progress={card.status} />
            {card.late && <span className="chip bg-orange-100 text-orange-900 ring-orange-200">Nộp muộn</span>}
            {(canManage || s.showGrades) && card.grade !== undefined && <span className="chip bg-teal2-100 text-teal2-700 ring-teal2-500/30">Điểm {String(card.grade).replace('.', ',')}</span>}
            {card.teacherStars !== undefined && <span className="chip bg-teal2-100 text-teal2-700 ring-teal2-500/30" title="Sao của giáo viên"><Star className="h-3 w-3 fill-current" aria-hidden /> GV {card.teacherStars}</span>}
            {ratingAvg(card) !== null && <span className="chip bg-amber-100 text-amber-900 ring-amber-200" title={`${card.ratingCount} bạn đã chấm sao`}><Star className="h-3 w-3 fill-current" aria-hidden /> {formatStars(ratingAvg(card) ?? 0)} ({card.ratingCount})</span>}
            {pendingComments > 0 && <span className="chip bg-amber-100 text-amber-900 ring-amber-300" title="Nhận xét chờ giáo viên duyệt"><MessageCircle className="h-3 w-3" aria-hidden /> {pendingComments} chờ duyệt</span>}
            {commentCount > 0 && <span className="chip bg-sky-100 text-sky-800 ring-sky-200" title="Nhận xét của các bạn"><MessageCircle className="h-3 w-3" aria-hidden /> {commentCount}</span>}
          </div>
          <h3 className={`font-extrabold leading-snug ${compact ? 'text-sm' : 'text-base'}`}>{card.title}</h3>
          {!compact && <p className={`${wall ? '' : 'line-clamp-2'} whitespace-pre-line text-sm text-ink-2`}>{card.body}</p>}
          <p className="text-xs text-ink-2">
            {[s.showAuthor ? card.unit : '', taskLabel(board, card.taskId), s.showTime ? (card.resubmittedAt ? `nộp lại ${formatRelative(card.resubmittedAt)}` : formatRelative(card.submittedAt)) : ''].filter(Boolean).join(' · ')}
          </p>
          {card.teacherNote && <p className="rounded-xl bg-amber-50 px-2 py-1 text-xs text-amber-900">Nhận xét: {card.teacherNote}</p>}
        </div>
      </button>
      {card.poll && onVote && (
        <div className="px-3 pb-3">
          <PollView cardId={card.id} options={card.poll} compact={compact}
            canVote={board.linkMode === 'guest_post' && (card.status === 'approved' || card.status === 'featured')} onVote={onVote} />
        </div>
      )}
      {(canManage || deletableIds?.has(card.id)) && (
        <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-brand-100 px-3 py-2">
          {canManage && <CardQuickActions row={row} onSetStatus={onSetStatus} />}
          {(canManage || deletableIds?.has(card.id)) && onDelete && (
            <button type="button" onClick={() => onDelete(card.id)} aria-label={canManage ? `Xóa bài ${card.title} của ${card.authorName}` : 'Xóa bài của tôi'} className="btn btn-sm ml-auto text-rose-700 hover:bg-rose-50">
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> {canManage ? 'Xóa bài' : 'Xóa bài của tôi'}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

const PROGRESS_COLUMNS: MemberProgress[] = ['not_submitted', 'in_progress', 'pending', 'needs_edit', 'approved', 'featured'];

interface Props extends RowActions {
  rows: BoardRow[];
  board: BoardData;
  mode: 'wall' | 'grid' | 'columns';
}

export function GridAndColumnsView({ rows, board, mode, ...actions }: Props) {
  const [groupBy, setGroupBy] = useState<'progress' | 'task'>('progress');

  if (rows.length === 0) {
    return (
      <div className="glass rounded-3xl p-10 text-center">
        <p className="text-lg font-extrabold">Không có kết quả phù hợp</p>
        <p className="mt-1 text-sm text-ink-2">Thử đổi hoặc xóa bớt bộ lọc để xem thêm bài.</p>
      </div>
    );
  }

  const wide = board.settings.cardSize === 'wide';

  if (mode === 'wall') {
    // Cột CSS: thẻ cao thấp khác nhau xếp khít như bức tường. Số cột giảm một bậc khi chọn thẻ rộng.
    return (
      <div className={`gap-4 ${wide ? 'columns-1 min-[640px]:columns-2 min-[1024px]:columns-3' : 'columns-1 min-[480px]:columns-2 min-[768px]:columns-3 min-[1024px]:columns-4'}`}>
        {rows.map((r) => (
          <div key={r.member.id} className="mb-4 break-inside-avoid">
            <Tile row={r} board={board} wall {...actions} />
          </div>
        ))}
      </div>
    );
  }

  if (mode === 'grid') {
    return (
      <div className={`grid grid-cols-1 gap-4 ${wide ? 'min-[640px]:grid-cols-2 min-[1024px]:grid-cols-3' : 'min-[480px]:grid-cols-2 min-[768px]:grid-cols-3 min-[1024px]:grid-cols-4'}`}>
        {rows.map((r) => <Tile key={r.member.id} row={r} board={board} {...actions} />)}
      </div>
    );
  }

  const columns: { key: string; title: string; rows: BoardRow[] }[] =
    groupBy === 'progress'
      ? PROGRESS_COLUMNS.map((p) => ({ key: p, title: PROGRESS_LABEL[p], rows: rows.filter((r) => r.progress === p) }))
      : [
          ...board.tasks.map((t) => ({ key: t.id, title: t.label, rows: rows.filter((r) => r.card?.taskId === t.id) })),
          { key: 'none', title: 'Chưa nộp / chưa có nhiệm vụ', rows: rows.filter((r) => !r.card) },
        ];

  return (
    <div className="space-y-3">
      <div role="group" aria-label="Chia cột theo" className="inline-flex gap-1 rounded-full bg-brand-50 p-1">
        {(['progress', 'task'] as const).map((g) => (
          <button key={g} type="button" aria-pressed={groupBy === g} onClick={() => setGroupBy(g)}
            className={`btn btn-sm !min-h-[40px] ${groupBy === g ? 'bg-white text-brand-700 shadow-soft' : 'text-ink-2'}`}>
            {g === 'progress' ? 'Theo tiến trình' : 'Theo nhiệm vụ'}
          </button>
        ))}
      </div>
      <div className="-mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-3">
        {columns.map((col) => (
          <section key={col.key} aria-label={col.title} className="w-[280px] shrink-0 snap-start rounded-3xl bg-brand-50/80 p-3 ring-1 ring-brand-100">
            <h3 className="mb-3 flex items-center justify-between px-1 text-sm font-extrabold">
              {col.title}
              <span className="chip bg-white text-brand-800 ring-brand-200">{col.rows.length}</span>
            </h3>
            <div className="space-y-3">
              {col.rows.length === 0 && <p className="rounded-2xl border border-dashed border-brand-200 p-4 text-center text-xs text-ink-3">Trống</p>}
              {col.rows.map((r) => <Tile key={r.member.id} row={r} board={board} compact {...actions} />)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
