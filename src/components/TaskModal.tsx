import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { FileText, Link2, Paperclip, X } from 'lucide-react';
import type { Attachment, BoardData, RepeatRule, TaskItem, TaskKind } from '../types/board';
import { RepeatSelect } from './RepeatSelect';
import { formatSize } from '../lib/media';
import type { TaskInput } from '../lib/boardApi';
import { KIND_LABEL, fromLocalInput, toLocalInput, unitsOf, wordsFor } from '../lib/lessons';
import { ModalShell } from './ModalShell';

interface Props {
  board: BoardData;
  /** Có = đang sửa; không = giao bài mới. */
  task?: TaskItem;
  /** Bài học chọn sẵn khi thêm từ một bài học. */
  defaultLessonId?: string | null;
  /** Các lớp khác của tôi có thể giao thêm (chỉ lớp tôi được ghi). */
  otherBoards: { id: string; title: string }[];
  onSave: (input: TaskInput, alsoAssignTo: string[]) => Promise<void>;
  onClose: () => void;
}

/**
 * Giao bài tập / yêu cầu: thuộc bài học nào, hướng dẫn, giao lúc nào, hạn nộp, cho nộp muộn,
 * giao cho cả lớp hay chỉ một số tổ / nhóm, và giao thêm cho các lớp khác.
 */
export function TaskModal({ board, task, defaultLessonId = null, otherBoards, onSave, onClose }: Props) {
  const w = wordsFor(board.mode, board.settings.scope);
  const team = board.settings.scope === 'team';
  // Tổ công tác: hai kiểu việc. Cần minh chứng (ảnh / tệp) hoặc chỉ đọc (bấm "Tôi đã đọc").
  const [ack, setAck] = useState(task?.ackOnly ?? false);
  const [evidenceRequired, setEvidenceRequired] = useState(task ? !!task.needsEvidence : true);
  const [repeat, setRepeat] = useState<RepeatRule>(task?.repeat ?? 'none');
  const [keep, setKeep] = useState<Attachment[]>(task?.attachments ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [linkText, setLinkText] = useState('');
  const [kind, setKind] = useState<TaskKind>(task?.kind ?? (team ? 'requirement' : 'assignment'));
  const [label, setLabel] = useState(task?.label ?? '');
  const [lessonId, setLessonId] = useState(task ? task.lessonId ?? '' : defaultLessonId ?? '');
  const [instructions, setInstructions] = useState(task?.instructions ?? '');
  const [scheduled, setScheduled] = useState(!!task?.assignedAt && Date.parse(task.assignedAt) > Date.now());
  const [assignedAt, setAssignedAt] = useState(toLocalInput(task?.assignedAt));
  const [dueAt, setDueAt] = useState(toLocalInput(task?.dueAt));
  const [allowLate, setAllowLate] = useState(task?.allowLate ?? false);
  const [targetAll, setTargetAll] = useState((task?.targetUnits ?? []).length === 0);
  const [targets, setTargets] = useState<string[]>(task?.targetUnits ?? []);
  const [extraUnit, setExtraUnit] = useState('');
  const [others, setOthers] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const knownUnits = useMemo(() => [...new Set([...unitsOf(board), ...targets])], [board, targets]);
  const toggle = (list: string[], v: string): string[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const addUnit = (): void => {
    const v = extraUnit.trim();
    if (v && !targets.includes(v)) setTargets([...targets, v]);
    setExtraUnit('');
  };

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!label.trim()) { setError('Hãy nhập tên bài tập / yêu cầu.'); document.getElementById('tk-label')?.focus(); return; }
    if (!targetAll && targets.length === 0) { setError(`Chọn ít nhất một ${w.unit} được giao, hoặc chọn “${w.everyone}”.`); return; }
    if (scheduled && !assignedAt) { setError('Hãy chọn thời điểm giao bài hoặc chọn “Giao ngay”.'); return; }
    setBusy(true);
    try {
      await onSave({
        label, lessonId: lessonId || null, kind, instructions,
        ...(team ? { repeat: dueAt ? repeat : 'none', seriesId: task?.seriesId, ackOnly: ack, needsEvidence: !ack && evidenceRequired, attachments: keep, files, links: linkText.split(/\r?\n|\s{2,}/).map((x) => x.trim()).filter(Boolean) } : {}),
        assignedAt: scheduled ? fromLocalInput(assignedAt) : (task?.assignedAt && Date.parse(task.assignedAt) <= Date.now() ? task.assignedAt : new Date().toISOString()), // "giao ngay" ghi đúng lúc giao để chia 3 ngưỡng thời gian chính xác
        dueAt: fromLocalInput(dueAt), allowLate,
        targetUnits: targetAll ? [] : targets,
      }, others);
    } catch (err) { setError(err instanceof Error ? err.message : 'Không lưu được.'); setBusy(false); }
  };

  const targetBlock = (
        <fieldset className="space-y-2">
          <legend className="field-label">Giao cho</legend>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="tk-target" className="h-4 w-4 accent-brand-600" checked={targetAll} onChange={() => setTargetAll(true)} /> {w.everyone}</label>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="tk-target" className="h-4 w-4 accent-brand-600" checked={!targetAll} onChange={() => setTargetAll(false)} /> Chỉ một số {w.unit}</label>
          {!targetAll && (
            <div className="space-y-2 rounded-2xl border border-brand-100 p-3">
              <div className="flex flex-wrap gap-2">
                {knownUnits.length === 0 && <p className="text-xs text-ink-2">Chưa có danh sách. Hãy nhập tên {w.unit} bên dưới.</p>}
                {knownUnits.map((u) => (
                  <label key={u} className={`chip cursor-pointer ${targets.includes(u) ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-2 ring-brand-200'}`}>
                    <input type="checkbox" className="sr-only" checked={targets.includes(u)} onChange={() => setTargets(toggle(targets, u))} />{u}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <input className="input" value={extraUnit} onChange={(e) => setExtraUnit(e.target.value)} placeholder={`Thêm ${w.unit} khác…`} aria-label={`Thêm ${w.unit}`}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUnit(); } }} />
                <button type="button" onClick={addUnit} className="btn-ghost shrink-0">Thêm</button>
              </div>
            </div>
          )}
        </fieldset>
  );

  return (
    <ModalShell title={team ? (task ? 'Sửa công việc' : 'Giao công việc') : task ? 'Sửa bài tập / yêu cầu' : 'Giao bài tập / yêu cầu'} onClose={onClose} maxWidth="max-w-5xl">
      <form onSubmit={(e) => void submit(e)} noValidate className="grid grid-cols-1 gap-x-7 gap-y-4 lg:grid-cols-2">
        {/* Cột trái: giao cái gì, cho ai. Cột phải: khi nào, giao thêm lớp khác. Vừa một màn hình, không phải cuộn. */}
        <div className={team ? 'space-y-3' : 'space-y-4'}>
        {team ? (
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="field-label">Thành viên cần làm gì?</legend>
          {([false, true] as const).map((isAck) => (
            <label key={String(isAck)} className={`flex cursor-pointer items-start gap-2 rounded-2xl border-2 p-3 transition ${ack === isAck ? 'border-brand-600 bg-brand-50' : 'border-brand-100 hover:border-brand-300'}`}>
              <input type="radio" name="tk-ack" className="mt-1 h-4 w-4 accent-brand-600" checked={ack === isAck} onChange={() => setAck(isAck)} />
              <span>
                <span className="block text-sm font-extrabold">{isAck ? 'Chỉ đọc' : 'Cần minh chứng'}</span>
                <span className="block text-xs text-ink-2">{isAck ? 'Đọc xong bấm “Tôi đã đọc”, không phải nộp gì' : 'Nộp ảnh chụp hoặc tệp, hệ thống tự ghi giờ nộp'}</span>
              </span>
            </label>
          ))}
          {!ack && <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={evidenceRequired} onChange={(e) => setEvidenceRequired(e.target.checked)} /> Bắt buộc phải đính kèm ảnh / tệp mới nộp được</label>}
        </fieldset>
        ) : (
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="field-label">Loại</legend>
          {(['assignment', 'requirement'] as TaskKind[]).map((k) => (
            <label key={k} className={`flex cursor-pointer items-start gap-2 rounded-2xl border-2 p-3 transition ${kind === k ? 'border-brand-600 bg-brand-50' : 'border-brand-100 hover:border-brand-300'}`}>
              <input type="radio" name="tk-kind" className="mt-1 h-4 w-4 accent-brand-600" checked={kind === k} onChange={() => setKind(k)} />
              <span>
                <span className="block text-sm font-extrabold">{KIND_LABEL[k]}</span>
                <span className="block text-xs text-ink-2">{k === 'assignment' ? `${w.learner} làm và nộp sản phẩm` : 'Việc cần hoàn thành, nộp minh chứng'}</span>
              </span>
            </label>
          ))}
        </fieldset>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="tk-label" className="field-label">Tên *</label>
            <input id="tk-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus placeholder="Ví dụ: Viết 5 câu về gia đình" />
          </div>
          {!team && <div>
            <label htmlFor="tk-lesson" className="field-label">Thuộc {w.lessonLower}</label>
            <select id="tk-lesson" className="input" value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
              <option value="">Không thuộc {w.lessonLower} nào</option>
              {board.lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
            </select>
          </div>}
        </div>

        <div>
          <label htmlFor="tk-ins" className="field-label">Hướng dẫn / yêu cầu cụ thể <span className="font-normal text-ink-2">(không bắt buộc)</span></label>
          <textarea id="tk-ins" className={`input py-2 ${team ? 'min-h-[52px]' : 'min-h-[80px]'}`} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </div>

        {team && (
          <fieldset className="space-y-2 rounded-2xl border border-brand-100 p-3">
            <legend className="field-label px-1">Tài liệu và liên kết kèm theo <span className="font-normal text-ink-2">(không bắt buộc)</span></legend>
            <ul className="space-y-1">
              {keep.map((a, i) => (
                <li key={`${a.url ?? a.name}-${i}`} className="flex items-center gap-2 rounded-xl bg-white px-2 py-1.5 text-sm ring-1 ring-brand-100">
                  {a.type === 'link' || a.type === 'embed' ? <Link2 className="h-4 w-4 shrink-0 text-brand-700" aria-hidden /> : <FileText className="h-4 w-4 shrink-0 text-brand-700" aria-hidden />}
                  <span className="min-w-0 flex-1 truncate">{a.label || a.name}</span>
                  <button type="button" onClick={() => setKeep(keep.filter((_, j) => j !== i))} className="rounded-full p-1 text-ink-2 hover:bg-rose-50 hover:text-rose-700" aria-label={`Bỏ ${a.name}`}><X className="h-4 w-4" aria-hidden /></button>
                </li>
              ))}
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-xl bg-white px-2 py-1.5 text-sm ring-1 ring-brand-100">
                  <FileText className="h-4 w-4 shrink-0 text-brand-700" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{f.name} <span className="text-xs text-ink-2">({formatSize(f.size)})</span></span>
                  <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="rounded-full p-1 text-ink-2 hover:bg-rose-50 hover:text-rose-700" aria-label={`Bỏ ${f.name}`}><X className="h-4 w-4" aria-hidden /></button>
                </li>
              ))}
            </ul>
            <label className="btn-ghost btn-sm cursor-pointer"><Paperclip className="h-3.5 w-3.5" aria-hidden /> Tải tài liệu (PDF, Word…)
              <input type="file" multiple className="sr-only" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*" onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }} />
            </label>
            <div>
              <label htmlFor="tk-links" className="field-label">Liên kết khảo sát (mỗi dòng một link)</label>
              <textarea id="tk-links" className="input min-h-[44px] py-2 text-base" value={linkText} onChange={(e) => setLinkText(e.target.value)} placeholder="https://forms.gle/…" />
            </div>
          </fieldset>
        )}

        {!team && targetBlock}

        </div>
        <div className="space-y-4">
        {team && targetBlock}
        <div className="space-y-3 rounded-2xl bg-brand-50/70 p-3">
          <p className="text-sm font-extrabold">Thời gian</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={!scheduled} onChange={(e) => setScheduled(!e.target.checked)} /> Giao ngay (hiện cho {w.learner} khi lưu)</label>
          {scheduled && (
            <div>
              <label htmlFor="tk-assign" className="field-label">Giao lúc</label>
              <input id="tk-assign" type="datetime-local" className="input" value={assignedAt} onChange={(e) => setAssignedAt(e.target.value)} />
              <p className="mt-1 text-xs text-ink-2">Trước giờ này {w.learner} chưa thấy và chưa nộp được.</p>
            </div>
          )}
          <div>
            <label htmlFor="tk-due" className="field-label">Hạn nộp <span className="font-normal text-ink-2">(để trống = không có hạn)</span></label>
            <input id="tk-due" type="datetime-local" className="input" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
          {team && (
            <div>
              <label htmlFor="tk-repeat" className="field-label">Lặp lại</label>
              <RepeatSelect id="tk-repeat" value={repeat} due={dueAt} onChange={setRepeat} />
              <p className="mt-1 text-xs text-ink-2">{dueAt ? 'Hết hạn là kỳ mới tự xuất hiện khi tổ trưởng mở bảng.' : 'Cần đặt hạn nộp thì mới lặp được.'}</p>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={allowLate} onChange={(e) => setAllowLate(e.target.checked)} /> Cho phép nộp muộn (bài nộp sau hạn được đánh dấu “Nộp muộn”)</label>
        </div>

        {!team && otherBoards.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="field-label">Giao thêm cho lớp khác của bạn</legend>
            <p className="text-xs text-ink-2">Sao chép bài tập (kèm {w.lessonLower} và tài liệu của {w.lessonLower}) sang lớp được chọn. Mỗi lớp nhận bài nộp riêng.</p>
            <div className="flex flex-wrap gap-2">
              {otherBoards.map((b) => (
                <label key={b.id} className={`chip cursor-pointer ${others.includes(b.id) ? 'bg-teal2-600 text-white ring-teal2-600' : 'bg-white text-ink-2 ring-brand-200'}`}>
                  <input type="checkbox" className="sr-only" checked={others.includes(b.id)} onChange={() => setOthers(toggle(others, b.id))} />{b.title}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        </div>
        {error && <p role="alert" className="text-sm font-bold text-rose-700 lg:col-span-2">{error}</p>}
        <div className="flex justify-end gap-2 lg:col-span-2">
          <button type="button" onClick={onClose} className="btn-ghost">Hủy</button>
          <button type="submit" disabled={busy} className="btn-primary">{busy ? 'Đang lưu…' : task ? 'Lưu thay đổi' : team ? 'Giao việc' : 'Giao bài'}</button>
        </div>
      </form>
    </ModalShell>
  );
}
