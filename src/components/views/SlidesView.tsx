import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize } from 'lucide-react';
import { StatusBadge } from '../StatusBadge';
import { AttachmentView } from '../AttachmentView';
import { AttachmentThumb } from '../AttachmentThumb';
import { PollView } from '../PollView';
import { FeedbackPanel } from '../FeedbackPanel';
import { formatDateTime } from '../../lib/format';
import { EmptyLayout, withCards } from './viewTypes';
import type { LayoutViewProps } from './viewTypes';

/**
 * Thuyết trình: từng bài là một trang chiếu. Danh sách trang bên trái (trên điện thoại: dải ngang),
 * trang đang xem bên phải; ← → để chuyển, nút Toàn màn hình mở chế độ trình chiếu cỡ lớn.
 */
export function SlidesView({ rows, board, onOpen, onVote, feedback }: LayoutViewProps) {
  const items = withCards(rows);
  const [index, setIndex] = useState(0);
  const safe = Math.min(index, Math.max(0, items.length - 1));
  const item = items[safe];

  // Giữ trang đang xem trong tầm mắt khi chuyển bằng phím.
  useEffect(() => {
    document.getElementById(`slide-thumb-${safe}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [safe]);

  if (!item) return <EmptyLayout />;
  const { card } = item;
  const taskLabel = board.tasks.find((t) => t.id === card.taskId)?.label ?? '';
  const media = card.attachments.filter((a) => a.type !== 'link');
  const links = card.attachments.filter((a) => a.type === 'link');
  const go = (d: number): void => setIndex((i) => Math.min(items.length - 1, Math.max(0, i + d)));

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]" tabIndex={0} aria-label="Thuyết trình"
      onKeyDown={(e) => {
        if (e.target instanceof HTMLElement && e.target.matches('input, textarea, select')) return; // đang gõ nhận xét
        if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1);
      }}>
      <ol className="flex gap-2 overflow-x-auto pb-2 lg:max-h-[70vh] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden" aria-label="Danh sách trang chiếu">
        {items.map((r, i) => (
          <li key={r.card.id} id={`slide-thumb-${i}`} className="shrink-0 lg:shrink">
            <button type="button" onClick={() => setIndex(i)} aria-current={i === safe}
              className={`flex w-40 items-center gap-2 rounded-2xl border-2 bg-white p-1.5 text-left transition duration-150 lg:w-full ${i === safe ? 'border-brand-600 shadow-soft' : 'border-brand-100 hover:border-brand-300'}`}>
              <span className="w-8 shrink-0 text-center text-xs font-extrabold text-ink-2">{i + 1}</span>
              <AttachmentThumb attachment={r.card.attachments[0] ?? null} className="h-10 w-14 shrink-0 overflow-hidden rounded-lg" />
              <span className="min-w-0 text-xs font-bold leading-tight"><span className="line-clamp-2">{r.card.title}</span></span>
            </button>
          </li>
        ))}
      </ol>

      <section key={card.id} className="pop-in glass min-w-0 rounded-3xl p-4 sm:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="chip bg-brand-100 text-base text-brand-800 ring-brand-200" aria-live="polite">Trang {safe + 1} / {items.length}</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => go(-1)} disabled={safe === 0} className="btn-ghost btn-sm" aria-label="Trang trước"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => go(1)} disabled={safe === items.length - 1} className="btn-ghost btn-sm" aria-label="Trang sau"><ChevronRight className="h-4 w-4" /></button>
            <button type="button" onClick={() => onOpen(card.id)} className="btn-primary btn-sm"><Maximize className="h-3.5 w-3.5" aria-hidden /> Toàn màn hình</button>
          </div>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <StatusBadge progress={card.status} />
          {taskLabel && <span className="text-sm font-bold text-ink-2">{taskLabel}</span>}
        </div>
        <h2 className="text-[clamp(1.5rem,3vw,2.4rem)] font-extrabold leading-tight tracking-tight">{card.title}</h2>
        <p className="mt-1 text-lg font-extrabold text-brand-700">{card.authorName}{card.unit && <span className="font-bold text-ink-2"> · {card.unit}</span>}</p>
        {card.body && <p className="mt-3 whitespace-pre-line text-lg leading-relaxed">{card.body}</p>}
        {media.length > 0 && <div className="mt-4 space-y-4">{media.map((a, i) => <AttachmentView key={`${a.name}-${i}`} attachment={a} />)}</div>}
        {links.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{links.map((l, i) => <AttachmentView key={`${l.name}-${i}`} attachment={l} />)}</div>}
        {card.poll && onVote && (
          <div className="mt-4 max-w-xl">
            <PollView cardId={card.id} options={card.poll} onVote={onVote} canVote={board.linkMode === 'guest_post' && (card.status === 'approved' || card.status === 'featured')} />
          </div>
        )}
        {feedback && <div className="mt-4"><FeedbackPanel card={card} board={board} fb={feedback} /></div>}
        {!feedback && card.teacherNote && <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-amber-900">Nhận xét của giáo viên: {card.teacherNote}</p>}
        <p className="mt-3 text-sm text-ink-3">Nộp lúc {formatDateTime(card.submittedAt)}</p>
      </section>
    </div>
  );
}
