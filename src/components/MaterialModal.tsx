import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, FormEvent } from 'react';
import { Link2, Network, Trash2, Upload } from 'lucide-react';
import { CARD_COLORS } from '../lib/cardColors';
import { MindMapEditor } from './mindmap/MindMapEditor';
import type { Attachment, BoardData, PinnedResource, ResourceKind } from '../types/board';
import type { MaterialInput } from '../hooks/useBoardStore';
import { ACCEPT_ATTR_TEACHER, formatSize, validateFile } from '../lib/media';
import { DRIVE_MAX_BYTES, gatewayOf } from '../lib/drive';
import { linkToAttachment, normalizeLink } from '../lib/embeds';
import { ModalShell } from './ModalShell';

interface Props {
  board: BoardData;
  /** Bài học chọn sẵn; null = tài liệu chung của lớp. */
  defaultLessonId: string | null;
  /** Mở ngay trình thiết kế sơ đồ tư duy khi vào hộp thoại. */
  startMindMap?: boolean;
  /** Có thì mở ở chế độ sửa tài liệu này (đổi tên, mô tả, loại, vị trí; gỡ hoặc thêm tệp, liên kết). */
  resource?: PinnedResource;
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
export function MaterialModal({ board, defaultLessonId, startMindMap = false, resource, onAdd, onClose }: Props) {
  const editing = !!resource;
  // Tài liệu cũ chưa có danh sách đính kèm mà chỉ có địa chỉ thì coi như một liên kết.
  const [keep, setKeep] = useState<Attachment[]>(() => resource ? (resource.attachments && resource.attachments.length > 0 ? resource.attachments : resource.url && resource.url !== '#' ? [linkToAttachment(resource.url)] : []) : []);
  const [mm, setMm] = useState(startMindMap);
  const [title, setTitle] = useState(resource?.title ?? '');
  const [description, setDescription] = useState(resource?.description ?? '');
  const [badge, setBadge] = useState(resource?.badge ?? '');
  const [color, setColor] = useState(resource?.color ?? '');
  const [steps, setSteps] = useState((resource?.steps ?? []).join('\n'));
  // Tên nút cho từng tệp / liên kết mới, khóa theo tệp (tên + dung lượng) hoặc địa chỉ liên kết.
  const [labels, setLabels] = useState<Record<string, string>>({});
  const fileKey = (f: File): string => `f:${f.name}:${f.size}`;
  const [kind, setKind] = useState<ResourceKind | 'auto'>(resource?.kind ?? 'auto');
  const [lessonId, setLessonId] = useState(resource?.lessonId ?? defaultLessonId ?? '');
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
      const p = validateFile(f, true, gatewayOf(board.settings) ? DRIVE_MAX_BYTES : undefined);
      if (p) { problems.push(`${f.name}: ${p}`); continue; }
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      if (next.length + links.length + keep.length >= MAX_ITEMS) { problems.push(`Tối đa ${MAX_ITEMS} tệp / liên kết cho mỗi tài liệu.`); break; }
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
    if (files.length + links.length + keep.length === 0) { setError('Tài liệu cần ít nhất một tệp hoặc một liên kết.'); return; }
    setBusy(true);
    try { await onAdd({
        title, description, kind, lessonId: lessonId || null, files, links, keep: editing ? keep : undefined, badge, color, steps,
        fileLabels: files.map((f) => labels[fileKey(f)] ?? ''), linkLabels: links.map((l) => labels[`l:${l}`] ?? ''),
      }); }
    catch (err) { setError(err instanceof Error ? err.message : 'Không thêm được tài liệu.'); setBusy(false); }
  };

  const mindMapDone = (f: File): void => {
    addFiles([f]);
    if (!title.trim()) setTitle('Sơ đồ tư duy');
    if (kind === 'auto') setKind('sample');
    setMm(false);
  };

  return (
    <ModalShell title={editing ? 'Sửa tài liệu' : 'Thêm tài liệu'} onClose={onClose} maxWidth="max-w-3xl" large>
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="mt-badge" className="field-label">Nhãn nhỏ <span className="font-normal text-ink-2">(không bắt buộc)</span></label>
            <input id="mt-badge" className="input" value={badge} maxLength={60} onChange={(e) => setBadge(e.target.value)} placeholder="Ví dụ: Nhanh nhất · cần thẻ Kỹ năng" />
          </div>
          <div>
            <p className="field-label">Màu thẻ</p>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Màu thẻ">
              <button type="button" aria-pressed={color === ''} onClick={() => setColor('')} className={`btn btn-sm border-[1.5px] ${color === '' ? 'border-brand-600 bg-brand-50' : 'border-brand-200 bg-white'}`}>Tự động</button>
              {CARD_COLORS.map((c) => (
                <button key={c.id} type="button" aria-label={`Màu ${c.label}`} title={c.label} aria-pressed={color === c.id} onClick={() => setColor(c.id)}
                  className={`h-8 w-8 rounded-full border-2 transition duration-150 ${color === c.id ? 'scale-110 border-ink' : 'border-white shadow'}`} style={{ background: c.btn }} />
              ))}
            </div>
          </div>
        </div>
        <div>
          <label htmlFor="mt-desc" className="field-label">Mô tả ngắn <span className="font-normal text-ink-2">(dùng **chữ đậm** và `mã` nếu cần)</span></label>
          <textarea id="mt-desc" rows={2} className="input min-h-[64px] py-2" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label htmlFor="mt-steps" className="field-label">Các bước hướng dẫn <span className="font-normal text-ink-2">(mỗi dòng một bước, không bắt buộc)</span></label>
          <textarea id="mt-steps" rows={4} className="input min-h-[96px] py-2" value={steps} onChange={(e) => setSteps(e.target.value)}
            placeholder={'Tải **1 tệp .rar**, giải nén ra, đọc PDF\nKỹ năng → Tạo → Tải lên, chọn `SKILL.md`\nGõ `@tro-ly-giao-vien`'} />
        </div>

        {editing && (
          <div>
            <p className="field-label">Tệp và liên kết đang có <span className="font-normal text-ink-2">({keep.length})</span></p>
            {keep.length === 0 ? <p className="text-sm text-ink-3">Đã gỡ hết. Hãy thêm tệp hoặc liên kết mới bên dưới.</p> : (
              <ul className="space-y-1">
                {keep.map((a, i) => (
                  <li key={`${a.name}-${i}`} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-brand-100">
                    <span className="min-w-0 flex-1 truncate">{a.name} <span className="text-xs text-ink-2">· {a.type === 'link' || a.type === 'embed' ? 'Liên kết' : a.size ? formatSize(a.size) : 'Tệp'}</span></span>
                    <input aria-label={`Tên nút cho ${a.name}`} className="input !min-h-[36px] !w-44 !text-sm" placeholder={a.type === 'link' || a.type === 'embed' ? 'Tên nút (Mở liên kết)' : 'Tên nút (Tải về)'} value={a.label ?? ''}
                      onChange={(e) => setKeep((k) => k.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                    <button type="button" aria-label={`Gỡ ${a.name}`} onClick={() => setKeep((k) => k.filter((_, j) => j !== i))} className="btn-ghost btn-sm !px-2"><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop} className="rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/60 p-3">
          <input ref={input} type="file" multiple accept={ACCEPT_ATTR_TEACHER} onChange={onPick} className="sr-only" aria-label="Chọn tệp tài liệu" />
          <button type="button" onClick={() => setMm(true)} className="btn-primary mb-2 w-full"><Network className="h-4 w-4" aria-hidden /> Tạo sơ đồ tư duy ngay trên bảng</button>
          <button type="button" onClick={() => input.current?.click()} className="btn-ghost w-full"><Upload className="h-4 w-4" aria-hidden /> {editing ? 'Thêm tệp mới' : 'Tải nhiều tệp'} (hoặc kéo thả vào đây)</button>
          <p className="mt-1 text-center text-xs text-ink-2">Word, Excel, PowerPoint, PDF, ảnh, âm thanh, video, tệp nén (.zip, .rar, .7z) · tối đa 50 MB mỗi tệp{gatewayOf(board.settings) ? ' (cổng Drive đang bật: tệp lớn tới 1 GB sẽ được gửi thẳng lên Drive của bạn, có thể mất vài phút)' : '; tệp lớn hơn: kết nối cổng Google Drive hoặc dán liên kết Drive / YouTube'}</p>
          {files.length > 0 && (
            <ul className="mt-2 space-y-1">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-brand-100">
                  <span className="min-w-0 flex-1 truncate">{f.name} <span className="text-xs text-ink-2">· {formatSize(f.size)}</span></span>
                  <input aria-label={`Tên nút cho ${f.name}`} className="input !min-h-[36px] !w-44 !text-sm" placeholder="Tên nút (Tải về)" value={labels[fileKey(f)] ?? ''} onChange={(e) => setLabels((m) => ({ ...m, [fileKey(f)]: e.target.value }))} />
                  <button type="button" aria-label={`Bỏ ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="btn-ghost btn-sm !px-2"><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label htmlFor="mt-links" className="field-label"><Link2 className="mr-1 inline h-4 w-4" aria-hidden />Liên kết <span className="font-normal text-ink-2">(mỗi dòng một liên kết: YouTube, Drive, Canva…)</span></label>
          <textarea id="mt-links" className="input min-h-[72px] py-2" value={linkText} onChange={(e) => setLinkText(e.target.value)} placeholder="https://…" />
          {links.length > 0 && (
            <ul className="mt-2 space-y-1">
              {links.map((l) => (
                <li key={l} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-brand-100">
                  <span className="min-w-0 flex-1 truncate">{l}</span>
                  <input aria-label={`Tên nút cho ${l}`} className="input !min-h-[36px] !w-44 !text-sm" placeholder="Tên nút (Mở liên kết)" value={labels[`l:${l}`] ?? ''} onChange={(e) => setLabels((m) => ({ ...m, [`l:${l}`]: e.target.value }))} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-ink-2">Nút đầu tiên của thẻ là nút chính. Người học xem trực tiếp trong trang hoặc tải về bằng nút.</p>
        {error && <p role="alert" className="text-sm font-bold text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Hủy</button>
          <button type="submit" disabled={busy} className="btn-primary">{busy ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Thêm tài liệu'}</button>
        </div>
      </form>
      {mm && <MindMapEditor title={title.trim() || 'Sơ đồ tư duy'} rootText={title.trim() || 'Ý chính'} onDone={mindMapDone} onClose={() => setMm(false)} />}
    </ModalShell>
  );
}
