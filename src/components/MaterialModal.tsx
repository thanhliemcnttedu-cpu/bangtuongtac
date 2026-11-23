import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, FormEvent } from 'react';
import { Link2, Network, Trash2, Upload } from 'lucide-react';
import { MindMapEditor } from './mindmap/MindMapEditor';
import type { BoardData, ResourceKind } from '../types/board';
import type { MaterialInput } from '../hooks/useBoardStore';
import { ACCEPT_ATTR, formatSize, validateFile } from '../lib/media';
import { linkToAttachment, normalizeLink } from '../lib/embeds';
import { ModalShell } from './ModalShell';

interface Props {
  board: BoardData;
  /** Bài học chọn sẵn; null = tài liệu chung của lớp. */
  defaultLessonId: string | null;
  /** Mở ngay trình thiết kế sơ đồ tư duy khi vào hộp thoại. */
  startMindMap?: boolean;
  onAdd: (input: MaterialInput) => Promise<void>;
  onClose: () => void;
}

const KINDS: { id: ResourceKind | 'auto'; label: string }[] = [
  { id: 'auto', label: 'Tự nhận theo tệp' }, { id: 'sample', label: 'Bài mẫu' }, { id: 'slide', label: 'Slide' },
  { id: 'pdf', label: 'Tài liệu PDF' }, { id: 'video', label: 'Video' }, { id: 'audio', label: 'Âm thanh' },
  { id: 'image', label: 'Hình ảnh' }, { id: 'file', label: 'Tệp khác' }, { id: 'link', label: 'Liên kết' },
];
const MAX_ITEMS = 10;

/** Giáo viên / giảng viên cung cấp tài liệu: tải nhiều tệp đa phương tiện (Word, Excel, PowerPoint, PDF, ảnh, âm thanh, video) và/hoặc dán liên kết. */
export function MaterialModal({ board, defaultLessonId, startMindMap = false, onAdd, onClose }: Props) {
  const [mm, setMm] = useState(startMindMap);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<ResourceKind | 'auto'>('auto');
  const [lessonId, setLessonId] = useState(defaultLessonId ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [linkText, setLinkText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const links = linkText.split(/\s+/).map((l) => normalizeLink(l)).filter(Boolean);

  const addFiles = (list: File[]): void => {
    const problems: string[] = [];
    const next = [...files];
    for (const f of list) {
      const p = validateFile(f);
      if (p) { problems.push(`${f.name}: ${p}`); continue; }
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      if (next.length + links.length >= MAX_ITEMS) { problems.push(`Tối đa ${MAX_ITEMS} tệp / liên kết cho mỗi tài liệu.`); break; }
      next.push(f);
    }
    setFiles(next);
    setError(problems.join(' '));
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>): void => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; };
  const onDrop = (e: DragEvent<HTMLElement>): void => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files)); };

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!title.trim()) { setError('Hãy nhập tên tài liệu.'); document.getElementById('mt-title')?.focus(); return; }
    const bad = links.find((l) => { const a = linkToAttachment(l); return a.type === 'link' && !a.url; });
    if (bad) { setError(`“${bad.slice(0, 40)}” chưa phải liên kết (cần bắt đầu bằng https://).`); return; }
    if (files.length + links.length === 0) { setError('Hãy tải lên ít nhất một tệp hoặc dán một liên kết.'); return; }
    setBusy(true);
    try { await onAdd({ title, description, kind, lessonId: lessonId || null, files, links }); }
    catch (err) { setError(err instanceof Error ? err.message : 'Không thêm được tài liệu.'); setBusy(false); }
  };

  const mindMapDone = (f: File): void => {
    addFiles([f]);
    if (!title.trim()) setTitle('Sơ đồ tư duy');
    if (kind === 'auto') setKind('sample');
    setMm(false);
  };

  return (
    <ModalShell title="Thêm tài liệu" onClose={onClose} maxWidth="max-w-xl">
      <form onSubmit={(e) => void submit(e)} noValidate className="space-y-3">
        <div>
          <label htmlFor="mt-title" className="field-label">Tên tài liệu *</label>
          <input id="mt-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="mt-lesson" className="field-label">Đặt trong</label>
            <select id="mt-lesson" className="input" value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
              <option value="">Tài liệu chung của lớp</option>
              {board.lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="mt-kind" className="field-label">Loại</label>
            <select id="mt-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as ResourceKind | 'auto')}>
              {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="mt-desc" className="field-label">Mô tả ngắn</label>
          <input id="mt-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop} className="rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/60 p-3">
          <input ref={input} type="file" multiple accept={ACCEPT_ATTR} onChange={onPick} className="sr-only" aria-label="Chọn tệp tài liệu" />
          <button type="button" onClick={() => setMm(true)} className="btn-primary mb-2 w-full"><Network className="h-4 w-4" aria-hidden /> Tạo sơ đồ tư duy ngay trên bảng</button>
          <button type="button" onClick={() => input.current?.click()} className="btn-ghost w-full"><Upload className="h-4 w-4" aria-hidden /> Tải nhiều tệp (hoặc kéo thả vào đây)</button>
          <p className="mt-1 text-center text-xs text-ink-2">Word, Excel, PowerPoint, PDF, ảnh, âm thanh, video · tối đa 25 MB mỗi tệp</p>
          {files.length > 0 && (
            <ul className="mt-2 space-y-1">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-brand-100">
                  <span className="min-w-0 truncate">{f.name} <span className="text-xs text-ink-2">· {formatSize(f.size)}</span></span>
                  <button type="button" aria-label={`Bỏ ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="btn-ghost btn-sm !px-2"><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label htmlFor="mt-links" className="field-label"><Link2 className="mr-1 inline h-4 w-4" aria-hidden />Liên kết <span className="font-normal text-ink-2">(mỗi dòng một liên kết: YouTube, Drive, Canva…)</span></label>
          <textarea id="mt-links" className="input min-h-[72px] py-2" value={linkText} onChange={(e) => setLinkText(e.target.value)} placeholder="https://…" />
        </div>

        <p className="text-xs text-ink-2">Người học xem trực tiếp trong trang, không cần tải về.</p>
        {error && <p role="alert" className="text-sm font-bold text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Hủy</button>
          <button type="submit" disabled={busy} className="btn-primary">{busy ? 'Đang tải lên…' : 'Thêm tài liệu'}</button>
        </div>
      </form>
      {mm && <MindMapEditor title={title.trim() || 'Sơ đồ tư duy'} rootText={title.trim() || 'Ý chính'} onDone={mindMapDone} onClose={() => setMm(false)} />}
    </ModalShell>
  );
}
