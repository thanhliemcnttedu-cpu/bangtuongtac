import { useState } from 'react';
import type { FormEvent } from 'react';
import type { BoardMode, Lesson } from '../types/board';
import type { LessonInput } from '../lib/boardApi';
import { fromLocalInput, toLocalInput, wordsFor } from '../lib/lessons';
import { ModalShell } from './ModalShell';

interface Props {
  mode: BoardMode;
  /** Có = đang sửa; không = thêm mới. */
  lesson?: Lesson;
  onSave: (input: LessonInput) => Promise<void>;
  onClose: () => void;
}

/** Thêm / sửa một bài học (lớp học) hoặc buổi tập huấn, có thể ghi thời gian diễn ra. */
export function LessonModal({ mode, lesson, onSave, onClose }: Props) {
  const w = wordsFor(mode);
  const [title, setTitle] = useState(lesson?.title ?? '');
  const [description, setDescription] = useState(lesson?.description ?? '');
  const [starts, setStarts] = useState(toLocalInput(lesson?.startsAt));
  const [ends, setEnds] = useState(toLocalInput(lesson?.endsAt));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!title.trim()) { setError(`Hãy nhập tên ${w.lessonLower}.`); document.getElementById('ls-title')?.focus(); return; }
    setBusy(true);
    try { await onSave({ title, description, startsAt: fromLocalInput(starts), endsAt: fromLocalInput(ends) }); }
    catch (err) { setError(err instanceof Error ? err.message : 'Không lưu được.'); setBusy(false); }
  };

  return (
    <ModalShell title={lesson ? `Sửa ${w.lessonLower}` : `Thêm ${w.lessonLower}`} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} noValidate className="space-y-3">
        <div>
          <label htmlFor="ls-title" className="field-label">Tên {w.lessonLower} *</label>
          <input id="ls-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
            placeholder={mode === 'classroom' ? 'Ví dụ: Bài 3 · Em yêu thiên nhiên' : 'Ví dụ: Buổi 1 · Thiết kế kế hoạch bài dạy'} />
        </div>
        <div>
          <label htmlFor="ls-desc" className="field-label">Nội dung / mục tiêu <span className="font-normal text-ink-2">(không bắt buộc)</span></label>
          <textarea id="ls-desc" className="input min-h-[80px] py-2" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="ls-from" className="field-label">Bắt đầu</label>
            <input id="ls-from" type="datetime-local" className="input" value={starts} onChange={(e) => setStarts(e.target.value)} />
          </div>
          <div>
            <label htmlFor="ls-to" className="field-label">Kết thúc</label>
            <input id="ls-to" type="datetime-local" className="input" value={ends} onChange={(e) => setEnds(e.target.value)} />
          </div>
        </div>
        {error && <p role="alert" className="text-sm font-bold text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Hủy</button>
          <button type="submit" disabled={busy} className="btn-primary">{busy ? 'Đang lưu…' : lesson ? 'Lưu thay đổi' : `Thêm ${w.lessonLower}`}</button>
        </div>
      </form>
    </ModalShell>
  );
}
