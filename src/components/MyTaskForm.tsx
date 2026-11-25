import { useState } from 'react';
import type { ClipboardEvent, DragEvent, FormEvent } from 'react';
import { ClipboardPaste, FileText, Link2, ListChecks, Paperclip, Plus, Repeat, X } from 'lucide-react';
import type { Attachment, RepeatRule, TaskItem } from '../types/board';
import { RepeatSelect } from './RepeatSelect';
import type { BoardStore } from '../hooks/useBoardStore';
import type { TaskInput } from '../lib/boardApi';
import { buildChecklist, splitChecklist } from '../lib/checklist';
import type { CheckItem } from '../lib/checklist';
import { taskToInput } from '../lib/recurrence';
import { CATEGORIES } from '../lib/taskPlan';
import { formatSize, nameClipboardFile } from '../lib/media';
import { fromLocalInput, toLocalInput } from '../lib/lessons';
import { ModalShell } from './ModalShell';
import { RichEditor } from './RichEditor';

interface Props {
  store: BoardStore;
  /** Có = đang sửa một việc riêng đã có (không đổi người nhận). */
  editing?: { boardId: string; task: TaskItem };
  onClose: () => void;
  onSaved: (message: string) => void;
}

/** Mốc giờ kế tiếp trong ngày (hôm nay nếu chưa qua, không thì ngày mai) dạng ô nhập datetime-local. */
const nextAt = (h: number, m: number): string => { const d = new Date(); d.setHours(h, m, 0, 0); if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1); return toLocalInput(d.toISOString()); };
const nextWeekday = (wd: number, h: number, m: number): string => { const d = new Date(); d.setHours(h, m, 0, 0); let diff = (wd - d.getDay() + 7) % 7; if (diff === 0 && d.getTime() <= Date.now()) diff = 7; d.setDate(d.getDate() + diff); return toLocalInput(d.toISOString()); };
const nextMonthDay = (day: number, h: number, m: number): string => { const d = new Date(); d.setDate(day); d.setHours(h, m, 0, 0); if (d.getTime() <= Date.now()) { d.setMonth(d.getMonth() + 1); d.setDate(day); } return toLocalInput(d.toISOString()); };

/** Mẫu việc thường gặp của giáo viên: điền sẵn tên, nhóm, danh sách việc nhỏ, lặp và giờ; giáo viên sửa lại theo trường mình. */
const PRESETS: { label: string; title: string; category: string; items: string[]; repeat: RepeatRule; due: () => string }[] = [
  { label: 'Điểm danh lớp hằng ngày', title: 'Điểm danh lớp và báo cáo sĩ số', category: 'bao_cao', items: ['Điểm danh học sinh', 'Báo cáo số lượng học sinh có mặt'], repeat: 'weekdays', due: () => nextAt(7, 30) },
  { label: 'Báo cáo bán trú', title: 'Báo cáo số lượng học sinh bán trú', category: 'bao_cao', items: ['Chốt số lượng bán trú', 'Gửi báo cáo cho nhà bếp / văn phòng'], repeat: 'days:1234', due: () => nextAt(8, 30) },
  { label: 'Thời khóa biểu tuần', title: 'Xem và chuẩn bị thời khóa biểu tuần', category: 'giang_day', items: ['Xem thời khóa biểu tuần mới', 'Chuẩn bị đồ dùng dạy học'], repeat: 'weekly', due: () => nextWeekday(0, 20, 0) },
  { label: 'Báo cáo tuần', title: 'Nộp báo cáo tuần', category: 'bao_cao', items: ['Tổng hợp số liệu trong tuần', 'Gửi báo cáo tuần'], repeat: 'weekly', due: () => nextWeekday(5, 16, 0) },
  { label: 'Báo cáo tháng', title: 'Nộp báo cáo tháng', category: 'bao_cao', items: ['Tổng hợp số liệu trong tháng', 'Gửi báo cáo tháng'], repeat: 'monthly', due: () => nextMonthDay(25, 16, 0) },
];


/**
 * Thêm hoặc sửa một công việc cho "Công việc của tôi": nhóm, ghi chú, danh sách việc nhỏ, tệp và liên kết kèm theo, các mốc thời gian
 * (bắt đầu, hạn hoàn thành, hạn báo cáo), ưu tiên và lặp lại. Đây là việc CÁ NHÂN để tự theo dõi, không giao cho người khác.
 */
export function MyTaskForm({ store, editing, onClose, onSaved }: Props) {
  const t0 = editing?.task;
  const split = splitChecklist(t0?.instructions ?? '');
  const [title, setTitle] = useState(t0?.label ?? '');
  const [category, setCategory] = useState(t0?.category ?? '');
  const [note, setNote] = useState(split.note);
  const [items, setItems] = useState<CheckItem[]>(split.items);
  const [itemText, setItemText] = useState('');
  const [keep, setKeep] = useState<Attachment[]>(t0?.attachments ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [linkText, setLinkText] = useState('');
  const [start, setStart] = useState(toLocalInput(t0?.startAt));
  const [due, setDue] = useState(toLocalInput(t0?.dueAt));
  const [reportDue, setReportDue] = useState(toLocalInput(t0?.reportDueAt));
  const [priority, setPriority] = useState<'high' | 'normal' | 'low'>(t0?.priority ?? 'normal');
  const [repeat, setRepeat] = useState<RepeatRule>(t0?.repeat ?? 'none');
  const [until, setUntil] = useState(toLocalInput(t0?.repeatUntil));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pasteMsg, setPasteMsg] = useState('');

  const isEdit = !!editing;

  const addFiles = (list: File[]): void => { setFiles((cur) => [...cur, ...list.map(nameClipboardFile)]); setPasteMsg(`Đã thêm ${list.length} tệp.`); window.setTimeout(() => setPasteMsg(''), 3500); };
  /** Dán ảnh từ bộ nhớ tạm bằng Ctrl + V hoặc Windows + V ở bất cứ đâu trong hộp thoại. */
  const onPaste = (e: ClipboardEvent<HTMLElement>): void => {
    const got = Array.from(e.clipboardData.files);
    if (got.length === 0) return;
    e.preventDefault();
    addFiles(got);
  };
  const onDrop = (e: DragEvent<HTMLElement>): void => { e.preventDefault(); const got = Array.from(e.dataTransfer.files); if (got.length > 0) addFiles(got); };
  const pasteButton = async (): Promise<void> => {
    try {
      const got: File[] = [];
      for (const it of await navigator.clipboard.read()) {
        const type = it.types.find((t) => t.startsWith('image/'));
        if (type) got.push(new File([await it.getType(type)], 'image.png', { type }));
      }
      if (got.length > 0) addFiles(got);
      else { setPasteMsg('Bộ nhớ tạm chưa có ảnh. Hãy sao chép ảnh rồi bấm lại, hoặc nhấn Ctrl + V.'); }
    } catch { setPasteMsg('Trình duyệt không cho đọc bộ nhớ tạm. Hãy nhấn Ctrl + V (hoặc Windows + V) để dán ảnh.'); }
  };
  const addItem = (): void => { const v = itemText.trim(); if (v) setItems([...items, { text: v, done: false }]); setItemText(''); };
  const preset = (p: (typeof PRESETS)[number]): void => { setTitle(p.title); setCategory(p.category); setItems(p.items.map((text) => ({ text, done: false }))); setRepeat(p.repeat); setDue(p.due()); };

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!title.trim()) { setError('Hãy nhập tên công việc.'); document.getElementById('mf-title')?.focus(); return; }
    const pending = itemText.trim();
    const allItems: CheckItem[] = pending ? [...items, { text: pending, done: false }] : items;
    const startIso = fromLocalInput(start);
    const dueIso = fromLocalInput(due);
    const repIso = fromLocalInput(reportDue);
    if (startIso && dueIso && Date.parse(dueIso) < Date.parse(startIso)) { setError('Hạn hoàn thành phải sau ngày bắt đầu.'); return; }
    setBusy(true); setError('');
    try {
      const base: TaskInput = {
        label: title.trim(), lessonId: null, kind: 'requirement',
        instructions: buildChecklist(note, allItems),
        assignedAt: null, dueAt: dueIso, allowLate: true, targetUnits: [], priority,
        repeat: dueIso ? repeat : 'none', repeatUntil: dueIso && repeat !== 'none' ? fromLocalInput(until) : null,
        category: category || undefined, startAt: startIso, reportDueAt: repIso,
        attachments: keep, files, links: linkText.split(/\r?\n|\s{2,}/).map((x) => x.trim()).filter(Boolean),
      };
      if (editing && t0) {
        await store.saveTask(editing.boardId, t0.id, { ...taskToInput(t0), ...base, assignedAt: t0.assignedAt ?? null, progress: t0.progress, completedAt: t0.completedAt ?? null, seriesId: t0.seriesId });
        onSaved('Đã lưu thay đổi.');
      } else {
        const b = await store.ensurePersonalBoard();
        await store.saveTask(b.id, null, { ...base, progress: 'todo' });
        onSaved('Đã thêm việc.');
      }
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'Không lưu được công việc.'); setBusy(false); }
  };

  return (
    <ModalShell title={isEdit ? 'Sửa công việc' : 'Thêm công việc'} onClose={onClose} maxWidth="max-w-[min(96vw,1500px)]" onPaste={onPaste}>
      <form onSubmit={(e) => void submit(e)} noValidate className="grid grid-cols-1 gap-x-7 gap-y-4 lg:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-4">
          {!isEdit && (
            <div>
              <p className="field-label">Mẫu việc thường gặp</p>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => <button key={p.label} type="button" onClick={() => preset(p)} className="chip cursor-pointer bg-white text-brand-800 ring-brand-200 hover:bg-brand-50 max-lg:min-h-[44px] max-lg:px-3 max-lg:text-sm">{p.label}</button>)}
              </div>
              <p className="mt-1 text-xs text-ink-2">Bấm để điền sẵn tên, nhóm, các việc nhỏ, giờ và kiểu lặp; bạn sửa lại cho đúng với trường mình.</p>
            </div>
          )}

          <div>
            <label htmlFor="mf-title" className="field-label">Tên công việc *</label>
            <input id="mf-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="Ví dụ: Điểm danh lớp và báo cáo sĩ số trước 7 giờ 30" />
          </div>
          <div>
            <label htmlFor="mf-cat" className="field-label">Nhóm công việc</label>
            <select id="mf-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Chưa phân nhóm</option>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <span id="mf-note-label" className="field-label block">Ghi chú / hướng dẫn <span className="font-normal text-ink-2">(không bắt buộc; có thể nói bằng giọng nói và định dạng chữ)</span></span>
            <RichEditor labelledBy="mf-note-label" value={note} onChange={setNote} minHeight={isEdit ? 220 : 130} maxHeight={460} placeholder="Viết hoặc nói nội dung, hướng dẫn thực hiện…" />
          </div>
        </div>

        <div className="space-y-4">
          <fieldset className="min-w-0 space-y-2 rounded-2xl border border-brand-100 p-3">
            <legend className="field-label flex items-center gap-1 px-1"><ListChecks className="h-4 w-4 text-brand-700" aria-hidden /> Các việc nhỏ cần làm <span className="font-normal text-ink-2">(checklist)</span></legend>
            {items.length > 0 && (
              <ul className="space-y-1">
                {items.map((it, i) => (
                  <li key={`${it.text}-${i}`} className="flex items-center gap-2 rounded-xl bg-white px-2 py-1.5 text-sm ring-1 ring-brand-100">
                    <span className={`min-w-0 flex-1 break-words ${it.done ? 'text-ink-3 line-through' : ''}`}>{it.text}</span>
                    <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label={`Bỏ việc nhỏ ${it.text}`} className="rounded-full p-1.5 text-ink-2 hover:bg-rose-50 hover:text-rose-700 max-lg:p-3"><X className="h-4 w-4" aria-hidden /></button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <input className="input" value={itemText} onChange={(e) => setItemText(e.target.value)} placeholder="Ví dụ: Điểm danh học sinh" aria-label="Thêm việc nhỏ" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }} />
              <button type="button" onClick={addItem} className="btn-ghost shrink-0"><Plus className="h-4 w-4" aria-hidden /> Thêm</button>
            </div>
          </fieldset>

          <fieldset className="min-w-0 space-y-2 rounded-2xl border border-brand-100 p-3" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
            <legend className="field-label flex items-center gap-1 px-1"><Paperclip className="h-4 w-4 text-brand-700" aria-hidden /> Tệp và liên kết kèm theo <span className="font-normal text-ink-2">(không bắt buộc)</span></legend>
            {(keep.length > 0 || files.length > 0) && (
              <ul className="space-y-1">
                {keep.map((a, i) => (
                  <li key={`${a.url ?? a.name}-${i}`} className="flex items-center gap-2 rounded-xl bg-white px-2 py-1.5 text-sm ring-1 ring-brand-100">
                    {a.type === 'link' || a.type === 'embed' ? <Link2 className="h-4 w-4 shrink-0 text-brand-700" aria-hidden /> : <FileText className="h-4 w-4 shrink-0 text-brand-700" aria-hidden />}
                    <span className="min-w-0 flex-1 truncate">{a.label || a.name}</span>
                    <button type="button" onClick={() => setKeep(keep.filter((_, j) => j !== i))} aria-label={`Bỏ ${a.name}`} className="rounded-full p-1.5 text-ink-2 hover:bg-rose-50 hover:text-rose-700 max-lg:p-3"><X className="h-4 w-4" aria-hidden /></button>
                  </li>
                ))}
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-xl bg-white px-2 py-1.5 text-sm ring-1 ring-brand-100">
                    <FileText className="h-4 w-4 shrink-0 text-brand-700" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{f.name} <span className="text-xs text-ink-2">({formatSize(f.size)})</span></span>
                    <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Bỏ ${f.name}`} className="rounded-full p-1.5 text-ink-2 hover:bg-rose-50 hover:text-rose-700 max-lg:p-3"><X className="h-4 w-4" aria-hidden /></button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <label className="btn-ghost btn-sm cursor-pointer max-lg:min-h-[44px]"><Paperclip className="h-3.5 w-3.5" aria-hidden /> Tải tệp (PDF, Word, Excel, ảnh…)
                <input type="file" multiple className="sr-only" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*" onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
              </label>
              <button type="button" onClick={() => void pasteButton()} className="btn-ghost btn-sm max-lg:min-h-[44px]"><ClipboardPaste className="h-3.5 w-3.5" aria-hidden /> Dán ảnh</button>
            </div>
            <p className="text-xs text-ink-2">Hoặc nhấn Ctrl + V (Windows + V) để dán ảnh từ bộ nhớ tạm, kéo thả tệp vào khung này.</p>
            {pasteMsg && <p role="status" className="text-xs font-bold text-brand-700">{pasteMsg}</p>}
            <div>
              <label htmlFor="mf-links" className="field-label flex items-center gap-1"><Link2 className="h-4 w-4 text-brand-700" aria-hidden /> Liên kết <span className="font-normal text-ink-2">(mỗi dòng một link)</span></label>
              <textarea id="mf-links" className="input min-h-[48px] py-2" value={linkText} onChange={(e) => setLinkText(e.target.value)} placeholder="https://docs.google.com/…" />
            </div>
          </fieldset>

        </div>

        <div className="space-y-4 lg:col-span-2 xl:col-span-1">
          <div className="space-y-3 rounded-2xl bg-brand-50/70 p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="mf-start" className="field-label">Ngày bắt đầu</label>
                <input id="mf-start" type="datetime-local" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div>
                <label htmlFor="mf-due" className="field-label">Hạn hoàn thành</label>
                <input id="mf-due" type="datetime-local" className="input" value={due} onChange={(e) => setDue(e.target.value)} />
              </div>
              <div>
                <label htmlFor="mf-rep" className="field-label">Hạn báo cáo / nộp <span className="font-normal text-ink-2">(nếu khác hạn hoàn thành)</span></label>
                <input id="mf-rep" type="datetime-local" className="input" value={reportDue} onChange={(e) => setReportDue(e.target.value)} />
              </div>
              <div>
                <label htmlFor="mf-pri" className="field-label">Ưu tiên</label>
                <select id="mf-pri" className="input" value={priority} onChange={(e) => setPriority(e.target.value as 'high' | 'normal' | 'low')}>
                  <option value="high">Cao</option><option value="normal">Vừa</option><option value="low">Thấp</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="mf-repeat" className="field-label flex items-center gap-1"><Repeat className="h-4 w-4 text-brand-700" aria-hidden /> Lặp lại</label>
              <RepeatSelect id="mf-repeat" value={repeat} due={due} onChange={setRepeat} />
              {due && repeat !== 'none' && (
                <div className="mt-2">
                  <label htmlFor="mf-until" className="field-label">Ngày kết thúc lặp <span className="font-normal text-ink-2">(để trống = lặp mãi)</span></label>
                  <input id="mf-until" type="datetime-local" className="input" value={until} onChange={(e) => setUntil(e.target.value)} />
                </div>
              )}
              <p className="mt-1 text-xs text-ink-2">{due ? 'Hết hạn là việc kỳ mới tự xuất hiện khi bạn mở trang này; kết quả kỳ trước được giữ nguyên, các việc nhỏ đặt lại chưa xong.' : 'Cần đặt hạn hoàn thành thì mới lặp được.'}</p>
            </div>
          </div>
        </div>

        {error && <p role="alert" className="text-sm font-bold text-rose-700 lg:col-span-2">{error}</p>}
        <div className="flex justify-end gap-2 lg:col-span-2">
          <button type="button" onClick={onClose} className="btn-ghost">Hủy</button>
          <button type="submit" disabled={busy} className="btn-primary">{busy ? 'Đang lưu…' : isEdit ? 'Lưu thay đổi' : 'Thêm việc'}</button>
        </div>
      </form>
    </ModalShell>
  );
}
