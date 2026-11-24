import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { CalendarCheck, CalendarPlus, NotebookPen, Type } from 'lucide-react';
import type { BoardMode, Lesson } from '../types/board';
import type { LessonInput } from '../lib/boardApi';
import { fromLocalInput, toLocalInput, wordsFor } from '../lib/lessons';
import { ModalShell } from './ModalShell';
import { RichEditor } from './RichEditor';

interface Props {
  mode: BoardMode;
  /** Có = đang sửa; không = thêm mới. */
  lesson?: Lesson;
  onSave: (input: LessonInput) => Promise<void>;
  onClose: () => void;
}

/** Nhãn ô nhập có chip biểu tượng màu riêng cho từng nhóm thông tin; chữ nhãn đậm cùng tông màu đó. */
function Lbl({ id, icon, tone, children, as = 'label' }: { id: string; icon: ReactNode; tone: string; children: ReactNode; as?: 'label' | 'span' }) {
  const cls = 'mb-1.5 flex items-center gap-2 text-sm font-extrabold';
  const chip = <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tone}`} aria-hidden>{icon}</span>;
  return as === 'label'
    ? <label htmlFor={id} className={`${cls} text-ink`}>{chip}<span>{children}</span></label>
    : <span id={id} className={`${cls} text-ink`}>{chip}<span>{children}</span></span>;
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
    <ModalShell title={lesson ? `Sửa ${w.lessonLower}` : `Thêm ${w.lessonLower}`} onClose={onClose} maxWidth="max-w-4xl" large titleClassName="border-l-[6px] border-brand-600 pl-3 text-brand-800">
      <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
        <div>
          <Lbl id="ls-title" icon={<Type className="h-4 w-4" />} tone="bg-brand-100 text-brand-700">Tên {w.lessonLower} <span className="text-rose-600">*</span></Lbl>
          <input id="ls-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
            placeholder={mode === 'classroom' ? 'Ví dụ: Bài 3 · Em yêu thiên nhiên' : 'Ví dụ: Buổi 1 · Thiết kế kế hoạch bài dạy'} />
        </div>
        <div>
          <Lbl as="span" id="ls-desc-label" icon={<NotebookPen className="h-4 w-4" />} tone="bg-teal2-100 text-teal2-700">Nội dung / mục tiêu <span className="font-semibold text-ink-2">(không bắt buộc)</span></Lbl>
          <RichEditor labelledBy="ls-desc-label" value={description} onChange={setDescription} minHeight={240} maxHeight={460} large placeholder="Viết hoặc nói nội dung, mục tiêu của bài…" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Lbl id="ls-from" icon={<CalendarPlus className="h-4 w-4" />} tone="bg-emerald-100 text-emerald-700">Bắt đầu</Lbl>
            <input id="ls-from" type="datetime-local" className="input" value={starts} onChange={(e) => setStarts(e.target.value)} />
          </div>
          <div>
            <Lbl id="ls-to" icon={<CalendarCheck className="h-4 w-4" />} tone="bg-amber-100 text-amber-700">Kết thúc</Lbl>
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
