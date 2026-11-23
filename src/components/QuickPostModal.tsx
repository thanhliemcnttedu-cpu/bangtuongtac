import { useState } from 'react';
import type { ClipboardEvent, FormEvent } from 'react';
import { Send } from 'lucide-react';
import type { BoardData } from '../types/board';
import { usePostDraft } from '../hooks/usePostDraft';
import type { PostDraft } from '../hooks/usePostDraft';
import { ModalShell } from './ModalShell';
import { AttachmentPicker } from './attach/AttachmentPicker';
import { checkSubmit, countdown, formatDateTime, groupTasks, taskPhase } from '../lib/lessons';

export type { PostDraft };

interface Props {
  board: BoardData;
  /** Tên đã dùng lần trước (lưu localStorage) để người nộp không phải gõ lại. */
  initialName?: string;
  initialUnit?: string;
  /** Bài tập chọn sẵn (khi bấm "Nộp bài" ở một bài tập). */
  initialTaskId?: string;
  /** Trả về lỗi (nếu có) để form hiện ngay tại chỗ; thành công thì App tự đóng hộp thoại. */
  onSubmit: (draft: PostDraft) => Promise<string | null>;
  onClose: () => void;
}

type Errors = Partial<Record<'authorName' | 'unit' | 'title' | 'task' | 'submit', string>>;

const isEditable = (el: EventTarget | null): boolean => el instanceof HTMLElement && el.matches('input, textarea, select, [contenteditable="true"]');

/**
 * Form bấm nút "+": không cần đăng nhập.
 * Bắt buộc: họ tên/nhóm, tổ/lớp (hoặc trường/đơn vị), tiêu đề. Nội dung và đính kèm không bắt buộc.
 */
export function QuickPostModal({ board, initialName = '', initialUnit = '', initialTaskId, onSubmit, onClose }: Props) {
  const isClass = board.mode === 'classroom';
  const { draft, set, addFiles, addLinks, removeFile, removeLink, ingest, attachError } = usePostDraft({
    authorName: initialName, unit: initialUnit, title: '', body: '', files: [], links: [], location: null, poll: null,
    taskId: initialTaskId ?? board.tasks.find((t) => checkSubmit(t, '', Date.now()).ok || (t.targetUnits ?? []).length > 0)?.id ?? board.tasks[0]?.id ?? '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const now = Date.now();
  const task = board.tasks.find((t) => t.id === draft.taskId);
  const targets = task?.targetUnits ?? [];
  // Giờ giao / hạn nộp báo ngay khi chọn bài tập (không tính đối tượng, vì đối tượng đã có ô chọn riêng).
  const timing = task ? checkSubmit({ ...task, targetUnits: [] }, '', now) : null;

  const pickTask = (id: string): void => {
    set('taskId', id);
    const next = board.tasks.find((t) => t.id === id);
    const list = next?.targetUnits ?? [];
    if (list.length > 0 && !list.some((u) => u.toLowerCase() === draft.unit.trim().toLowerCase())) set('unit', '');
  };

  const validate = (): Errors => {
    const e: Errors = {};
    if (task) {
      const check = checkSubmit(task, draft.unit, now);
      if (!check.ok) { if (timing && !timing.ok) e.task = check.reason; else e.unit = check.reason; }
    }
    if (!draft.authorName.trim()) e.authorName = isClass ? 'Vui lòng nhập họ tên hoặc tên nhóm.' : 'Vui lòng nhập họ tên giáo viên.';
    if (!draft.unit.trim()) e.unit = isClass ? 'Vui lòng nhập tổ / lớp.' : 'Vui lòng nhập trường / đơn vị.';
    if (!draft.title.trim()) e.title = draft.poll ? 'Thăm dò cần có câu hỏi.' : 'Vui lòng nhập tiêu đề sản phẩm.';
    return e;
  };

  const submit = async (ev: FormEvent): Promise<void> => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) {
      // Đưa người dùng tới ô lỗi đầu tiên.
      const first = e.authorName ? 'qp-name' : e.task ? 'qp-task' : e.unit ? 'qp-unit' : 'qp-title';
      document.getElementById(first)?.focus();
      return;
    }
    setBusy(true);
    const problem = await onSubmit(draft);
    if (problem) { setErrors({ submit: problem }); setBusy(false); }
  };

  /**
   * Dán (Ctrl+V) ở bất cứ đâu trong form: ảnh/tệp luôn thành đính kèm. Văn bản: nếu đang gõ trong một ô thì dán
   * bình thường; nếu con trỏ không ở ô nhập thì liên kết thành đính kèm, đoạn văn thêm vào Nội dung.
   */
  const onPaste = (e: ClipboardEvent<HTMLElement>): void => {
    const files = Array.from(e.clipboardData.files);
    const text = e.clipboardData.getData('text/plain');
    if (files.length > 0) { e.preventDefault(); ingest(files, ''); return; }
    if (!isEditable(e.target) && text) { e.preventDefault(); ingest([], text); }
  };

  const mark = (id: keyof Errors) => ({ 'aria-invalid': !!errors[id], 'aria-describedby': errors[id] ? `qp-${id}-err` : undefined });

  return (
    <ModalShell title={isClass ? 'Nộp bài của em' : 'Nộp sản phẩm tập huấn'} onClose={onClose} onPaste={onPaste}>
      <form onSubmit={(e) => void submit(e)} noValidate className="space-y-3">
        <div>
          <label htmlFor="qp-name" className="field-label">{isClass ? 'Họ tên / Nhóm *' : 'Họ tên giáo viên *'}</label>
          <input id="qp-name" className="input" value={draft.authorName} onChange={(e) => set('authorName', e.target.value)}
            {...mark('authorName')} autoComplete="name" placeholder={isClass ? 'Ví dụ: Nguyễn Gia Bảo' : 'Ví dụ: Nguyễn Thị Hằng'} />
          {errors.authorName && <p id="qp-authorName-err" className="mt-1 text-xs font-bold text-rose-700" role="alert">{errors.authorName}</p>}
        </div>
        <div>
          <label htmlFor="qp-unit" className="field-label">{isClass ? 'Tổ / Lớp *' : 'Trường / Đơn vị *'}</label>
          {targets.length > 0 ? (
            <select id="qp-unit" className="input" value={draft.unit} onChange={(e) => set('unit', e.target.value)} {...mark('unit')}>
              <option value="">{isClass ? 'Chọn tổ / nhóm được giao…' : 'Chọn đơn vị được giao…'}</option>
              {targets.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          ) : (
            <input id="qp-unit" className="input" value={draft.unit} onChange={(e) => set('unit', e.target.value)}
              {...mark('unit')} placeholder={isClass ? 'Ví dụ: Tổ 2 – Lớp 4A' : 'Ví dụ: TH Kim Đồng'} />
          )}
          {errors.unit && <p id="qp-unit-err" className="mt-1 text-xs font-bold text-rose-700" role="alert">{errors.unit}</p>}
        </div>
        <div className={`grid grid-cols-1 gap-3 ${board.tasks.length > 0 ? 'sm:grid-cols-2' : ''}`}>
          {board.tasks.length > 0 && <div>
            <label htmlFor="qp-task" className="field-label">{isClass ? 'Nhiệm vụ' : 'Chủ đề / Nhiệm vụ'}</label>
            <select id="qp-task" className="input" value={draft.taskId} onChange={(e) => pickTask(e.target.value)} {...mark('task')}>
              {groupTasks(board.lessons, board.tasks).filter((g) => g.tasks.length > 0).map(({ lesson, tasks }) => (
                lesson ? (
                  <optgroup key={lesson.id} label={lesson.title}>
                    {tasks.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </optgroup>
                ) : tasks.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)
              ))}
            </select>
            {errors.task && <p id="qp-task-err" className="mt-1 text-xs font-bold text-rose-700" role="alert">{errors.task}</p>}
          </div>}
          <div>
            <label htmlFor="qp-title" className="field-label">{draft.poll ? 'Câu hỏi thăm dò *' : 'Tiêu đề sản phẩm *'}</label>
            <input id="qp-title" className="input" value={draft.title} onChange={(e) => set('title', e.target.value)}
              {...mark('title')} placeholder={draft.poll ? 'Em thích hoạt động nào nhất?' : 'Tên bài của bạn'} />
            {errors.title && <p id="qp-title-err" className="mt-1 text-xs font-bold text-rose-700" role="alert">{errors.title}</p>}
          </div>
        </div>
        {task && (task.instructions || task.dueAt || timing) && (
          <div className="space-y-1 rounded-2xl bg-brand-50/70 p-3 text-xs text-ink-2" aria-live="polite">
            {task.instructions && <p className="text-sm text-ink">{task.instructions}</p>}
            {task.dueAt && <p>Hạn nộp: <b>{formatDateTime(task.dueAt)}</b> ({countdown(task.dueAt, now)})</p>}
            {timing && !timing.ok && <p className="font-bold text-rose-700">{timing.reason}</p>}
            {timing?.ok && timing.late && <p className="font-bold text-amber-800">Đã quá hạn: bài của bạn sẽ được đánh dấu “Nộp muộn”.</p>}
            {taskPhase(task, now) === 'soon' && <p className="font-bold text-amber-800">Sắp hết hạn, hãy nộp sớm nhé.</p>}
          </div>
        )}
        <div>
          <label htmlFor="qp-body" className="field-label">Nội dung <span className="font-normal text-ink-2">(không bắt buộc)</span></label>
          <textarea id="qp-body" className="input min-h-[88px] py-2" value={draft.body} onChange={(e) => set('body', e.target.value)}
            placeholder="Viết hoặc dán nội dung bài nộp…" />
        </div>

        <AttachmentPicker files={draft.files} links={draft.links} poll={draft.poll} location={draft.location} onLocation={(l) => set('location', l)} error={attachError}
          onAddFiles={addFiles} onRemoveFile={removeFile} onAddLinks={addLinks} onRemoveLink={removeLink}
          onPoll={(p) => set('poll', p)} onIngest={ingest} />

        {board.settings.moderation === 'manual' && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">Bài sẽ hiện công khai sau khi giáo viên duyệt.</p>
        )}
        {board.settings.moderation === 'auto' && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">Hệ thống sẽ kiểm tra bài của bạn. Bài phù hợp hiện ngay; nếu cần xem lại, giáo viên sẽ duyệt.</p>
        )}
        <p className="text-xs text-ink-2">Bạn có thể xóa bài vừa nộp trong 15 phút đầu, không cần tài khoản.</p>
        {errors.submit && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700" role="alert">{errors.submit}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost">Hủy</button>
          <button type="submit" disabled={busy} className="btn-primary"><Send className="h-4 w-4" aria-hidden /> {busy ? 'Đang gửi…' : 'Nộp bài'}</button>
        </div>
      </form>
    </ModalShell>
  );
}
