import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import {
  BarChart3, Camera, ClipboardPaste, FileText, Link2, MapPin, Mic, MonitorUp, Network, PenLine, Plus, Trash2, Upload, Video, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ACCEPT_ATTR, DOC_LABEL, attachmentTypeOf, docKindOf, formatSize } from '../../lib/media';
import { linkToAttachment, normalizeLink } from '../../lib/embeds';
import { MAX_ATTACHMENTS } from '../../hooks/usePostDraft';
import { CameraCapture } from './CameraCapture';
import { RecorderPanel } from './RecorderPanel';
import type { RecorderKind } from './RecorderPanel';
import { DrawingPad } from './DrawingPad';
import { MindMapEditor } from '../mindmap/MindMapEditor';
import type { CardLocation } from '../../types/board';

// Bản đồ chỉ nạp khi người dùng bấm “Vị trí”.
const LocationPicker = lazy(() => import('./LocationPicker'));

interface Props {
  files: File[];
  links: string[];
  poll: string[] | null;
  location: CardLocation | null;
  onLocation: (l: CardLocation | null) => void;
  error: string;
  onAddFiles: (f: File[]) => void;
  onRemoveFile: (i: number) => void;
  onAddLinks: (u: string[]) => void;
  onRemoveLink: (i: number) => void;
  onPoll: (p: string[] | null) => void;
  /** Dữ liệu từ kéo thả / nút Dán: tệp + văn bản. */
  onIngest: (files: File[], text: string) => void;
  /** Số đính kèm đã có sẵn ngoài danh sách này (khi sửa bài), tính vào giới hạn 10. */
  extraCount?: number;
  /** Ẩn bớt công cụ (khi sửa bài không đổi được thăm dò và vị trí). */
  hideTools?: Tool[];
  /** Tiêu đề khung (mặc định "Đính kèm") và có bắt buộc hay không (ẩn chữ "không bắt buộc"). */
  label?: string;
  required?: boolean;
}

export type Tool = 'camera' | 'video' | 'audio' | 'screen' | 'draw' | 'mindmap' | 'link' | 'poll' | 'location';

const TOOLS: { id: Tool | 'file'; label: string; Icon: LucideIcon }[] = [
  { id: 'file', label: 'Tải nhiều tệp', Icon: Upload },
  { id: 'camera', label: 'Chụp ảnh', Icon: Camera },
  { id: 'video', label: 'Quay video', Icon: Video },
  { id: 'audio', label: 'Ghi âm', Icon: Mic },
  { id: 'screen', label: 'Quay màn hình', Icon: MonitorUp },
  { id: 'draw', label: 'Vẽ', Icon: PenLine },
  { id: 'link', label: 'Dán liên kết', Icon: Link2 },
  { id: 'poll', label: 'Thăm dò', Icon: BarChart3 },
  { id: 'location', label: 'Vị trí', Icon: MapPin },
];

/** Kiểu chung của các ô công cụ đính kèm. */
const TILE = 'flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl border-[1.5px] border-brand-200 bg-white px-1 py-2 text-[11px] font-bold leading-tight text-brand-800 transition duration-150 hover:-translate-y-0.5 hover:border-brand-400 hover:bg-brand-50 sm:text-xs [@media(min-height:800px)_and_(min-width:640px)]:min-h-[84px] [@media(min-height:800px)_and_(min-width:640px)]:text-sm';

const TYPE_LABEL: Record<string, string> = { image: 'Ảnh', video: 'Video', audio: 'Âm thanh', file: 'Tệp' };

function FileRow({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState('');
  const kind = attachmentTypeOf(file);
  useEffect(() => {
    if (kind !== 'image' && kind !== 'video') return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file, kind]);
  return (
    <li className="flex items-center gap-3 rounded-xl bg-white p-2 ring-1 ring-brand-100">
      {kind === 'image' && url ? <img src={url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
        : kind === 'video' && url ? <video src={`${url}#t=0.1`} muted playsInline preload="metadata" className="h-12 w-12 shrink-0 rounded-lg bg-ink object-cover" />
          : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">{kind === 'audio' ? <Mic className="h-5 w-5" aria-hidden /> : <FileText className="h-5 w-5" aria-hidden />}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{file.name}</span>
        <span className="block text-xs text-ink-2">{kind === 'file' ? DOC_LABEL[docKindOf({ name: file.name, mime: file.type })] : TYPE_LABEL[kind]} · {formatSize(file.size)}</span>
      </span>
      <button type="button" onClick={onRemove} aria-label={`Gỡ ${file.name}`} className="btn-ghost btn-sm !px-2.5"><Trash2 className="h-4 w-4" aria-hidden /></button>
    </li>
  );
}

/**
 * Bộ đính kèm: MỘT bài có thể chứa cùng lúc nhiều tệp (ảnh, video, tài liệu), ảnh chụp, hình vẽ, nhiều liên kết,
 * kèm văn bản và một thăm dò. Có thể chọn tệp, kéo thả, hoặc dán (Ctrl+V / nút Dán) ảnh, liên kết, đoạn văn.
 */
export function AttachmentPicker({ files, links, poll, location, onLocation, error, onAddFiles, onRemoveFile, onAddLinks, onRemoveLink, onPoll, onIngest, extraCount = 0, hideTools = [], label = 'Đính kèm', required = false }: Props) {
  const [tool, setTool] = useState<Tool | null>(null);
  const [dragging, setDragging] = useState(false);
  const [msg, setMsg] = useState('');
  const [linkText, setLinkText] = useState('');
  const [options, setOptions] = useState<string[]>(poll ?? ['', '']);
  const inputRef = useRef<HTMLInputElement>(null);
  const own = files.length + links.length;
  const count = own + extraCount;
  const full = count >= MAX_ATTACHMENTS;

  const take = (f: File): void => { onAddFiles([f]); setTool(null); };

  const pick = (id: Tool | 'file'): void => {
    setMsg('');
    if (id !== 'file') setTool(id);
  };

  const pasteFromClipboard = async (): Promise<void> => {
    setMsg('');
    try {
      const picked: File[] = [];
      let text = '';
      if (navigator.clipboard?.read) {
        for (const item of await navigator.clipboard.read()) {
          for (const type of item.types) {
            if (type.startsWith('image/')) picked.push(new File([await item.getType(type)], `image.${type.split('/')[1] || 'png'}`, { type }));
            else if (type === 'text/plain') text += `${text ? '\n' : ''}${await (await item.getType(type)).text()}`;
          }
        }
      } else {
        text = await navigator.clipboard.readText();
      }
      if (picked.length === 0 && !text.trim()) { setMsg('Bộ nhớ tạm đang trống. Hãy sao chép ảnh, đoạn văn hoặc liên kết trước.'); return; }
      onIngest(picked, text);
    } catch {
      setMsg('Trình duyệt không cho đọc bộ nhớ tạm. Hãy bấm vào form rồi nhấn Ctrl+V (trên điện thoại: chạm giữ để dán).');
    }
  };

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault();
    setDragging(false);
    const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    onIngest(Array.from(e.dataTransfer.files), text);
  };

  let panel: React.ReactNode = null;
  const mindmap = tool === 'mindmap' ? <MindMapEditor title="Sơ đồ tư duy của em" rootText="Ý chính" onDone={take} onClose={() => setTool(null)} /> : null;
  if (tool === 'camera') panel = <CameraCapture onCapture={take} onClose={() => setTool(null)} />;
  else if (tool === 'video' || tool === 'audio' || tool === 'screen') panel = <RecorderPanel kind={tool as RecorderKind} onDone={take} onClose={() => setTool(null)} />;
  else if (tool === 'draw') panel = <DrawingPad onDone={take} onClose={() => setTool(null)} />;
  else if (tool === 'location') {
    panel = (
      <Suspense fallback={<p role="status" className="py-8 text-center text-ink-2">Đang mở bản đồ…</p>}>
        <LocationPicker value={location} onChange={onLocation} onClose={() => setTool(null)} />
      </Suspense>
    );
  } else if (tool === 'link') {
    const first = normalizeLink(linkText.trim().split(/\s+/)[0] ?? '');
    const rec = first ? linkToAttachment(first) : null;
    const badLink = !!rec && rec.type === 'link' && !rec.url;
    panel = (
      <div className="space-y-2">
        <label htmlFor="ap-link" className="field-label">Dán một hoặc nhiều liên kết</label>
        <textarea id="ap-link" rows={2} className="input min-h-[64px] py-2" value={linkText} autoFocus onChange={(e) => setLinkText(e.target.value)}
          placeholder="YouTube, Google Drive, Slides, Spotify hoặc trang web… (mỗi liên kết một dòng)" />
        {rec && badLink && <p className="text-xs font-bold text-rose-700" role="status">Chưa phải liên kết. Em hãy dán địa chỉ trang web (ví dụ: https://www.youtube.com/…).</p>}
        {rec && !badLink && <p className="text-xs font-bold text-emerald-700" role="status">{rec.type === 'embed' ? `Nhận dạng: ${rec.name} — sẽ phát/xem ngay trong bài.` : `Liên kết trang web: ${rec.name}`}</p>}
        <div className="flex justify-between gap-2">
          <button type="button" onClick={() => { setTool(null); setLinkText(''); }} className="btn-ghost btn-sm">Đóng</button>
          <button type="button" disabled={!linkText.trim()} onClick={() => { onAddLinks(linkText.split(/\s+/)); setLinkText(''); setTool(null); }} className="btn-primary btn-sm">Thêm liên kết</button>
        </div>
      </div>
    );
  } else if (tool === 'poll') {
    const labels = options.map((o) => o.trim()).filter(Boolean);
    const valid = labels.length >= 2 && new Set(labels.map((l) => l.toLowerCase())).size === labels.length;
    panel = (
      <div className="space-y-2">
        <p className="text-sm font-bold">Thăm dò ý kiến <span className="font-normal text-ink-2">· dùng “Tiêu đề” ở trên làm câu hỏi</span></p>
        {options.map((o, i) => (
          <div key={i} className="flex gap-2">
            <input className="input" value={o} maxLength={80} aria-label={`Lựa chọn ${i + 1}`} placeholder={`Lựa chọn ${i + 1}`}
              onChange={(e) => setOptions((l) => l.map((x, j) => (j === i ? e.target.value : x)))} />
            {options.length > 2 && <button type="button" aria-label={`Xóa lựa chọn ${i + 1}`} onClick={() => setOptions((l) => l.filter((_, j) => j !== i))} className="btn-ghost btn-sm !px-2.5"><X className="h-4 w-4" /></button>}
          </div>
        ))}
        {options.length < 6 && <button type="button" onClick={() => setOptions((l) => [...l, ''])} className="btn-ghost btn-sm"><Plus className="h-4 w-4" aria-hidden /> Thêm lựa chọn</button>}
        {!valid && labels.length >= 2 && <p className="text-xs font-bold text-rose-700" role="alert">Các lựa chọn không được trùng nhau.</p>}
        <div className="flex justify-between gap-2">
          <button type="button" onClick={() => setTool(null)} className="btn-ghost btn-sm">Đóng</button>
          <button type="button" disabled={!valid} onClick={() => { onPoll(labels); setTool(null); }} className="btn-primary btn-sm">Dùng thăm dò</button>
        </div>
      </div>
    );
  }

  return (
    <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
      className={`rounded-2xl border-2 border-dashed p-3 transition duration-150 ${dragging ? 'border-brand-600 bg-brand-50' : 'border-brand-200 bg-brand-50/40'}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="field-label !mb-0">{label}{required ? ' *' : ''} <span className="font-normal text-ink-2">({count}/{MAX_ATTACHMENTS}{required ? '' : ', không bắt buộc'})</span></span>
        <button type="button" onClick={() => void pasteFromClipboard()} className="btn-ghost btn-sm"><ClipboardPaste className="h-3.5 w-3.5" aria-hidden /> Dán từ bộ nhớ tạm</button>
      </div>

      {mindmap}
      {panel ? <div className="rounded-2xl bg-white/70 p-3">{panel}</div> : (
        <>
          {!hideTools.includes('mindmap') && <button type="button" disabled={full} onClick={() => pick('mindmap')} className="btn-primary mb-3 !min-h-[56px] w-full !rounded-2xl text-base"><Network className="h-6 w-6" aria-hidden /> Vẽ sơ đồ tư duy ngay tại đây</button>}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {TOOLS.filter((t) => t.id === 'file' || !hideTools.includes(t.id)).map(({ id, label, Icon }) => {
              const disabled = full && id !== 'poll';
              const icon = <Icon className="h-5 w-5 [@media(min-height:800px)_and_(min-width:640px)]:h-7 [@media(min-height:800px)_and_(min-width:640px)]:w-7" aria-hidden />;
              if (id === 'file') {
                return (
                  <label key={id} className={`${TILE} cursor-pointer focus-within:ring-2 focus-within:ring-brand-500 ${full ? 'pointer-events-none opacity-40' : ''}`}>
                    <input ref={inputRef} type="file" multiple className="sr-only" accept={ACCEPT_ATTR} disabled={full} aria-label="Tải nhiều tệp"
                      onChange={(e) => { const list = Array.from(e.target.files ?? []); if (list.length) onAddFiles(list); e.target.value = ''; }} />
                    {icon}
                    <span className="text-center">{label}</span>
                  </label>
                );
              }
              return (
                <button key={id} type="button" disabled={(disabled && id !== 'location') || (id === 'poll' && !!poll)} onClick={() => pick(id)} className={`${TILE} disabled:opacity-40`}>
                  {icon}
                  <span className="text-center">{label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-ink-2">Kéo thả vào đây, hoặc nhấn <kbd className="rounded bg-white px-1 ring-1 ring-brand-200">Ctrl</kbd>+<kbd className="rounded bg-white px-1 ring-1 ring-brand-200">V</kbd> để dán ảnh, liên kết, đoạn văn. Có thể gửi cùng lúc ảnh, video, liên kết và văn bản.</p>
        </>
      )}

      {(own > 0 || poll || location) && (
        <ul className="mt-3 space-y-2" aria-label="Danh sách đính kèm">
          {files.map((f, i) => <FileRow key={`${f.name}-${f.size}-${f.lastModified}`} file={f} onRemove={() => onRemoveFile(i)} />)}
          {links.map((l, i) => {
            const a = linkToAttachment(l);
            return (
              <li key={l} className="flex items-center gap-3 rounded-xl bg-white p-2 ring-1 ring-brand-100">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-800"><Link2 className="h-5 w-5" aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{a.name}</span>
                  <span className="block truncate text-xs text-ink-2">{a.type === 'embed' ? 'Sẽ nhúng trong bài · ' : ''}{l}</span>
                </span>
                <button type="button" onClick={() => onRemoveLink(i)} aria-label={`Gỡ liên kết ${a.name}`} className="btn-ghost btn-sm !px-2.5"><Trash2 className="h-4 w-4" aria-hidden /></button>
              </li>
            );
          })}
          {location && (
            <li className="flex items-center gap-3 rounded-xl bg-white p-2 ring-1 ring-brand-100">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800"><MapPin className="h-5 w-5" aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{location.name ?? 'Vị trí trên bản đồ'}</span>
                <span className="block text-xs text-ink-2">{location.lat}, {location.lng}</span>
              </span>
              <button type="button" onClick={() => onLocation(null)} aria-label="Gỡ vị trí" className="btn-ghost btn-sm !px-2.5"><Trash2 className="h-4 w-4" aria-hidden /></button>
            </li>
          )}
          {poll && (
            <li className="flex items-center gap-3 rounded-xl bg-white p-2 ring-1 ring-brand-100">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-800"><BarChart3 className="h-5 w-5" aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">Thăm dò ý kiến · {poll.length} lựa chọn</span>
                <span className="block truncate text-xs text-ink-2">{poll.join(' / ')}</span>
              </span>
              <button type="button" onClick={() => onPoll(null)} aria-label="Gỡ thăm dò" className="btn-ghost btn-sm !px-2.5"><Trash2 className="h-4 w-4" aria-hidden /></button>
            </li>
          )}
        </ul>
      )}

      {(error || msg) && <p role="alert" className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error || msg}</p>}
    </div>
  );
}
