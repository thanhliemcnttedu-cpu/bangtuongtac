import { useState } from 'react';
import { renderRich } from '../lib/richText';
import type { DragEvent } from 'react';
import {
  BarChart3, BookOpen, CalendarClock, ChevronDown, ChevronLeft, ChevronRight, Download, ExternalLink, Eye, FileText, GripVertical, Image as ImageIcon, Link2, ListChecks, Mic, Network, Paperclip, Pencil, Plus, Presentation,
  QrCode, Sparkles, Trash2, Users, Video, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Attachment, BoardData, Lesson, PinnedResource, ResourceKind, TaskItem } from '../types/board';
import { KIND_LABEL, URGENCY_TEXT, countdown, formatDateTime, groupTasks, taskPhase, taskProgress, timeElapsed, urgencyOf, wordsFor } from '../lib/lessons';
import { MaterialReader } from './MaterialReader';
import { TaskDocs } from './TaskDocs';
import { docKindOf, formatSize } from '../lib/media';
import { colorOf } from '../lib/cardColors';
import { renderMarkup } from '../lib/markup';

export interface LessonsPanelActions {
  onAddLesson: () => void;
  onEditLesson: (l: Lesson) => void;
  onDeleteLesson: (l: Lesson) => void;
  onAddTask: (lessonId: string | null) => void;
  onEditTask: (t: TaskItem) => void;
  /** Tổ công tác: mở link và mã QR riêng của công việc. */
  onShareTask?: (t: TaskItem) => void;
  /** Tổ công tác: mở báo cáo ngắn (đã nộp, chưa nộp, nhắc, tải minh chứng). */
  onReportTask?: (t: TaskItem) => void;
  /** Tổ công tác: mở hộp nhập danh sách thành viên. */
  onRoster?: () => void;
  /** Tổ công tác: tổng hợp tuần / tháng. */
  onPeriodReport?: () => void;
  onDeleteTask: (t: TaskItem) => void;
  onAddMaterial: (lessonId: string | null, opts?: { mindmap?: boolean }) => void;
  onDeleteMaterial: (r: PinnedResource) => void;
  onEditMaterial: (r: PinnedResource) => void;
  /** Giáo viên kéo thả: danh sách mã tài liệu theo thứ tự mới (trong cùng một nhóm). */
  onReorderMaterials?: (ids: string[]) => void;
  /** Học sinh bấm "Nộp bài" ở một bài tập: mở form nộp với bài tập đã chọn. */
  onSubmitTo: (taskId: string) => void;
  /** Lọc danh sách bài nộp theo bài tập. */
  onViewSubmissions: (taskId: string) => void;
}

interface Props {
  board: BoardData;
  canManage: boolean;
  /** Học sinh / học viên có đang được nộp bài không (link nhận bài, bảng chưa đóng). */
  canSubmit: boolean;
  now: number;
  actions: LessonsPanelActions;
}

const KIND: Record<ResourceKind, { label: string; icon: LucideIcon; tone: string }> = {
  pdf: { label: 'Tài liệu PDF', icon: FileText, tone: 'bg-rose-100 text-rose-700' },
  slide: { label: 'Slide', icon: Presentation, tone: 'bg-amber-100 text-amber-800' },
  video: { label: 'Video', icon: Video, tone: 'bg-violet-100 text-violet-700' },
  link: { label: 'Liên kết', icon: Link2, tone: 'bg-sky-100 text-sky-800' },
  sample: { label: 'Bài mẫu', icon: Sparkles, tone: 'bg-teal2-100 text-teal2-700' },
  file: { label: 'Tệp đính kèm', icon: Paperclip, tone: 'bg-slate-100 text-slate-700' },
  audio: { label: 'Âm thanh', icon: Mic, tone: 'bg-fuchsia-100 text-fuchsia-700' },
  image: { label: 'Hình ảnh', icon: ImageIcon, tone: 'bg-emerald-100 text-emerald-700' },
};

/** Vạch màu trên đầu thẻ theo loại tài liệu khi giáo viên chưa chọn màu riêng. */
const KIND_BAR: Record<ResourceKind, string> = {
  pdf: 'linear-gradient(90deg,#e11d48,#fb7185)', slide: 'linear-gradient(90deg,#d97706,#fcd34d)', video: 'linear-gradient(90deg,#7c3aed,#c4b5fd)',
  link: 'linear-gradient(90deg,#0284c7,#7dd3fc)', sample: 'linear-gradient(90deg,#0d9488,#5eead4)', file: 'linear-gradient(90deg,#475569,#94a3b8)',
  audio: 'linear-gradient(90deg,#c026d3,#f0abfc)', image: 'linear-gradient(90deg,#059669,#6ee7b7)',
};

/** Địa chỉ tải về: kho Supabase nhận ?download=<tên> để lưu đúng tên tệp gốc thay vì mã ngẫu nhiên. */
const downloadHref = (url: string, name: string): string => (url.includes('/storage/v1/object/public/') ? `${url}${url.includes('?') ? '&' : '?'}download=${encodeURIComponent(name)}` : url);

const extOf = (name: string): string => { const m = /\.([a-z0-9]{1,6})$/i.exec(name); return m ? `.${m[1].toLowerCase()}` : ''; };

/** Có xem trực tiếp trong trang được không (ảnh, video, âm thanh, nhúng, PDF, Word, Excel, PowerPoint, văn bản). */
const viewable = (a: Attachment): boolean => a.type === 'image' || a.type === 'video' || a.type === 'audio' || a.type === 'embed' || (a.type === 'file' && !['archive', 'other'].includes(docKindOf(a)));

/** Gốc (https://tên-miền) của trang web mà thẻ trỏ tới (liên kết hoặc tài liệu nhúng, không tính tệp trên Drive); không có thì trả về null. */
function siteHost(r: PinnedResource): string | null {
  const a = (r.attachments ?? []).find((x) => (x.type === 'link' || x.type === 'embed') && !x.driveId && x.url);
  const raw = a?.url ?? (!r.attachments?.length && r.url && r.url !== '#' ? r.url : '');
  try { const u = new URL(raw); return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null; } catch { return null; }
}

/**
 * Biểu tượng (favicon) của trang web để học sinh nhận ra phần mềm, trang web. Thử lần lượt: tệp favicon.svg / favicon.ico của chính trang
 * (nhiều trang hiện đại chỉ có SVG, dịch vụ của Google không đọc được SVG và trả về hình quả địa cầu mặc định), rồi dịch vụ favicon của Google;
 * không có cái nào thì dùng biểu tượng loại tài liệu. Ảnh nhỏ 16px từ Google bị coi là hình mặc định vì Google luôn trả cỡ đó khi không tìm thấy.
 */
function SiteIcon({ host: origin, fallback: Fallback }: { host: string; fallback: LucideIcon }) {
  const [i, setI] = useState(0);
  const domain = new URL(origin).hostname.replace(/^www\./, '');
  const sources = [`${origin}/favicon.svg`, `${origin}/favicon.ico`, `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`];
  if (i >= sources.length) return <Fallback className="h-6 w-6" aria-hidden />;
  const google = i === sources.length - 1;
  return (
    <img key={i} src={sources[i]} alt="" loading="lazy" referrerPolicy="no-referrer"
      onError={() => setI(i + 1)}
      onLoad={(e) => { if (google && e.currentTarget.naturalWidth <= 16) setI(i + 1); }}
      className="h-9 w-9 rounded-lg bg-white object-contain" />
  );
}

interface DragProps {
  dragging: boolean; over: boolean; canPrev: boolean; canNext: boolean;
  onDragStart: () => void; onDragEnd: () => void; onDragOver: (e: DragEvent) => void; onDrop: (e: DragEvent) => void; onPrev: () => void; onNext: () => void;
}

/**
 * Thẻ tài liệu theo kiểu thẻ hướng dẫn: vạch màu, biểu tượng, nhãn nhỏ, mô tả, các bước đánh số, rồi các nút do giáo viên đặt tên
 * ("Tải gói Gemini cách A  .rar · 342 KB"). Nút đầu tiên là nút chính (tô màu thẻ), các nút sau viền nhạt.
 */
function MaterialCard({ r, canManage, onOpen, onDelete, onEdit, drag }: { r: PinnedResource; canManage: boolean; onOpen: () => void; onDelete: () => void; onEdit: () => void; drag?: DragProps }) {
  const k = KIND[r.kind];
  const Icon = k.icon;
  const host = siteHost(r);
  const col = colorOf(r.color);
  const atts = r.attachments ?? [];
  const actions = atts.filter((a) => a.url);
  const legacyLink = atts.length === 0 && r.url && r.url !== '#' ? r.url : '';
  const canView = atts.some(viewable) || (atts.length === 0 && !legacyLink);
  const mainStyle = col ? { background: col.btn, color: '#fff', boxShadow: `0 10px 22px -10px ${col.text}` } : undefined;
  // Nút tải ghi tên tệp (để phân biệt ảnh, sơ đồ, slide) kèm dung lượng.
  const note = (a: Attachment): string => (a.type === 'link' || a.type === 'embed' ? a.name : `${a.name || extOf(a.name) || 'tệp'}${a.size ? ` · ${formatSize(a.size)}` : ''}`);
  const photos = atts.filter((a) => a.type === 'image' && a.url && !a.driveId).slice(0, 3);
  return (
    <li onDragOver={drag?.onDragOver} onDrop={drag?.onDrop}
      className={`relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-soft transition duration-200 hover:-translate-y-0.5 hover:shadow-lift ${drag?.over ? 'border-brand-500 ring-4 ring-brand-200' : 'border-teal2-100'} ${drag?.dragging ? 'opacity-40' : ''}`}>
      <span className="h-1.5 w-full" style={{ background: col?.bar ?? KIND_BAR[r.kind] }} aria-hidden />
      <button type="button" onClick={onOpen} className={`flex items-start gap-3 p-3 text-left ${drag ? 'pr-44' : 'pr-16'}`}>
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${col ? '' : k.tone}`} style={col ? { background: col.soft, color: col.text } : undefined}>{host ? <SiteIcon host={host} fallback={Icon} /> : <Icon className="h-6 w-6" aria-hidden />}</span>
        <span className="min-w-0">
          <span className="block text-base font-extrabold leading-snug">{r.title}</span>
          <span className="block text-xs text-ink-2">{k.label}{r.sizeLabel ? ` · ${r.sizeLabel}` : ''}{atts.length > 1 ? ` · ${atts.length} đính kèm` : ''}</span>
        </span>
      </button>
      <div className="flex flex-col gap-2.5 px-3 pb-3">
        {r.badge && <span className="chip w-fit" style={{ background: col?.soft ?? '#e3eeff', color: col?.text ?? '#0b4fd0', boxShadow: 'none' }}>{r.badge}</span>}
        {r.description && <p className="text-sm leading-relaxed text-ink-2">{renderMarkup(r.description)}</p>}
        {r.steps && r.steps.length > 0 && (
          <ol className="space-y-1.5">
            {r.steps.map((st, i) => (
              <li key={i} className="grid grid-cols-[24px_1fr] items-start gap-2 text-sm leading-snug">
                <span className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-extrabold" style={{ background: col?.soft ?? '#e3eeff', color: col?.text ?? '#0b4fd0' }}>{i + 1}</span>
                <span className="pt-0.5">{renderMarkup(st)}</span>
              </li>
            ))}
          </ol>
        )}
        {photos.length > 0 && (
          <button type="button" onClick={onOpen} aria-label={`Xem ảnh của ${r.title}`} className={`grid gap-1.5 ${photos.length === 1 ? 'grid-cols-1' : photos.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {photos.map((a, i) => <img key={`${a.url}-${i}`} src={a.url} alt={a.name} loading="lazy" className={`w-full rounded-xl object-cover ring-1 ring-brand-100 ${photos.length === 1 ? 'h-36' : 'h-20'}`} />)}
          </button>
        )}
      </div>
      <div className="mt-auto flex flex-col gap-1.5 px-3 pb-3">
        {actions.map((a, i) => {
          // Tệp đã nằm trên Drive (có driveId) vẫn là một tệp để tải về, dù được nhúng xem trước.
          const isLink = (a.type === 'link' || a.type === 'embed') && !a.driveId;
          const main = i === 0;
          const cls = main ? (col ? 'btn btn-sm w-full !justify-between' : 'btn-primary btn-sm w-full !justify-between') : 'btn-ghost btn-sm w-full !justify-between';
          return (
            <a key={`${a.url}-${i}`} href={isLink ? a.url : a.driveId ? `https://drive.google.com/uc?export=download&id=${a.driveId}` : downloadHref(a.url as string, a.name)} {...(isLink ? {} : { download: a.name })} target="_blank" rel="noopener noreferrer" className={cls} style={main ? mainStyle : undefined}>
              <span className="flex min-w-0 items-center gap-1.5">{isLink ? <ExternalLink className="h-4 w-4 shrink-0" aria-hidden /> : <Download className="h-4 w-4 shrink-0" aria-hidden />}<span className="truncate">{a.label || (isLink ? 'Mở liên kết' : 'Tải về')}</span></span>
              <span className={`max-w-[50%] shrink-0 truncate text-[11px] font-bold ${main ? 'opacity-90' : 'text-ink-2'}`}>{note(a)}</span>
            </a>
          );
        })}
        {legacyLink && <a href={legacyLink} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm w-full"><ExternalLink className="h-4 w-4" aria-hidden /> Mở liên kết</a>}
        {canView && (
          <button type="button" onClick={onOpen} className={`${actions.length === 0 && !legacyLink ? 'btn-primary' : 'btn-ghost'} btn-sm w-full`}><Eye className="h-4 w-4" aria-hidden /> Xem ngay</button>
        )}
      </div>
      {canManage && (
        <span className="absolute right-1.5 top-3 flex items-center gap-0.5">
          {drag && (
            <>
              <span draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r.id); const li = (e.currentTarget as HTMLElement).closest('li'); if (li) e.dataTransfer.setDragImage(li, 24, 24); drag.onDragStart(); }} onDragEnd={drag.onDragEnd}
                title="Kéo để đổi vị trí" aria-label={`Kéo để đổi vị trí tài liệu ${r.title}`} className="flex h-8 w-8 cursor-grab items-center justify-center rounded-full text-ink-3 transition hover:bg-brand-50 hover:text-brand-700 active:cursor-grabbing">
                <GripVertical className="h-4 w-4" aria-hidden />
              </span>
              <button type="button" onClick={drag.onPrev} disabled={!drag.canPrev} aria-label={`Đưa ${r.title} lên trước`} title="Đưa lên trước" className="flex h-8 w-8 items-center justify-center rounded-full text-ink-3 transition hover:bg-brand-50 hover:text-brand-700 disabled:opacity-30 max-lg:h-11 max-lg:w-11">
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <button type="button" onClick={drag.onNext} disabled={!drag.canNext} aria-label={`Đưa ${r.title} ra sau`} title="Đưa ra sau" className="flex h-8 w-8 items-center justify-center rounded-full text-ink-3 transition hover:bg-brand-50 hover:text-brand-700 disabled:opacity-30 max-lg:h-11 max-lg:w-11">
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </>
          )}
          <button type="button" onClick={onEdit} aria-label={`Sửa tài liệu ${r.title}`} title="Sửa tài liệu" className="flex h-8 w-8 items-center justify-center rounded-full text-ink-3 transition hover:bg-brand-50 hover:text-brand-700">
            <Pencil className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" onClick={onDelete} aria-label={`Gỡ tài liệu ${r.title}`} title="Gỡ tài liệu" className="flex h-8 w-8 items-center justify-center rounded-full text-ink-3 transition hover:bg-rose-50 hover:text-rose-700">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </span>
      )}
    </li>
  );
}


/** Mỗi bài học một màu riêng (vạch trên, nền, số thứ tự, viền bài tập) để học sinh nhỏ dễ phân biệt các bài. */
const PALETTES = [
  { name: 'xanh dương', bar: 'linear-gradient(90deg,#1668f2,#5c9bf8,#1668f2)', box: 'border-brand-300 bg-brand-50/80', num: 'bg-brand-600', text: 'text-brand-700', task: 'border-brand-200 border-l-brand-600', soft: 'bg-brand-100 text-brand-800', tint: 'bg-brand-50/70' },
  { name: 'cam', bar: 'linear-gradient(90deg,#ea580c,#fbbf24,#ea580c)', box: 'border-orange-300 bg-orange-50/80', num: 'bg-orange-500', text: 'text-orange-700', task: 'border-orange-200 border-l-orange-500', soft: 'bg-orange-100 text-orange-900', tint: 'bg-orange-50/70' },
  { name: 'xanh lá', bar: 'linear-gradient(90deg,#16a34a,#86efac,#16a34a)', box: 'border-emerald-300 bg-emerald-50/80', num: 'bg-emerald-600', text: 'text-emerald-700', task: 'border-emerald-200 border-l-emerald-600', soft: 'bg-emerald-100 text-emerald-900', tint: 'bg-emerald-50/70' },
  { name: 'tím', bar: 'linear-gradient(90deg,#7c3aed,#c4b5fd,#7c3aed)', box: 'border-violet-300 bg-violet-50/80', num: 'bg-violet-600', text: 'text-violet-700', task: 'border-violet-200 border-l-violet-600', soft: 'bg-violet-100 text-violet-900', tint: 'bg-violet-50/70' },
  { name: 'hồng', bar: 'linear-gradient(90deg,#e11d48,#fda4af,#e11d48)', box: 'border-rose-300 bg-rose-50/80', num: 'bg-rose-500', text: 'text-rose-700', task: 'border-rose-200 border-l-rose-500', soft: 'bg-rose-100 text-rose-900', tint: 'bg-rose-50/70' },
  { name: 'vàng', bar: 'linear-gradient(90deg,#d97706,#fcd34d,#d97706)', box: 'border-amber-300 bg-amber-50/80', num: 'bg-amber-500', text: 'text-amber-700', task: 'border-amber-200 border-l-amber-500', soft: 'bg-amber-100 text-amber-900', tint: 'bg-amber-50/70' },
] as const;
type Palette = (typeof PALETTES)[number];

function PhaseChip({ task, now }: { task: TaskItem; now: number }) {
  const phase = taskPhase(task, now);
  if (phase === 'scheduled') return <span className="chip bg-slate-100 text-slate-700 ring-slate-200"><CalendarClock className="h-3.5 w-3.5" aria-hidden /> Giao lúc {formatDateTime(task.assignedAt)}</span>;
  if (phase === 'overdue') {
    return task.allowLate
      ? <span className="chip bg-orange-100 text-orange-900 ring-orange-200">Quá hạn · vẫn nộp muộn được</span>
      : <span className="chip bg-rose-100 text-rose-800 ring-rose-200">Đã hết hạn nộp</span>;
  }
  const u = urgencyOf(task, now);
  if (u) {
    const tone = u === 'green' ? 'bg-emerald-100 text-emerald-800 ring-emerald-200' : u === 'amber' ? 'bg-amber-100 text-amber-900 ring-amber-200' : 'bg-rose-100 text-rose-800 ring-rose-200';
    return <span className={`chip ${tone}`}><span className={`h-2.5 w-2.5 rounded-full ${u === 'green' ? 'bg-emerald-500' : u === 'amber' ? 'bg-amber-500' : 'bg-rose-500 animate-pulse'}`} aria-hidden /> {URGENCY_TEXT[u]} · {countdown(task.dueAt, now)}</span>;
  }
  return <span className="chip bg-emerald-100 text-emerald-800 ring-emerald-200">Đang nhận bài{task.dueAt ? ` · ${countdown(task.dueAt, now)}` : ''}</span>;
}

/** Thanh thời gian chia 3 đoạn xanh – vàng – đỏ; con trỏ chỉ lúc này. */
function TimeBar({ task, now }: { task: TaskItem; now: number }) {
  const f = timeElapsed(task, now);
  if (f === null) return null;
  return (
    <div className="mt-2" role="img" aria-label={`Đã trôi ${Math.round(f * 100)}% thời gian. ${URGENCY_TEXT[urgencyOf(task, now) ?? 'green']}`}>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className="absolute inset-y-0 left-0 w-1/3 bg-emerald-300" /><div className="absolute inset-y-0 left-1/3 w-1/3 bg-amber-300" /><div className="absolute inset-y-0 right-0 w-1/3 bg-rose-300" />
        <div className="absolute inset-y-0 w-1 -translate-x-1/2 rounded-full bg-ink shadow" style={{ left: `${f * 100}%` }} />
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-ink-3"><span>{task.assignedAt ? formatDateTime(task.assignedAt) : 'Bắt đầu'}</span><span>Hạn {formatDateTime(task.dueAt)}</span></div>
    </div>
  );
}

/** Giáo viên: bao nhiêu thành viên trong danh sách đã nộp, ai còn chưa nộp. */
function ProgressBlock({ board, task }: { board: BoardData; task: TaskItem }) {
  const p = taskProgress(board, task);
  const [copied, setCopied] = useState(false);
  const copyMissing = async (): Promise<void> => {
    const text = `Chưa nộp “${task.label}”${task.dueAt ? ` (hạn ${formatDateTime(task.dueAt)})` : ''}:\n${p.missing.map((m) => `- ${m.name}${m.unit ? ` (${m.unit})` : ''}`).join('\n')}`;
    try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* không chép được */ }
  };
  if (p.total === 0 && p.outside === 0) return null;
  const pct = p.total === 0 ? 0 : Math.round((p.done.length / p.total) * 100);
  return (
    <div className="mt-2 rounded-xl bg-slate-50 p-2.5 text-xs">
      {p.total > 0 ? (
        <>
          <p className="font-bold text-ink">{p.done.length}/{p.total} thành viên đã nộp{p.missing.length > 0 ? `, ${p.missing.length} chưa nộp` : ' · đủ cả'}{p.outside > 0 ? ` · +${p.outside} ngoài danh sách` : ''}</p>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} /></div>
          {p.missing.length > 0 && (
            <details className="mt-1.5"><summary className="cursor-pointer font-bold text-rose-700">Chưa nộp ({p.missing.length})</summary>
              <button type="button" onClick={() => void copyMissing()} className="btn-ghost btn-sm mt-1">{copied ? 'Đã chép' : 'Chép danh sách để nhắc nhở'}</button>
              <ul className="mt-1 flex flex-wrap gap-1">{p.missing.map((m) => <li key={m.id} className="chip bg-rose-50 text-rose-800 ring-rose-200">{m.name}{m.unit ? ` · ${m.unit}` : ''}</li>)}</ul></details>
          )}
        </>
      ) : <p className="font-bold text-ink">{p.outside} người nộp (chưa có danh sách thành viên)</p>}
    </div>
  );
}

/**
 * Khu vực 1: lớp → bài học (hoặc buổi tập huấn) → tài liệu + bài tập / yêu cầu có hạn nộp và đối tượng được giao.
 * Giáo viên thêm, sửa, xóa; học sinh xem tài liệu ngay trong trang và bấm "Nộp bài" ở đúng bài tập.
 */
export function LessonsPanel({ board, canManage, canSubmit, now, actions }: Props) {
  const w = wordsFor(board.mode, board.settings.scope);
  const [open, setOpen] = useState(true);
  const [viewing, setViewing] = useState<PinnedResource | null>(null);
  const [closedLessons, setClosedLessons] = useState<Record<string, boolean>>({});
  // Kéo thả đổi thứ tự tài liệu: mã tài liệu đang kéo và thẻ đang được rê tới.
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const classMaterials = board.pinned.filter((r) => !r.lessonId || !board.lessons.some((l) => l.id === r.lessonId));
  const groups = groupTasks(board.lessons, board.tasks);
  const looseTasks = groups.find((g) => g.lesson === null)?.tasks ?? [];
  const submissions = (taskId: string): number => board.cards.filter((c) => c.taskId === taskId).length;

  const kid = canSubmit && !canManage;
  const taskRow = (t: TaskItem, pal: Palette = PALETTES[0], ti = 0) => {
    const phase = taskPhase(t, now);
    const mayPost = canSubmit && !canManage && phase !== 'scheduled' && !(phase === 'overdue' && !t.allowLate);
    const targets = t.targetUnits ?? [];
    const team = board.settings.scope === 'team';
    return (
      <li key={t.id} className={`rounded-2xl border-2 border-l-[10px] ${pal.tint} p-3 transition duration-200 hover:-translate-y-0.5 hover:shadow-soft ${kid ? 'sm:p-4' : ''} ${pal.task}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white ${pal.num}`} aria-hidden>{ti + 1}</span>
              <span className={`chip ring-black/5 ${t.kind === 'requirement' ? 'bg-violet-100 text-violet-800 ring-violet-200' : pal.soft}`}>
                <ListChecks className="h-3.5 w-3.5" aria-hidden /> {team ? (t.ackOnly ? 'Chỉ đọc' : t.needsEvidence ? 'Cần minh chứng' : 'Công việc') : KIND_LABEL[t.kind ?? 'assignment']}
              </span>
              <span className={`${kid ? 'text-lg' : 'text-sm'} font-extrabold ${pal.text}`}>{t.label}</span>
            </p>
            {t.instructions && <p className={`mt-1 ${kid ? 'text-base text-ink' : 'text-sm text-ink-2'}`}>{t.instructions}</p>}
            <TaskDocs task={t} />
          </div>
          <PhaseChip task={t} now={now} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-2">
          <span className="chip bg-brand-50 text-ink-2 ring-brand-100"><Users className="h-3.5 w-3.5" aria-hidden /> {targets.length === 0 ? w.everyone : `Giao cho: ${targets.join(', ')}`}</span>
          {t.dueAt && <span className="chip bg-brand-50 text-ink-2 ring-brand-100"><CalendarClock className="h-3.5 w-3.5" aria-hidden /> Hạn: {formatDateTime(t.dueAt)}</span>}
          <span>{submissions(t.id)} bài nộp</span>
        </div>
        <TimeBar task={t} now={now} />
        {canManage && <ProgressBlock board={board} task={t} />}
        <div className="mt-2 flex flex-wrap gap-2">
          {mayPost && <button type="button" onClick={() => actions.onSubmitTo(t.id)} className={kid ? 'btn-primary !min-h-[52px] !px-6 text-base' : 'btn-primary btn-sm'}>{team ? (t.ackOnly ? 'Tôi đã đọc' : 'Nộp minh chứng') : 'Nộp bài'}</button>}
          <button type="button" onClick={() => actions.onViewSubmissions(t.id)} className="btn-ghost btn-sm">Xem bài nộp</button>
          {canManage && (
            <>
              {team && actions.onReportTask && <button type="button" onClick={() => actions.onReportTask?.(t)} className="btn-primary btn-sm"><BarChart3 className="h-3.5 w-3.5" aria-hidden /> Báo cáo</button>}
              {team && actions.onShareTask && <button type="button" onClick={() => actions.onShareTask?.(t)} className="btn-ghost btn-sm"><QrCode className="h-3.5 w-3.5" aria-hidden /> Link & QR</button>}
              <button type="button" onClick={() => actions.onEditTask(t)} className="btn-ghost btn-sm"><Pencil className="h-3.5 w-3.5" aria-hidden /> Sửa</button>
              <button type="button" onClick={() => actions.onDeleteTask(t)} aria-label={`Xóa ${t.label}`} className="btn-ghost btn-sm !px-2.5 hover:!border-rose-300 hover:!text-rose-700"><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
            </>
          )}
        </div>
      </li>
    );
  };

  const materialList = (list: PinnedResource[]) => {
    const ids = list.map((r) => r.id);
    const place = (from: string, to: string): void => {
      const a = ids.indexOf(from); const b = ids.indexOf(to);
      if (a < 0 || b < 0 || a === b) return;
      const next = [...ids]; next.splice(b, 0, next.splice(a, 1)[0]);
      actions.onReorderMaterials?.(next);
    };
    const canDrag = canManage && !!actions.onReorderMaterials && list.length > 1;
    return (
      <ul className="grid grid-cols-1 items-stretch gap-x-4 gap-y-7 sm:grid-cols-2 xl:grid-cols-3 min-[1800px]:grid-cols-4">
        {list.map((r, i) => (
          <MaterialCard key={r.id} r={r} canManage={canManage} onOpen={() => setViewing(r)} onDelete={() => actions.onDeleteMaterial(r)} onEdit={() => actions.onEditMaterial(r)}
            drag={canDrag ? {
              dragging: dragId === r.id, over: overId === r.id && dragId !== null && dragId !== r.id, canPrev: i > 0, canNext: i < list.length - 1,
              onDragStart: () => setDragId(r.id), onDragEnd: () => { setDragId(null); setOverId(null); },
              onDragOver: (e) => { if (dragId && ids.includes(dragId)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (overId !== r.id) setOverId(r.id); } },
              onDrop: (e) => { e.preventDefault(); if (dragId) place(dragId, r.id); setDragId(null); setOverId(null); },
              onPrev: () => place(r.id, ids[i - 1]), onNext: () => place(r.id, ids[i + 1]),
            } : undefined} />
        ))}
      </ul>
    );
  };

  return (
    <section aria-label={w.panel} className="overflow-hidden rounded-3xl border-[1.5px] border-teal2-100 bg-gradient-to-br from-white/90 to-teal2-50/80 shadow-soft backdrop-blur-md">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5">
        <span className="flex items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal2-600 text-white"><BookOpen className="h-5 w-5" aria-hidden /></span>
          <span>
            <span className="block text-base font-extrabold">{w.panel}</span>
            <span className="block text-xs text-ink-2">
              {board.lessons.length} {w.lessonLower} · {board.pinned.length} tài liệu · {board.tasks.length} bài tập / yêu cầu{board.program ? ` · ${board.program}` : ''}
            </span>
          </span>
        </span>
        <span className="btn-ghost btn-sm pointer-events-none">
          {open ? 'Thu gọn' : 'Mở rộng'}
          <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} aria-hidden />
        </span>
      </button>

      <div className={`grid transition-all duration-300 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="space-y-4 px-4 pb-4 sm:px-5">
            {board.goals && <p className="rounded-2xl bg-white/80 p-3 text-sm leading-relaxed text-ink-2">{board.goals}</p>}

            {canManage && (
              <div className="flex flex-wrap gap-2">
                {board.settings.scope === 'team' ? (
                  <>
                    <button type="button" onClick={() => actions.onAddTask(null)} className="btn-primary btn-sm"><Plus className="h-3.5 w-3.5" aria-hidden /> Giao việc</button>
                    <button type="button" onClick={actions.onRoster} className="btn-ghost btn-sm"><Users className="h-3.5 w-3.5" aria-hidden /> Danh sách thành viên ({board.roster.length})</button>
                    <button type="button" onClick={actions.onPeriodReport} className="btn-ghost btn-sm"><BarChart3 className="h-3.5 w-3.5" aria-hidden /> Tổng hợp tuần / tháng</button>
                    <button type="button" onClick={() => actions.onAddMaterial(null)} className="btn-ghost btn-sm"><Paperclip className="h-3.5 w-3.5" aria-hidden /> Thêm tài liệu chung</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={actions.onAddLesson} className="btn-primary btn-sm"><Plus className="h-3.5 w-3.5" aria-hidden /> Thêm {w.lessonLower}</button>
                    <button type="button" onClick={() => actions.onAddTask(null)} className="btn-ghost btn-sm"><ListChecks className="h-3.5 w-3.5" aria-hidden /> Giao bài tập / yêu cầu</button>
                    <button type="button" onClick={() => actions.onAddMaterial(null)} className="btn-ghost btn-sm"><Paperclip className="h-3.5 w-3.5" aria-hidden /> Thêm tài liệu</button>
                    <button type="button" onClick={() => actions.onAddMaterial(null, { mindmap: true })} className="btn-ghost btn-sm"><Network className="h-3.5 w-3.5" aria-hidden /> Tạo sơ đồ tư duy</button>
                  </>
                )}
              </div>
            )}

            {(classMaterials.length > 0 || board.lessons.length === 0) && (
              <div>
                <h3 className="mb-2 text-sm font-extrabold text-teal2-700">{w.common}</h3>
                {classMaterials.length === 0 ? <p className="text-sm text-ink-3">Chưa có tài liệu chung.</p> : materialList(classMaterials)}
              </div>
            )}

            {(board.settings.scope === 'team' ? board.roster.length === 0 || board.tasks.length === 0 : board.lessons.length === 0) && (canManage ? (
              <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Bắt đầu nhanh">
                {[
                  board.settings.scope === 'team'
                    ? { n: 1, t: 'Nhập danh sách thành viên', d: 'Họ tên, vai trò (Tổ trưởng, Bí thư…), Gmail nếu có.', run: actions.onRoster }
                    : { n: 1, t: `Thêm ${w.lessonLower}`, d: `Tạo ${w.lessonLower} đầu tiên của ${w.group}.`, run: actions.onAddLesson },
                  board.settings.scope === 'team'
                    ? { n: 2, t: 'Giao việc', d: 'Đính kèm tài liệu, liên kết khảo sát, đặt hạn và yêu cầu minh chứng.', run: () => actions.onAddTask(null) }
                    : { n: 2, t: 'Giao bài tập / yêu cầu', d: `Đặt hạn nộp, giao ${w.everyone.toLowerCase()} hoặc từng ${w.unit}.`, run: () => actions.onAddTask(null) },
                  { n: 3, t: `Chia sẻ link cho ${w.learner}`, d: 'Bấm “Chia sẻ & QR” ở đầu trang.', run: undefined },
                ].map((x) => (
                  <li key={x.n} className="flex items-start gap-3 rounded-2xl border border-dashed border-teal2-200 bg-white/80 p-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal2-600 text-sm font-extrabold text-white">{x.n}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-extrabold">{x.t}</span>
                      <span className="block text-xs text-ink-2">{x.d}</span>
                      {x.run && <button type="button" onClick={x.run} className="btn-ghost btn-sm mt-2">Làm ngay</button>}
                    </span>
                  </li>
                ))}
              </ol>
            ) : looseTasks.length === 0 && <p className="rounded-2xl bg-white/80 p-3 text-sm text-ink-3">{board.settings.scope === 'team' ? 'Tổ trưởng chưa giao việc nào.' : `Giáo viên chưa đăng ${w.lessonLower} nào.`}</p>)}

            {groups.filter((g) => g.lesson !== null).map(({ lesson, tasks }, idx) => {
              if (!lesson) return null;
              const pal = PALETTES[idx % PALETTES.length];
              const mats = board.pinned.filter((r) => r.lessonId === lesson.id);
              const collapsed = !!closedLessons[lesson.id];
              return (
                <article key={lesson.id} style={{ ['--bar' as string]: pal.bar }} className={`rounded-3xl border-2 p-3 pt-4 sm:p-4 sm:pt-5 ${pal.box}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <button type="button" aria-expanded={!collapsed} onClick={() => setClosedLessons((m) => ({ ...m, [lesson.id]: !collapsed }))} className="flex min-w-0 items-start gap-2 text-left">
                      {!(board.settings.scope === 'lesson' && board.lessons.length === 1) && <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base font-extrabold text-white shadow-soft ${pal.num}`} aria-hidden>{idx + 1}</span>}
                      <ChevronDown className={`mt-2 h-4 w-4 shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''}`} aria-hidden />
                      <span className="min-w-0">
                        <span className={`block ${kid ? 'text-xl' : 'text-base'} font-extrabold ${pal.text}`}>{lesson.title}</span>
                        {(lesson.startsAt || lesson.endsAt) && (
                          <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-2"><CalendarClock className="h-3.5 w-3.5" aria-hidden /> {formatDateTime(lesson.startsAt)}{lesson.endsAt ? ` – ${formatDateTime(lesson.endsAt)}` : ''}</span>
                        )}
                        {/* Mục đích / nội dung của bài: chữ to, đậm, màu theo bài để học sinh nhìn là biết hôm nay học gì. */}
                        {lesson.description && <span className={`mt-1.5 block rounded-xl bg-white/80 px-3 py-1.5 font-bold leading-snug ring-1 ring-black/5 ${kid ? 'text-xl' : 'text-lg'} ${pal.text}`}>{renderRich(lesson.description)}</span>}
                      </span>
                    </button>
                    {canManage && (
                      <span className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => actions.onAddMaterial(lesson.id)} className="btn-ghost btn-sm"><Paperclip className="h-3.5 w-3.5" aria-hidden /> Tài liệu</button>
                        <button type="button" onClick={() => actions.onAddMaterial(lesson.id, { mindmap: true })} className="btn-ghost btn-sm"><Network className="h-3.5 w-3.5" aria-hidden /> Sơ đồ tư duy</button>
                        <button type="button" onClick={() => actions.onAddTask(lesson.id)} className="btn-ghost btn-sm"><ListChecks className="h-3.5 w-3.5" aria-hidden /> Giao bài</button>
                        <button type="button" onClick={() => actions.onEditLesson(lesson)} aria-label={`Sửa ${lesson.title}`} className="btn-ghost btn-sm !px-2.5"><Pencil className="h-3.5 w-3.5" aria-hidden /></button>
                        <button type="button" onClick={() => actions.onDeleteLesson(lesson)} aria-label={`Xóa ${lesson.title}`} className="btn-ghost btn-sm !px-2.5 hover:!border-rose-300 hover:!text-rose-700"><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
                      </span>
                    )}
                  </div>
                  {!collapsed && (
                    <div className="mt-3 space-y-3">
                      {mats.length > 0 && <div><h4 className={`mb-2 inline-block rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wide ${pal.soft}`}>Tài liệu</h4>{materialList(mats)}</div>}
                      <div>
                        <h4 className={`mb-2 inline-block rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wide ${pal.soft}`}>Bài tập & yêu cầu</h4>
                        {tasks.length === 0 ? <p className="text-sm text-ink-3">Chưa có bài tập hoặc yêu cầu.</p> : <ul className="space-y-3">{tasks.map((t, ti) => taskRow(t, PALETTES[(idx + 1 + ti) % PALETTES.length], ti))}</ul>}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}

            {looseTasks.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-extrabold text-brand-700">{board.settings.scope === 'team' ? 'Công việc của tổ' : `Bài tập & yêu cầu chưa xếp vào ${w.lessonLower}`}</h3>
                <ul className="space-y-3">{looseTasks.map((t, ti) => taskRow(t, PALETTES[ti % PALETTES.length], ti))}</ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {viewing && <MaterialReader resource={viewing} onClose={() => setViewing(null)} />}
    </section>
  );
}
