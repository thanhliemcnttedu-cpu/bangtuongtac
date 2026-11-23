import { useState } from 'react';
import type { FormEvent } from 'react';
import type { BoardData } from '../types/board';
import type { DuplicateOptions } from '../hooks/useBoardStore';
import { ModalShell } from './ModalShell';

interface Props {
  board: BoardData;
  onDuplicate: (opts: DuplicateOptions) => Promise<void>;
  onClose: () => void;
}

/** Nhân bản cấu trúc bảng để dùng cho lớp/buổi khác. Không chép bài nộp. */
export function DuplicateBoardModal({ board, onDuplicate, onClose }: Props) {
  const [title, setTitle] = useState(`${board.title} (bản sao)`);
  const [keepPinned, setKeepPinned] = useState(true);
  const [keepRoster, setKeepRoster] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!title.trim()) { setError('Vui lòng đặt tên cho bảng mới.'); return; }
    setBusy(true);
    setError('');
    try { await onDuplicate({ title: title.trim(), keepPinned, keepRoster }); } catch (err) { setError(err instanceof Error ? err.message : 'Không nhân bản được.'); setBusy(false); }
  };

  return (
    <ModalShell title="Nhân bản bảng" onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} noValidate className="space-y-3">
        <div>
          <label htmlFor="db-title" className="field-label">Tên bảng mới *</label>
          <input id="db-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <p className="rounded-xl bg-brand-50 px-3 py-2 text-xs text-ink-2">Luôn chép: kiểu bảng, lời dẫn, cài đặt giao diện và {board.tasks.length} nhiệm vụ. <b>Không chép bài nộp</b>; link chia sẻ của bảng mới là link mới.</p>
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span><span className="block text-sm font-bold">Giữ tài liệu ghim</span><span className="block text-xs text-ink-2">{board.pinned.length} tài liệu</span></span>
          <input type="checkbox" role="switch" checked={keepPinned} onChange={(e) => setKeepPinned(e.target.checked)} className="h-5 w-5 accent-brand-600" />
        </label>
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span><span className="block text-sm font-bold">Giữ danh sách sĩ số</span><span className="block text-xs text-ink-2">{board.roster.length} người (tắt nếu sang lớp khác)</span></span>
          <input type="checkbox" role="switch" checked={keepRoster} onChange={(e) => setKeepRoster(e.target.checked)} className="h-5 w-5 accent-brand-600" />
        </label>
        {error && <p role="alert" className="text-sm font-bold text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Hủy</button>
          <button type="submit" disabled={busy} className="btn-primary">{busy ? 'Đang nhân bản…' : 'Nhân bản'}</button>
        </div>
      </form>
    </ModalShell>
  );
}
