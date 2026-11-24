import { DRIVE_MAX_BYTES, gatewayOf } from '../lib/drive';
import { useState } from 'react';
import type { ClipboardEvent, FormEvent } from 'react';
import { Send } from 'lucide-react';
import type { BoardData } from '../types/board';
import { usePostDraft } from '../hooks/usePostDraft';
import type { PostDraft } from '../hooks/usePostDraft';
import { ModalShell } from './ModalShell';
import { AttachmentPicker } from './attach/AttachmentPicker';
import { RichEditor } from './RichEditor';
import { classPart, normalize } from '../lib/boardLogic';
import { checkSubmit, countdown, formatDateTime, groupTasks, taskPhase } from '../lib/lessons';

export type { PostDraft };

interface Props {
  board: BoardData;
  /** Tên đã dùng lần trước (lưu localStorage) để người nộp không phải gõ lại. */
  initialName?: string;
  initialUnit?: string;
  /** Bài tập chọn sẵn (khi bấm "Nộp bài" ở một bài tập). */
  initialTaskId?: string;
  /** Tên trong danh sách lớp: học sinh chọn tên thay vì gõ tay, tổ/lớp tự điền. */
  roster?: { name: string; unit: string }[];
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
export function QuickPostModal({ board, initialName = '', initialUnit = '', initialTaskId, roster = [], onSubmit, onClose }: Props) {
  const isClass = board.mode === 'classroom';
  const { draft, set, addFiles, addLinks, removeFile, removeLink, ingest, attachError } = usePostDraft({
    authorName: initialName, unit: initialUnit, title: '', body: '', files: [], links: [], location: null, poll: null,
    taskId: initialTaskId ?? board.tasks.find((t) => checkSubmit(t, '', Date.now()).ok || (t.targetUnits ?? []).length > 0)?.id ?? board.tasks[0]?.id ?? '',
  }, gatewayOf(board.settings) ? { maxFile: DRIVE_MAX_BYTES, maxTotal: DRIVE_MAX_BYTES } : undefined); // có cổng Drive: tệp tới 1 GB
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const now = Date.now();
  const picked = roster.find((m) => normalize(m.name) === normalize(draft.authorName));
  const nameUnknown = roster.length > 0 && draft.authorName.trim().length > 1 && !picked;
  const pickName = (value: string): void => {
    set('authorName', value);
    const same = roster.filter((x) => normalize(x.name) === normalize(value));
    // Chỉ tự điền khi tên này là duy nhất; trùng tên ở nhiều lớp thì để em chọn lớp.
    if (same.length === 1 && same[0].unit) set('unit', same[0].unit);
  };
  const task = board.tasks.find((t) => t.id === draft.taskId);
  const targets = task?.targetUnits ?? [];
  const isGrade = isClass && board.settings.scope === 'grade';
  // Bảng cả khối: lớp và tổ nhập riêng, ghép thành "Lớp 4A – Tổ 2".
  const unitParts = draft.unit.split(/\s[–-]\s/);
  const lop = unitParts[0] ?? '';
  const to = unitParts.slice(1).join(' – ');
  const setUnitParts = (l: string, t: string): void => set('unit', t.trim() && l.trim() ? `${l.trim()} – ${t.trim()}` : l);
  const classChoices = isGrade ? (targets.length > 0 ? targets : [...new Set(roster.map((m) => classPart(m.unit)).filter(Boolean))]) : [];
  const rosterShown = isGrade && lop.trim() ? roster.filter((m) => normalize(classPart(m.unit)) === normalize(lop)) : roster;
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
    // Học sinh nhỏ không bắt buộc đặt tên bài: để trống thì lấy tên bài tập. Giáo viên tập huấn và thăm dò vẫn cần tiêu đề.
    if (!draft.title.trim() && (draft.poll || !isClass)) e.title = draft.poll ? 'Thăm dò cần có câu hỏi.' : 'Vui lòng nhập tiêu đề sản phẩm.';
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
    const problem = await onSubmit(draft.title.trim() ? draft : { ...draft, title: task?.label || `Bài của ${draft.authorName.trim()}` });
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

  const inp = isClass ? 'input !min-h-[54px] !text-base' : 'input';
  const lbl = isClass ? 'field-label !text-base' : 'field-label';
  const mark = (id: keyof Errors) => ({ 'aria-invalid': !!errors[id], 'aria-describedby': errors[id] ? `qp-${id}-err` : undefined });

  return (
    <ModalShell title={isClass ? 'Nộp bài của em' : 'Nộp sản phẩm tập huấn'} onClose={onClose} onPaste={onPaste} maxWidth={isClass ? 'max-w-5xl' : 'max-w-4xl'}>
      <form onSubmit={(e) => void submit(e)} noValidate className="grid grid-cols-1 gap-x-7 gap-y-3 lg:grid-cols-2">
        {/* Cột trái: em là ai, nộp bài nào. Cột phải: đính kèm. Máy tính và máy tính bảng vừa một màn hình, không phải cuộn. */}
        <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className={isGrade ? 'order-3 sm:col-span-2' : undefined}>
          <label htmlFor="qp-name" className={lbl}>{isClass ? 'Em tên là gì? *' : 'Họ tên giáo viên *'}</label>
          <input id="qp-name" className={inp} value={draft.authorName} onChange={(e) => pickName(e.target.value)} list={roster.length > 0 ? 'qp-roster' : undefined}
            {...mark('authorName')} autoComplete={roster.length > 0 ? 'off' : 'name'} placeholder={isClass ? 'Ví dụ: Nguyễn Gia Bảo' : 'Ví dụ: Nguyễn Thị Hằng'} />
          {roster.length > 0 && <datalist id="qp-roster">{rosterShown.map((m) => <option key={m.name + m.unit} value={m.name}>{m.unit}</option>)}</datalist>}
          {nameUnknown && <p className="mt-1 text-xs font-bold text-amber-800">{isClass ? 'Em chưa thấy tên trong danh sách lớp. Em bấm vào ô và chọn đúng tên của em để cô ghi nhận bài nhé.' : 'Chưa thấy tên trong danh sách. Hãy chọn đúng tên trong gợi ý để được ghi nhận.'}</p>}
          {errors.authorName && <p id="qp-authorName-err" className="mt-1 text-xs font-bold text-rose-700" role="alert">{errors.authorName}</p>}
        </div>
        {isGrade ? (
          <>
            <div className="order-1">
              <label htmlFor="qp-unit" className={lbl}>Em học lớp nào? *</label>
              {classChoices.length > 0 ? (
                <select id="qp-unit" className={inp} value={lop} onChange={(e) => setUnitParts(e.target.value, to)} {...mark('unit')}>
                  <option value="">Chọn lớp của em…</option>
                  {classChoices.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              ) : (
                <input id="qp-unit" className={inp} value={lop} onChange={(e) => setUnitParts(e.target.value, to)} {...mark('unit')} placeholder="Ví dụ: Lớp 4A" />
              )}
              {errors.unit && <p id="qp-unit-err" className="mt-1 text-xs font-bold text-rose-700" role="alert">{errors.unit}</p>}
            </div>
            <div className="order-2">
              <label htmlFor="qp-group" className={lbl}>Em ở tổ nào? <span className="font-normal text-ink-2">(nếu có)</span></label>
              <input id="qp-group" className={inp} value={to} onChange={(e) => setUnitParts(lop, e.target.value)} placeholder="Ví dụ: Tổ 2" />
            </div>
          </>
        ) : (
        <div>
          <label htmlFor="qp-unit" className={lbl}>{isClass ? (board.settings.scope === 'grade' ? 'Em học lớp nào? *' : 'Em học tổ nào? *') : 'Trường / Đơn vị *'}</label>
          {targets.length > 0 ? (
            <select id="qp-unit" className={inp} value={draft.unit} onChange={(e) => set('unit', e.target.value)} {...mark('unit')}>
              <option value="">{isClass ? 'Chọn tổ / nhóm được giao…' : 'Chọn đơn vị được giao…'}</option>
              {targets.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          ) : (
            <input id="qp-unit" className={inp} value={draft.unit} onChange={(e) => set('unit', e.target.value)}
              {...mark('unit')} placeholder={isClass ? (board.settings.scope === 'grade' ? 'Ví dụ: Lớp 4A – Tổ 2' : 'Ví dụ: Tổ 2 – Lớp 4A') : 'Ví dụ: TH Kim Đồng'} />
          )}
          {errors.unit && <p id="qp-unit-err" className="mt-1 text-xs font-bold text-rose-700" role="alert">{errors.unit}</p>}
        </div>
        )}
        </div>
        <div className={`grid grid-cols-1 gap-3 ${board.tasks.length > 0 ? 'sm:grid-cols-2' : ''}`}>
          {board.tasks.length > 0 && <div>
            <label htmlFor="qp-task" className={lbl}>{isClass ? 'Em nộp bài nào?' : 'Chủ đề / Nhiệm vụ'}</label>
            <select id="qp-task" className={inp} value={draft.taskId} onChange={(e) => pickTask(e.target.value)} {...mark('task')}>
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
            <label htmlFor="qp-title" className={lbl}>{draft.poll ? 'Câu hỏi thăm dò *' : isClass ? <>Đặt tên cho bài <span className="font-normal text-ink-2">(không bắt buộc)</span></> : 'Tiêu đề sản phẩm *'}</label>
            <input id="qp-title" className={inp} value={draft.title} onChange={(e) => set('title', e.target.value)}
              {...mark('title')} placeholder={draft.poll ? 'Em thích hoạt động nào nhất?' : isClass && task ? task.label : 'Tên bài của bạn'} />
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
          <span id="qp-body-label" className={`${lbl} block`}>{isClass ? 'Em muốn viết thêm gì không?' : 'Nội dung'} <span className="font-normal text-ink-2">(không bắt buộc)</span></span>
          <RichEditor labelledBy="qp-body-label" value={draft.body} onChange={(v) => set('body', v)} placeholder="Viết hoặc dán nội dung bài nộp…" minHeight={isClass ? 110 : 96} large={isClass} />
        </div>

        </div>

        <div className="space-y-3">
        <AttachmentPicker files={draft.files} links={draft.links} poll={draft.poll} location={draft.location} onLocation={(l) => set('location', l)} error={attachError}
          onAddFiles={addFiles} onRemoveFile={removeFile} onAddLinks={addLinks} onRemoveLink={removeLink}
          onPoll={(p) => set('poll', p)} onIngest={ingest} />

        {board.settings.moderation === 'manual' && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">Bài sẽ hiện công khai sau khi {isClass ? 'giáo viên' : 'giảng viên'} duyệt.</p>
        )}
        {board.settings.moderation === 'auto' && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">Hệ thống sẽ kiểm tra bài của bạn. Bài phù hợp hiện ngay; nếu cần xem lại, {isClass ? 'giáo viên' : 'giảng viên'} sẽ duyệt.</p>
        )}
        <p className="text-xs text-ink-2">Sau khi nộp, bạn nhận một mã sửa bài (không cần tài khoản): giữ mã để sửa hoặc xóa bài về sau.</p>
        {errors.submit && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700" role="alert">{errors.submit}</p>}

        </div>

        {/* Trên điện thoại nút Nộp bài dính ở đáy hộp: em không phải cuộn xuống tận cuối mới tìm thấy. */}
        <div className="sticky bottom-0 z-10 -mx-5 -mb-5 flex justify-end gap-2 border-t border-brand-100 bg-white/95 px-5 py-3 backdrop-blur max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:static lg:col-span-2 lg:m-0 lg:border-0 lg:bg-transparent lg:p-0 lg:pt-1">
          <button type="button" onClick={onClose} className={isClass ? 'btn-ghost !min-h-[54px] !px-6 text-base' : 'btn-ghost'}>Hủy</button>
          <button type="submit" disabled={busy} className={isClass ? 'btn-primary !min-h-[54px] !px-8 text-lg' : 'btn-primary'}><Send className="h-4 w-4" aria-hidden /> {busy ? 'Đang gửi…' : 'Nộp bài'}</button>
        </div>
      </form>
    </ModalShell>
  );
}
