import { useCallback, useEffect, useState } from 'react';
import { CheckCheck, ChevronLeft, ChevronRight, Download, ExternalLink, Maximize, Star, X } from 'lucide-react';
import type { BoardData, BoardRow, CardStatus } from '../types/board';
import { formatDateTime } from '../lib/format';
import { StatusBadge } from './StatusBadge';
import { AttachmentView } from './AttachmentView';
import { PollView } from './PollView';
import { FeedbackPanel } from './FeedbackPanel';
import type { FeedbackActions } from './FeedbackPanel';
import { safeHref } from '../lib/safeUrl';
import { renderRich } from '../lib/richText';
import { downloadAllAsZip, zippable } from '../lib/downloadAll';

interface Props {
  /** Chỉ các dòng đã có bài, đúng thứ tự đang hiển thị. */
  items: (BoardRow & { card: NonNullable<BoardRow['card']> })[];
  startCardId: string;
  board: BoardData;
  canManage: boolean;
  onSetStatus: (cardId: string, status: CardStatus) => void;
  onVote?: (cardId: string, optionId: string) => void;
  /** Đánh giá & nhận xét: sao, lời phê, bình luận. */
  feedback?: FeedbackActions;
  onClose: () => void;
}

/** Trình chiếu từng bài như slide: chữ lớn, ít thanh thừa; ← → để chuyển bài, Esc để thoát. */
export function SlidePresentationModal({ items, startCardId, board, canManage, onSetStatus, onVote, feedback, onClose }: Props) {
  const [index, setIndex] = useState(() => Math.max(0, items.findIndex((i) => i.card.id === startCardId)));
  const [zipMsg, setZipMsg] = useState('');
  useEffect(() => setZipMsg(''), [index]);
  const total = items.length;
  const safeIndex = Math.min(index, Math.max(0, total - 1));
  const item = items[safeIndex];

  const go = useCallback((delta: number) => {
    setIndex((i) => Math.min(total - 1, Math.max(0, i + delta)));
  }, [total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // Đang gõ nhận xét: phím mũi tên dùng để di chuyển con trỏ, không chuyển bài.
      if (e.key !== 'Escape' && e.target instanceof HTMLElement && e.target.matches('input, textarea, select')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') go(1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1);
      else if (e.key === 'Home') setIndex(0);
      else if (e.key === 'End') setIndex(total - 1);
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose, total]);

  if (!item) return null;
  const { card } = item;
  const taskLabel = board.tasks.find((t) => t.id === card.taskId)?.label ?? '';
  const featured = card.status === 'featured';
  const media = card.attachments.filter((a) => a.type !== 'link');
  const links = card.attachments.filter((a) => a.type === 'link');
  const hasMedia = media.length > 0;
  const packable = card.attachments.filter(zippable);
  const downloadAll = (): void => {
    setZipMsg('Đang gói tệp…');
    void downloadAllAsZip(card.attachments, `${card.authorName} - ${card.title}`)
      .then((n) => setZipMsg(`Đã tải ${n} tệp.`), (e) => setZipMsg(e instanceof Error ? e.message : 'Không tải được.'));
  };

  const fullscreen = (): void => {
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="Chế độ trình chiếu">
      <header className="flex items-center justify-between gap-3 border-b border-brand-100 px-4 py-2.5 sm:px-6">
        <p className="min-w-0 truncate text-sm font-bold text-ink-2">{board.title}</p>
        <div className="flex shrink-0 items-center gap-2">
          <span className="chip bg-brand-100 text-base text-brand-800 ring-brand-200" aria-live="polite">Bài {safeIndex + 1} / {total}</span>
          <button type="button" onClick={fullscreen} className="btn-ghost btn-sm hidden sm:inline-flex"><Maximize className="h-4 w-4" aria-hidden /> Toàn màn hình</button>
          <button type="button" onClick={onClose} className="btn-ghost btn-sm"><X className="h-4 w-4" aria-hidden /> Thoát <kbd className="rounded bg-brand-50 px-1 text-[10px]">Esc</kbd></button>
        </div>
      </header>

      <main key={card.id} className={`pop-in grid min-h-0 flex-1 gap-6 overflow-y-auto p-4 sm:p-8 lg:gap-10 ${hasMedia ? 'lg:grid-cols-[1.15fr_1fr]' : 'mx-auto w-full max-w-4xl'}`}>
        {hasMedia && (
          <div className="flex min-h-[220px] flex-col gap-4">
            {packable.length > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={downloadAll} className="btn-ghost btn-sm"><Download className="h-4 w-4" aria-hidden /> Tải tất cả {packable.length} tệp (.zip)</button>
                {zipMsg && <span role="status" className="text-sm font-bold text-brand-700">{zipMsg}</span>}
              </div>
            )}
            {media.map((a, i) => <AttachmentView key={`${a.name}-${i}`} attachment={a} />)}
          </div>
        )}
        <div className="flex flex-col justify-center gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge progress={card.status} />
            {card.late && <span className="chip bg-orange-100 text-orange-900 ring-orange-200">Nộp muộn</span>}
            {canManage && card.grade !== undefined && <span className="chip bg-teal2-100 text-base text-teal2-700 ring-teal2-500/30">Điểm {String(card.grade).replace('.', ',')}</span>}
            <span className="text-sm font-bold text-ink-2">{taskLabel}</span>
          </div>
          <h2 className="text-[clamp(1.8rem,4vw,3.4rem)] font-extrabold leading-tight tracking-tight">{card.title}</h2>
          <p className="text-[clamp(1.1rem,2vw,1.75rem)] font-extrabold text-brand-700">
            {card.authorName}
            {card.unit && <span className="font-bold text-ink-2"> · {card.unit}</span>}
          </p>
          <div className="text-[clamp(1.05rem,1.8vw,1.6rem)] leading-relaxed text-ink">{renderRich(card.body)}</div>
          {links.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {links.map((l, i) => (
                <a key={`${l.name}-${i}`} href={safeHref(l.url)} target="_blank" rel="noopener noreferrer" className="btn-ghost w-fit"><ExternalLink className="h-4 w-4" aria-hidden /> {l.name}</a>
              ))}
            </div>
          )}
          {card.poll && onVote && (
            <div className="max-w-xl">
              <PollView cardId={card.id} options={card.poll} onVote={onVote}
                canVote={board.linkMode === 'guest_post' && (card.status === 'approved' || card.status === 'featured')} />
            </div>
          )}
          {feedback && <FeedbackPanel card={card} board={board} fb={feedback} />}
          {!feedback && card.teacherNote && <p className="rounded-2xl bg-amber-50 p-3 text-base text-amber-900">Nhận xét của giáo viên: {card.teacherNote}</p>}
          <p className="text-sm text-ink-3">{card.resubmittedAt ? <>Nộp lại lúc <b>{formatDateTime(card.resubmittedAt)}</b> <span className="chip ml-1 bg-violet-100 text-violet-800 ring-violet-200">Bản nộp lại{(card.revisions ?? 1) > 1 ? ` lần ${card.revisions}` : ''}</span> · nộp đầu lúc {formatDateTime(card.submittedAt)}</> : <>Nộp lúc {formatDateTime(card.submittedAt)}</>}</p>
        </div>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-brand-100 px-4 py-3 sm:px-6">
        <button type="button" onClick={() => go(-1)} disabled={safeIndex === 0} className="btn-ghost !min-h-[52px] !px-5 text-base"><ChevronLeft className="h-5 w-5" aria-hidden /> Bài trước</button>
        {canManage && (
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" aria-pressed={featured} onClick={() => onSetStatus(card.id, featured ? 'approved' : 'featured')}
              className={`btn !min-h-[52px] text-base ${featured ? 'bg-yellow-400 text-ink shadow-soft' : 'border-[1.5px] border-yellow-300 bg-white text-yellow-800 hover:bg-yellow-50'}`}>
              <Star className={`h-5 w-5 ${featured ? 'fill-current' : ''}`} aria-hidden /> {featured ? 'Đã gắn Tiêu biểu' : 'Gắn Tiêu biểu'}
            </button>
            {card.status === 'pending' && (
              <button type="button" onClick={() => onSetStatus(card.id, 'approved')} className="btn !min-h-[52px] bg-emerald-600 text-base text-white hover:bg-emerald-700">
                <CheckCheck className="h-5 w-5" aria-hidden /> Duyệt bài
              </button>
            )}
          </div>
        )}
        <button type="button" onClick={() => go(1)} disabled={safeIndex === total - 1} className="btn-primary !min-h-[52px] !px-5 text-base">Bài sau <ChevronRight className="h-5 w-5" aria-hidden /></button>
      </footer>
    </div>
  );
}
