import { useState } from 'react';
import type { ClipboardEvent, FormEvent } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import type { BoardData, SubmissionCard } from '../types/board';
import { usePostDraft } from '../hooks/usePostDraft';
import type { PostDraft } from '../hooks/usePostDraft';
import { DRIVE_MAX_BYTES, gatewayOf } from '../lib/drive';
import { findByName } from '../lib/boardLogic';
import { checkSubmit, countdown, formatDateTime, taskPhase } from '../lib/lessons';
import { ModalShell } from './ModalShell';
import { AttachmentPicker } from './attach/AttachmentPicker';
import { TaskDocs } from './TaskDocs';
import { RichEditor } from './RichEditor';
import { TaskNote } from './TaskNote';

interface Props {
  board: BoardData;
  /** Danh sách thành viên công khai (tên, tổ / chi bộ, vai trò). */
  roster: { name: string; unit: string; role?: string }[];
  initialName?: string;
  initialTaskId?: string;
  onSubmit: (draft: PostDraft) => Promise<string | null>;
  /** Bài của chính người này (trên trình duyệt này) cho cùng việc, nếu đã nộp. */
  findMine?: (name: string, taskId: string) => SubmissionCard | undefined;
  /** Thay bài đã nộp bằng bản mới thay vì nộp thêm bản thứ hai. */
  onReplace?: (card: SubmissionCard, draft: PostDraft) => Promise<string | null>;
  onClose: () => void;
}

type Errors = Partial<Record<'name' | 'task' | 'evidence' | 'submit', string>>;

/**
 * Form nộp của tổ công tác: chọn đúng tên mình trong danh sách, xem tài liệu của việc, gửi minh chứng (hoặc bấm "Tôi đã đọc").
 * Giờ nộp do máy chủ ghi, người nộp không tự khai. Nộp hộ được: chỉ ghi tên người được nộp hộ.
 */
export function TeamSubmitModal({ board, roster, initialName = '', initialTaskId, onSubmit, findMine, onReplace, onClose }: Props) {
  const rosterOnly = !!board.settings.rosterOnly;
  const { draft, set, addFiles, addLinks, removeFile, removeLink, ingest, attachError } = usePostDraft({
    authorName: findByName(roster, initialName)?.name ?? '', unit: '', title: '', body: '', files: [], links: [], location: null, poll: null,
    taskId: initialTaskId ?? board.tasks[0]?.id ?? '',
  }, gatewayOf(board.settings) ? { maxFile: DRIVE_MAX_BYTES, maxTotal: DRIVE_MAX_BYTES } : undefined);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  /** Đã nộp việc này rồi: hỏi thay bằng bản mới hay thôi, không tự nộp thêm bản thứ hai. */
  const [dup, setDup] = useState<SubmissionCard | null>(null);

  const now = Date.now();
  const task = board.tasks.find((t) => t.id === draft.taskId);
  const ack = !!task?.ackOnly;
  const timing = task ? checkSubmit({ ...task, targetUnits: [] }, '', now) : null;
  const picked = findByName(roster, draft.authorName);

  const pickName = (value: string): void => {
    set('authorName', value);
    const m = findByName(roster, value);
    set('unit', m?.unit || 'Tổ công tác');
  };

  const submit = async (ev: FormEvent): Promise<void> => {
    ev.preventDefault();
    const e: Errors = {};
    if (!draft.authorName.trim()) e.name = 'Hãy chọn tên của bạn.';
    else if (rosterOnly && !picked) e.name = 'Tên này không có trong danh sách. Hãy chọn đúng tên của bạn.';
    if (task && timing && !timing.ok) e.task = timing.reason;
    if (!ack && task?.needsEvidence && draft.files.length + draft.links.length === 0) e.evidence = 'Công việc này cần ảnh hoặc tệp minh chứng. Hãy thêm ít nhất một tệp.';
    setErrors(e);
    if (Object.keys(e).length > 0) { document.getElementById(e.name ? 'ts-name' : e.task ? 'ts-task' : 'ts-evidence')?.focus(); return; }
    const old = findMine?.(draft.authorName, draft.taskId);
    if (old && !dup) { setDup(old); return; }
    setBusy(true);
    if (old && dup && !ack && onReplace) {
      const problem = await onReplace(old, { ...draft, unit: picked?.unit || draft.unit || 'Tổ công tác' });
      if (problem) { setErrors({ submit: problem }); setBusy(false); }
      return;
    }
    const title = task?.label || `Minh chứng của ${draft.authorName.trim()}`;
    const problem = await onSubmit({ ...draft, unit: picked?.unit || draft.unit || 'Tổ công tác', title, body: ack ? 'Đã đọc' : draft.body });
    if (problem) { setErrors({ submit: problem }); setBusy(false); }
  };

  const onPaste = (e: ClipboardEvent<HTMLElement>): void => {
    const files = Array.from(e.clipboardData.files);
    if (files.length > 0 && !ack) { e.preventDefault(); ingest(files, ''); }
  };

  const lbl = 'field-label';
  return (
    <ModalShell title={ack ? 'Xác nhận đã đọc' : 'Nộp minh chứng'} onClose={onClose} onPaste={onPaste} maxWidth={ack ? 'max-w-2xl' : 'max-w-5xl'}>
      <form onSubmit={(e) => void submit(e)} noValidate className={`grid grid-cols-1 gap-x-7 gap-y-3 ${ack ? '' : 'lg:grid-cols-2'}`}>
        <div className="space-y-3">
        <div className={`grid grid-cols-1 gap-3 ${board.tasks.length > 1 ? 'sm:grid-cols-2' : ''}`}>
          <div>
            <label htmlFor="ts-name" className={lbl}>Bạn là ai? *</label>
            {rosterOnly || roster.length > 0 ? (
              <select id="ts-name" className="input" value={picked?.name ?? ''} onChange={(e) => pickName(e.target.value)} aria-invalid={!!errors.name}>
                <option value="">Chọn tên của bạn…</option>
                {roster.map((m) => <option key={m.name + m.unit} value={m.name}>{m.name}{m.role ? ` · ${m.role}` : ''}</option>)}
              </select>
            ) : (
              <input id="ts-name" className="input" value={draft.authorName} onChange={(e) => pickName(e.target.value)} placeholder="Họ và tên" aria-invalid={!!errors.name} />
            )}
            {roster.length === 0 && rosterOnly && <p className="mt-1 text-xs font-bold text-amber-800">Tổ trưởng chưa nhập danh sách thành viên nên chưa ai nộp được.</p>}
            {errors.name && <p className="mt-1 text-xs font-bold text-rose-700" role="alert">{errors.name}</p>}
            <p className="mt-1 text-xs text-ink-2">Nộp giúp đồng nghiệp: chọn tên của người đó.</p>
          </div>
          {board.tasks.length > 1 && (
            <div>
              <label htmlFor="ts-task" className={lbl}>Công việc</label>
              <select id="ts-task" className="input" value={draft.taskId} onChange={(e) => set('taskId', e.target.value)} aria-invalid={!!errors.task}>
                {board.tasks.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
          )}
        </div>

        {task && (
          <div className="space-y-1.5 rounded-2xl bg-brand-50/70 p-3 text-sm" aria-live="polite">
            <p className="text-base font-extrabold text-ink">{task.label}</p>
            {task.instructions && <TaskNote text={task.instructions} className="text-ink" />}
            <TaskDocs task={task} className="" />
            {task.dueAt && <p className="text-xs text-ink-2">Hạn: <b>{formatDateTime(task.dueAt)}</b> ({countdown(task.dueAt, now)})</p>}
            {timing && !timing.ok && <p className="text-xs font-bold text-rose-700">{timing.reason}</p>}
            {timing?.ok && timing.late && <p className="text-xs font-bold text-amber-800">Đã quá hạn: bài nộp sẽ được ghi là “Nộp muộn”.</p>}
            {task && taskPhase(task, now) === 'soon' && <p className="text-xs font-bold text-amber-800">Sắp hết hạn, hãy nộp sớm.</p>}
          </div>
        )}
        {errors.task && <p className="text-sm font-bold text-rose-700" role="alert">{errors.task}</p>}
        </div>

        <div className="space-y-3">
        {!ack && (
          <>
            <div id="ts-evidence" tabIndex={-1}>
              <AttachmentPicker files={draft.files} links={draft.links} poll={null} location={null} onLocation={() => undefined} error={attachError || errors.evidence || ''}
                onAddFiles={addFiles} onRemoveFile={removeFile} onAddLinks={addLinks} onRemoveLink={removeLink}
                onPoll={() => undefined} onIngest={ingest} hideTools={['video', 'audio', 'screen', 'draw', 'mindmap', 'poll', 'location']} label="Minh chứng" required={!!task?.needsEvidence} />
            </div>
            <div>
              <span id="ts-body-label" className={`${lbl} block`}>Ghi chú <span className="font-normal text-ink-2">(không bắt buộc)</span></span>
              <RichEditor labelledBy="ts-body-label" value={draft.body} onChange={(v) => set('body', v)} minHeight={72} />
            </div>
          </>
        )}
        {dup && (
          <div className={`rounded-2xl border-[1.5px] border-amber-300 bg-amber-50 p-3 text-sm ${ack ? '' : 'lg:col-span-2'}`} role="alertdialog" aria-label="Đã nộp việc này rồi">
            <p className="font-extrabold text-amber-900">{ack ? 'Bạn đã xác nhận đã đọc việc này rồi.' : `Bạn đã nộp việc này lúc ${formatDateTime(dup.submittedAt)}.`}</p>
            <p className="mt-1 text-amber-900">{ack ? 'Không cần bấm lại.' : 'Muốn gửi bản mới thì bản cũ sẽ được thay thế (không nộp thêm bản thứ hai).'}</p>
            <div className="mt-2 flex gap-2">
              {!ack && <button type="submit" disabled={busy} className="btn-primary btn-sm">{busy ? 'Đang thay…' : 'Thay bằng bản mới'}</button>}
              <button type="button" onClick={onClose} className="btn-ghost btn-sm">{ack ? 'Đã hiểu' : 'Giữ bản cũ'}</button>
            </div>
          </div>
        )}
        {errors.submit && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700" role="alert">{errors.submit}</p>}
        <p className="text-xs text-ink-2">Giờ nộp do hệ thống tự ghi. Sau khi nộp bạn nhận cách sửa lại bài (không cần tài khoản).</p>
        </div>

        <div className={`sticky bottom-0 z-10 -mx-5 -mb-5 flex justify-end gap-2 border-t border-brand-100 bg-white/95 px-5 py-3 backdrop-blur max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:static ${ack ? '' : 'lg:col-span-2'} lg:m-0 lg:border-0 lg:bg-transparent lg:p-0 lg:pt-1`}>
          <button type="button" onClick={onClose} className="btn-ghost">Hủy</button>
          <button type="submit" disabled={busy} className="btn-primary">
            {ack ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />} {busy ? 'Đang gửi…' : ack ? 'Tôi đã đọc' : 'Nộp minh chứng'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
