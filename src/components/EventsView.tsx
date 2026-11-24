import { useMemo, useState } from 'react';
import type { ClipboardEvent, FormEvent } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, FileText, ListChecks, MapPin, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Attachment, TaskItem } from '../types/board';
import type { CalEvent, EventKind } from '../types/schedule';
import type { BoardStore } from '../hooks/useBoardStore';
import type { EventData } from '../lib/scheduleApi';
import { EVENT_KINDS, WEEKDAYS, dayKey, kindOf, weekdayOf } from '../lib/timetable';
import { fromLocalInput, toLocalInput } from '../lib/lessons';
import { formatSize, nameClipboardFile } from '../lib/media';
import { ModalShell } from './ModalShell';
import { TaskDocs } from './TaskDocs';

const pad = (n: number): string => String(n).padStart(2, '0');
const clock = (iso: string): string => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

interface FormProps {
  store: BoardStore;
  boardId: string | null;
  event?: CalEvent;
  /** Việc riêng để liên kết với sự kiện. */
  tasks: TaskItem[];
  defaultDay: Date;
  onSave: (data: EventData, createTask: boolean) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

/**
 * Thêm hoặc sửa một sự kiện của lịch công tác (họp, sinh hoạt tổ, dự giờ, kiểm tra, tập huấn, hội thi, nộp báo cáo…): ngày giờ, địa điểm,
 * nội dung, tài liệu; có thể tạo công việc nhắc từ sự kiện hoặc liên kết với một việc có sẵn.
 */
export function EventForm({ store, boardId, event, tasks, defaultDay, onSave, onDelete, onClose }: FormProps) {
  const base = new Date(defaultDay.getFullYear(), defaultDay.getMonth(), defaultDay.getDate(), 8, 0);
  const [title, setTitle] = useState(event?.title ?? '');
  const [kind, setKind] = useState<EventKind>(event?.kind ?? 'hop');
  const [starts, setStarts] = useState(toLocalInput(event?.startsAt ?? base.toISOString()));
  const [ends, setEnds] = useState(toLocalInput(event?.endsAt));
  const [location, setLocation] = useState(event?.location ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [keep, setKeep] = useState<Attachment[]>(event?.attachments ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [linkText, setLinkText] = useState('');
  const [taskId, setTaskId] = useState(event?.taskId ?? '');
  const [makeTask, setMakeTask] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const onPaste = (e: ClipboardEvent<HTMLElement>): void => {
    const got = Array.from(e.clipboardData.files);
    if (got.length === 0) return;
    e.preventDefault();
    setFiles((f) => [...f, ...got.map(nameClipboardFile)]);
  };

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!title.trim()) { setError('Hãy nhập tên sự kiện.'); document.getElementById('ev-title')?.focus(); return; }
    const s = fromLocalInput(starts);
    if (!s) { setError('Hãy chọn ngày giờ bắt đầu.'); return; }
    const en = fromLocalInput(ends);
    if (en && Date.parse(en) < Date.parse(s)) { setError('Giờ kết thúc phải sau giờ bắt đầu.'); return; }
    setBusy(true); setError('');
    try {
      const bid = boardId ?? (await store.ensurePersonalBoard()).id;
      const added = files.length + linkText.trim().length > 0 ? await store.prepareFiles(bid, files, linkText.split(/\r?\n|\s{2,}/).map((x) => x.trim()).filter(Boolean), 'Lịch công tác') : [];
      await onSave({ title: title.trim(), kind, startsAt: s, endsAt: en, location: location.trim(), description: description.trim(), attachments: [...keep, ...added], taskId: taskId || null }, makeTask && !taskId);
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'Không lưu được sự kiện.'); setBusy(false); }
  };

  return (
    <ModalShell title={event ? 'Sửa sự kiện' : 'Thêm sự kiện'} onClose={onClose} maxWidth="max-w-3xl" onPaste={onPaste}>
      <form onSubmit={(e) => void submit(e)} noValidate className="grid grid-cols-1 gap-x-6 gap-y-3 lg:grid-cols-2">
        <div className="space-y-3">
          <div><label htmlFor="ev-title" className="field-label">Tên sự kiện *</label><input id="ev-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="Ví dụ: Họp hội đồng sư phạm" /></div>
          <div><label htmlFor="ev-kind" className="field-label">Loại</label><select id="ev-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as EventKind)}>{EVENT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div><label htmlFor="ev-start" className="field-label">Bắt đầu</label><input id="ev-start" type="datetime-local" className="input" value={starts} onChange={(e) => setStarts(e.target.value)} /></div>
            <div><label htmlFor="ev-end" className="field-label">Kết thúc <span className="font-normal text-ink-2">(không bắt buộc)</span></label><input id="ev-end" type="datetime-local" className="input" value={ends} onChange={(e) => setEnds(e.target.value)} /></div>
          </div>
          <div><label htmlFor="ev-loc" className="field-label">Địa điểm</label><input id="ev-loc" className="input" value={location} onChange={(e) => setLocation(e.target.value)} /></div>
          <div><label htmlFor="ev-desc" className="field-label">Nội dung</label><textarea id="ev-desc" className="input min-h-[80px] py-2" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        </div>
        <div className="space-y-3">
          <fieldset className="min-w-0 space-y-2 rounded-2xl border border-brand-100 p-3">
            <legend className="field-label px-1">Tài liệu của sự kiện</legend>
            {(keep.length > 0 || files.length > 0) && (
              <ul className="space-y-1">
                {keep.map((a, i) => <li key={`${a.url ?? a.name}-${i}`} className="flex items-center gap-2 rounded-xl bg-white px-2 py-1.5 text-sm ring-1 ring-brand-100"><FileText className="h-4 w-4 shrink-0 text-brand-700" aria-hidden /><span className="min-w-0 flex-1 truncate">{a.label || a.name}</span><button type="button" onClick={() => setKeep(keep.filter((_, j) => j !== i))} aria-label={`Bỏ ${a.name}`} className="rounded-full p-1.5 hover:bg-rose-50 max-lg:p-3"><X className="h-4 w-4" aria-hidden /></button></li>)}
                {files.map((f, i) => <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-xl bg-white px-2 py-1.5 text-sm ring-1 ring-brand-100"><FileText className="h-4 w-4 shrink-0 text-brand-700" aria-hidden /><span className="min-w-0 flex-1 truncate">{f.name} <span className="text-xs text-ink-2">({formatSize(f.size)})</span></span><button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Bỏ ${f.name}`} className="rounded-full p-1.5 hover:bg-rose-50 max-lg:p-3"><X className="h-4 w-4" aria-hidden /></button></li>)}
              </ul>
            )}
            <label className="btn-ghost btn-sm cursor-pointer max-lg:min-h-[44px]"><FileText className="h-3.5 w-3.5" aria-hidden /> Tải công văn, kế hoạch, ảnh…
              <input type="file" multiple className="sr-only" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*" onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }} />
            </label>
            <p className="text-xs text-ink-2">Có thể nhấn Ctrl + V (Windows + V) để dán ảnh.</p>
            <div><label htmlFor="ev-links" className="field-label">Liên kết <span className="font-normal text-ink-2">(mỗi dòng một link)</span></label><textarea id="ev-links" className="input min-h-[52px] py-2" value={linkText} onChange={(e) => setLinkText(e.target.value)} /></div>
          </fieldset>
          <div className="space-y-2 rounded-2xl bg-brand-50/70 p-3">
            <p className="flex items-center gap-1 text-sm font-extrabold"><ListChecks className="h-4 w-4 text-brand-700" aria-hidden /> Liên kết với công việc</p>
            <select aria-label="Liên kết với việc có sẵn" className="input" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
              <option value="">Chưa liên kết việc nào</option>{tasks.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            {!taskId && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={makeTask} onChange={(e) => setMakeTask(e.target.checked)} /> <span>Tạo công việc nhắc trong “Việc của tôi” (hạn là giờ bắt đầu của sự kiện)</span></label>}
          </div>
        </div>
        {error && <p role="alert" className="text-sm font-bold text-rose-700 lg:col-span-2">{error}</p>}
        <div className="flex flex-wrap justify-between gap-2 lg:col-span-2">
          {event && onDelete ? <button type="button" disabled={busy} onClick={() => { if (window.confirm('Xóa sự kiện này khỏi lịch công tác? Công việc đã liên kết (nếu có) vẫn được giữ.')) void onDelete().then(onClose).catch((x) => setError(x instanceof Error ? x.message : 'Không xóa được.')); }} className="btn-ghost hover:!border-rose-300 hover:!text-rose-700 max-lg:min-h-[44px]"><Trash2 className="h-4 w-4" aria-hidden /> Xóa sự kiện</button> : <span />}
          <span className="flex gap-2"><button type="button" onClick={onClose} className="btn-ghost max-lg:min-h-[44px]">Hủy</button><button type="submit" disabled={busy} className="btn-primary max-lg:min-h-[44px]">{busy ? 'Đang lưu…' : 'Lưu sự kiện'}</button></span>
        </div>
      </form>
    </ModalShell>
  );
}

/** Danh sách lịch công tác theo tháng, nhóm theo ngày, mỗi loại một màu. */
export function EventsView({ events, tasks, anchor, setAnchor, onAdd, onEdit, onOpenTask, onMakeTask }: {
  events: CalEvent[]; tasks: TaskItem[]; anchor: Date; setAnchor: (d: Date) => void;
  onAdd: () => void; onEdit: (e: CalEvent) => void; onOpenTask: (taskId: string) => void; onMakeTask: (e: CalEvent) => void;
}) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  const inMonth = useMemo(() => events.filter((e) => { const s = Date.parse(e.startsAt); return s >= first.getTime() && s < end.getTime(); }), [events, first, end]);
  const groups = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const e of [...inMonth].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))) { const k = dayKey(new Date(e.startsAt)); m.set(k, [...(m.get(k) ?? []), e]); }
    return [...m.entries()];
  }, [inMonth]);
  const taskLabel = (id: string | null): string | null => (id ? tasks.find((t) => t.id === id)?.label ?? null : null);

  return (
    <section aria-label="Lịch công tác" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setAnchor(new Date(first.getFullYear(), first.getMonth() - 1, 1))} className="btn-ghost btn-sm max-lg:!min-h-[44px]" aria-label="Tháng trước"><ChevronLeft className="h-4 w-4" aria-hidden /></button>
        <b className="min-w-[8rem] text-center text-sm">Tháng {first.getMonth() + 1}/{first.getFullYear()}</b>
        <button type="button" onClick={() => setAnchor(new Date(first.getFullYear(), first.getMonth() + 1, 1))} className="btn-ghost btn-sm max-lg:!min-h-[44px]" aria-label="Tháng sau"><ChevronRight className="h-4 w-4" aria-hidden /></button>
        <button type="button" onClick={() => setAnchor(new Date())} className="btn-ghost btn-sm max-lg:!min-h-[44px]">Tháng này</button>
        <button type="button" onClick={onAdd} className="btn-primary ml-auto max-lg:min-h-[44px]"><CalendarPlus className="h-4 w-4" aria-hidden /> Thêm sự kiện</button>
      </div>
      <div className="flex flex-wrap gap-1.5" aria-label="Chú thích các loại">{EVENT_KINDS.map((k) => <span key={k.id} className="chip" style={{ background: k.soft, color: k.text, boxShadow: 'none' }}>{k.label}</span>)}</div>
      {groups.length === 0 && <p className="rounded-2xl border border-dashed border-brand-200 bg-white/70 p-8 text-center text-ink-2">Tháng này chưa có sự kiện nào. Bấm “Thêm sự kiện” để ghi lịch họp, dự giờ, tập huấn, hạn nộp báo cáo…</p>}
      {groups.map(([day, list]) => {
        const d = new Date(`${day}T00:00:00`);
        return (
          <div key={day}>
            <h2 className="mb-1 text-sm font-extrabold text-ink-2">{WEEKDAYS[weekdayOf(d) - 1]}, {pad(d.getDate())}/{pad(d.getMonth() + 1)}</h2>
            <ul className="space-y-2">
              {list.map((e) => {
                const k = kindOf(e.kind);
                const tl = taskLabel(e.taskId);
                return (
                  <li key={e.id} className="rounded-2xl border-[1.5px] border-brand-100 bg-white p-3" style={{ borderLeft: `5px solid ${k.bar}` }}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5"><span className="chip" style={{ background: k.soft, color: k.text, boxShadow: 'none' }}>{k.label}</span><b className="text-base">{e.title}</b></p>
                        <p className="text-xs text-ink-2">{clock(e.startsAt)}{e.endsAt ? ` – ${clock(e.endsAt)}` : ''}{e.location ? <> · <MapPin className="mb-0.5 inline h-3 w-3" aria-hidden /> {e.location}</> : null}</p>
                        {e.description && <p className="mt-1 whitespace-pre-line text-sm text-ink-2">{e.description}</p>}
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-lg:[&>*]:!min-h-[44px]">
                        {e.taskId && tl ? <button type="button" onClick={() => onOpenTask(e.taskId as string)} className="btn-ghost btn-sm"><ListChecks className="h-3.5 w-3.5" aria-hidden /> Mở việc</button> : <button type="button" onClick={() => onMakeTask(e)} className="btn-ghost btn-sm"><Plus className="h-3.5 w-3.5" aria-hidden /> Tạo việc nhắc</button>}
                        <button type="button" onClick={() => onEdit(e)} className="btn-ghost btn-sm"><Pencil className="h-3.5 w-3.5" aria-hidden /> Sửa</button>
                      </div>
                    </div>
                    {e.attachments.length > 0 && <TaskDocs task={{ id: e.id, label: e.title, attachments: e.attachments }} className="mt-2" />}
                    {tl && <p className="mt-1 text-xs font-bold text-brand-700">Công việc liên kết: {tl}</p>}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
