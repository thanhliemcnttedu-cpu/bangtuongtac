import { useState } from 'react';
import type { ClipboardEvent, FormEvent } from 'react';
import { FileText, Link2, Paperclip, Trash2, X } from 'lucide-react';
import type { Attachment } from '../types/board';
import type { TimetableEntry } from '../types/schedule';
import type { BoardStore } from '../hooks/useBoardStore';
import { formatSize, nameClipboardFile } from '../lib/media';
import { WEEKDAYS, normalizeTime } from '../lib/timetable';
import type { EntryData } from '../lib/scheduleApi';
import { ModalShell } from './ModalShell';

interface Props {
  store: BoardStore;
  boardId: string;
  /** Có = sửa; không = thêm tiết mới. */
  entry?: TimetableEntry;
  onSave: (data: EntryData) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

/**
 * Thêm hoặc sửa một tiết học và gắn giáo án, bài trình chiếu, tài liệu (tệp hoặc liên kết). Một tiết có nhiều tài liệu; có thể dán ảnh bằng Ctrl + V.
 */
export function EntryEditor({ store, boardId, entry, onSave, onDelete, onClose }: Props) {
  const [weekday, setWeekday] = useState(entry?.weekday ?? 1);
  const [period, setPeriod] = useState(entry?.period != null ? String(entry.period) : '');
  const [start, setStart] = useState(entry?.startTime ?? '');
  const [end, setEnd] = useState(entry?.endTime ?? '');
  const [subject, setSubject] = useState(entry?.subject ?? '');
  const [className, setClassName] = useState(entry?.className ?? '');
  const [room, setRoom] = useState(entry?.room ?? '');
  const [location, setLocation] = useState(entry?.location ?? '');
  const [topic, setTopic] = useState(entry?.topic ?? '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [keep, setKeep] = useState<Attachment[]>(entry?.attachments ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [linkText, setLinkText] = useState('');
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
    if (!subject.trim()) { setError('Hãy nhập môn học.'); document.getElementById('ee-subject')?.focus(); return; }
    const p = period.trim() === '' ? null : Number(period);
    if (p !== null && (!Number.isInteger(p) || p < 1 || p > 20)) { setError('Tiết phải là số từ 1 đến 20.'); return; }
    const st = start.trim() ? normalizeTime(start) : '';
    const en = end.trim() ? normalizeTime(end) : '';
    if (st === null || en === null) { setError('Giờ chưa đúng định dạng. Ví dụ 07:30.'); return; }
    if (p === null && !st) { setError('Cần có số tiết hoặc giờ bắt đầu.'); return; }
    if (st && en && en <= st) { setError('Giờ kết thúc phải sau giờ bắt đầu.'); return; }
    setBusy(true); setError('');
    try {
      const added = files.length + linkText.trim().length > 0
        ? await store.prepareFiles(boardId, files, linkText.split(/\r?\n|\s{2,}/).map((x) => x.trim()).filter(Boolean), 'Giáo án')
        : [];
      await onSave({ weekday, period: p, startTime: st, endTime: en, subject: subject.trim(), className: className.trim(), room: room.trim(), location: location.trim(), topic: topic.trim(), note: note.trim(), attachments: [...keep, ...added] });
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'Không lưu được.'); setBusy(false); }
  };

  return (
    <ModalShell title={entry ? 'Sửa tiết học' : 'Thêm tiết học'} onClose={onClose} maxWidth="max-w-3xl" onPaste={onPaste}>
      <form onSubmit={(e) => void submit(e)} noValidate className="grid grid-cols-1 gap-x-6 gap-y-3 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div><label htmlFor="ee-wd" className="field-label">Thứ</label><select id="ee-wd" className="input" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>{WEEKDAYS.map((w, i) => <option key={w} value={i + 1}>{w}</option>)}</select></div>
            <div><label htmlFor="ee-pd" className="field-label">Tiết</label><input id="ee-pd" className="input" inputMode="numeric" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="1" /></div>
            <div><label htmlFor="ee-room" className="field-label">Phòng</label><input id="ee-room" className="input" value={room} onChange={(e) => setRoom(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label htmlFor="ee-st" className="field-label">Giờ bắt đầu</label><input id="ee-st" className="input" value={start} onChange={(e) => setStart(e.target.value)} placeholder="07:30" /></div>
            <div><label htmlFor="ee-en" className="field-label">Giờ kết thúc</label><input id="ee-en" className="input" value={end} onChange={(e) => setEnd(e.target.value)} placeholder="08:05" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label htmlFor="ee-subject" className="field-label">Môn học *</label><input id="ee-subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} autoFocus placeholder="Tin học" /></div>
            <div><label htmlFor="ee-class" className="field-label">Lớp</label><input id="ee-class" className="input" value={className} onChange={(e) => setClassName(e.target.value)} placeholder="4A" /></div>
          </div>
          <div><label htmlFor="ee-loc" className="field-label">Địa điểm</label><input id="ee-loc" className="input" value={location} onChange={(e) => setLocation(e.target.value)} /></div>
          <div><label htmlFor="ee-topic" className="field-label">Nội dung bài dạy</label><input id="ee-topic" className="input" value={topic} onChange={(e) => setTopic(e.target.value)} /></div>
          <div><label htmlFor="ee-note" className="field-label">Ghi chú chung của tiết</label><textarea id="ee-note" className="input min-h-[56px] py-2" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <fieldset className="min-w-0 space-y-2 rounded-2xl border border-brand-100 p-3">
          <legend className="field-label flex items-center gap-1 px-1"><Paperclip className="h-4 w-4 text-brand-700" aria-hidden /> Giáo án và tài liệu của tiết</legend>
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
          <label className="btn-ghost btn-sm cursor-pointer max-lg:min-h-[44px]"><Paperclip className="h-3.5 w-3.5" aria-hidden /> Tải giáo án, bài trình chiếu, ảnh…
            <input type="file" multiple className="sr-only" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*" onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }} />
          </label>
          <p className="text-xs text-ink-2">Có thể nhấn Ctrl + V (Windows + V) để dán ảnh.</p>
          <div><label htmlFor="ee-links" className="field-label flex items-center gap-1"><Link2 className="h-4 w-4 text-brand-700" aria-hidden /> Liên kết <span className="font-normal text-ink-2">(Google Drive, website… mỗi dòng một link)</span></label><textarea id="ee-links" className="input min-h-[56px] py-2" value={linkText} onChange={(e) => setLinkText(e.target.value)} placeholder="https://drive.google.com/…" /></div>
        </fieldset>
        {error && <p role="alert" className="text-sm font-bold text-rose-700 lg:col-span-2">{error}</p>}
        <div className="flex flex-wrap justify-between gap-2 lg:col-span-2">
          {entry && onDelete ? <button type="button" disabled={busy} onClick={() => { if (window.confirm('Xóa tiết học này khỏi thời khóa biểu? Ghi chú sau tiết của các ngày cũng bị xóa.')) void onDelete().then(onClose).catch((x) => setError(x instanceof Error ? x.message : 'Không xóa được.')); }} className="btn-ghost hover:!border-rose-300 hover:!text-rose-700 max-lg:min-h-[44px]"><Trash2 className="h-4 w-4" aria-hidden /> Xóa tiết</button> : <span />}
          <span className="flex gap-2"><button type="button" onClick={onClose} className="btn-ghost max-lg:min-h-[44px]">Hủy</button><button type="submit" disabled={busy} className="btn-primary max-lg:min-h-[44px]">{busy ? 'Đang lưu…' : 'Lưu'}</button></span>
        </div>
      </form>
    </ModalShell>
  );
}
