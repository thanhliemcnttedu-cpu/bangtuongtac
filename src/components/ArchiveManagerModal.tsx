import { useState } from 'react';
import { ArchiveRestore, Eye, RotateCcw, Trash2 } from 'lucide-react';
import type { BoardData } from '../types/board';
import { formatDateTime } from '../lib/format';
import { ConfirmModal } from './ConfirmModal';
import { ModalShell } from './ModalShell';

const TRASH_DAYS = 30;
const DAY = 86_400_000;

interface Props {
  boards: BoardData[];
  onOpen: (id: string) => void;
  onReopen: (id: string) => Promise<void>;
  onRestore: (id: string) => Promise<void>;
  onDeleteForever: (id: string) => Promise<void>;
  onClose: () => void;
}

/** Kho bảng: bảng đã đóng (mở lại được) và thùng rác (khôi phục trong 30 ngày, sau đó tự xóa). */
export function ArchiveManagerModal({ boards, onOpen, onReopen, onRestore, onDeleteForever, onClose }: Props) {
  const archived = boards.filter((b) => b.archivedAt && !b.deletedAt);
  const trashed = boards.filter((b) => b.deletedAt);
  const [tab, setTab] = useState<'archived' | 'trash'>(archived.length === 0 && trashed.length > 0 ? 'trash' : 'archived');
  const [confirm, setConfirm] = useState<BoardData | null>(null);
  const [error, setError] = useState('');
  const list = tab === 'archived' ? archived : trashed;

  const act = async (fn: () => Promise<void>): Promise<void> => {
    setError('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Thao tác không thành công.'); }
  };

  return (
    <ModalShell title="Bảng đã đóng & thùng rác" onClose={onClose} maxWidth="max-w-xl">
      <div role="tablist" className="mb-3 grid grid-cols-2 gap-1 rounded-full bg-brand-50 p-1">
        {([['archived', `Đã đóng (${archived.length})`], ['trash', `Thùng rác (${trashed.length})`]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`btn btn-sm !min-h-[40px] ${tab === id ? 'bg-white text-brand-700 shadow-soft' : 'text-ink-2'}`}>{label}</button>
        ))}
      </div>

      {tab === 'trash' && <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">Bảng trong thùng rác tự động xóa vĩnh viễn sau {TRASH_DAYS} ngày. Link chia sẻ của bảng ngừng hoạt động trong thời gian này.</p>}
      {error && <p role="alert" className="mb-2 text-sm font-bold text-rose-700">{error}</p>}

      {list.length === 0 ? (
        <p className="py-8 text-center text-ink-2">{tab === 'archived' ? 'Chưa có bảng nào đã đóng.' : 'Thùng rác trống.'}</p>
      ) : (
        <ul className="space-y-2">
          {list.map((b) => {
            const left = b.deletedAt ? Math.max(0, TRASH_DAYS - Math.floor((Date.now() - new Date(b.deletedAt).getTime()) / DAY)) : 0;
            return (
              <li key={b.id} className="rounded-2xl bg-brand-50/60 p-3">
                <p className="font-extrabold">{b.title}</p>
                <p className="text-xs text-ink-2">
                  {b.cards.length} bài nộp ·{' '}
                  {tab === 'archived' && b.archivedAt ? `đóng lúc ${formatDateTime(b.archivedAt)}` : `còn ${left} ngày trước khi xóa vĩnh viễn`}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {tab === 'archived' ? (
                    <>
                      <button type="button" onClick={() => { onOpen(b.id); onClose(); }} className="btn-ghost btn-sm"><Eye className="h-3.5 w-3.5" aria-hidden /> Xem</button>
                      <button type="button" onClick={() => void act(() => onReopen(b.id))} className="btn-primary btn-sm"><ArchiveRestore className="h-3.5 w-3.5" aria-hidden /> Mở lại</button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => void act(() => onRestore(b.id))} className="btn-primary btn-sm"><RotateCcw className="h-3.5 w-3.5" aria-hidden /> Khôi phục</button>
                      <button type="button" onClick={() => setConfirm(b)} className="btn btn-sm text-rose-700 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" aria-hidden /> Xóa vĩnh viễn</button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {confirm && (
        <ConfirmModal title="Xóa vĩnh viễn bảng?" confirmLabel="Xóa vĩnh viễn" danger requireText="XÓA" onClose={() => setConfirm(null)}
          onConfirm={async () => { await onDeleteForever(confirm.id); setConfirm(null); }}>
          <p>Bảng <b className="text-ink">“{confirm.title}”</b> cùng {confirm.cards.length} bài nộp, tài liệu và nhật ký sẽ bị xóa hẳn. <b className="text-rose-700">Không thể hoàn tác.</b></p>
        </ConfirmModal>
      )}
    </ModalShell>
  );
}
