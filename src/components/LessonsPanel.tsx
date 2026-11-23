import { useState } from 'react';
import {
  BookOpen, CalendarClock, ChevronDown, ExternalLink, FileText, Image as ImageIcon, Link2, ListChecks, Mic, Network, Paperclip, Pencil, Plus, Presentation,
  Sparkles, Trash2, Users, Video, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { BoardData, Lesson, PinnedResource, ResourceKind, TaskItem } from '../types/board';
import { KIND_LABEL, countdown, formatDateTime, groupTasks, taskPhase, wordsFor } from '../lib/lessons';
import { MaterialReader } from './MaterialReader';

export interface LessonsPanelActions {
  onAddLesson: () => void;
  onEditLesson: (l: Lesson) => void;
  onDeleteLesson: (l: Lesson) => void;
  onAddTask: (lessonId: string | null) => void;
  onEditTask: (t: TaskItem) => void;
  onDeleteTask: (t: TaskItem) => void;
  onAddMaterial: (lessonId: string | null, opts?: { mindmap?: boolean }) => void;
  onDeleteMaterial: (r: PinnedResource) => void;
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

function MaterialCard({ r, canManage, onOpen, onDelete }: { r: PinnedResource; canManage: boolean; onOpen: () => void; onDelete: () => void }) {
  const k = KIND[r.kind];
  const Icon = k.icon;
  return (
    <li className="relative">
      <button type="button" onClick={onOpen} className="group flex h-full w-full items-start gap-3 rounded-2xl border border-teal2-100 bg-white p-3 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-lift">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${k.tone}`}><Icon className="h-6 w-6" aria-hidden /></span>
        <span className="min-w-0 pr-6">
          <span className="block text-xs font-bold text-teal2-700">{k.label}{r.sizeLabel ? ` · ${r.sizeLabel}` : ''}{r.attachments && r.attachments.length > 1 ? ` · ${r.attachments.length} tệp` : ''}</span>
          <span className="block text-base font-extrabold leading-snug">{r.title}</span>
          {r.description && <span className="mt-0.5 block text-xs text-ink-2">{r.description}</span>}
        </span>
      </button>
      {canManage && (
        <button type="button" onClick={onDelete} aria-label={`Gỡ tài liệu ${r.title}`} className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full text-ink-3 transition hover:bg-rose-50 hover:text-rose-700">
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </li>
  );
}


/** Mỗi bài học một màu riêng (vạch trên, nền, số thứ tự, viền bài tập) để học sinh nhỏ dễ phân biệt các bài. */
const PALETTES = [
  { name: 'xanh dương', bar: 'linear-gradient(90deg,#1668f2,#5c9bf8,#1668f2)', box: 'border-brand-300 bg-brand-50/80', num: 'bg-brand-600', text: 'text-brand-700', task: 'border-brand-200 border-l-brand-600', soft: 'bg-brand-100 text-brand-800' },
  { name: 'cam', bar: 'linear-gradient(90deg,#ea580c,#fbbf24,#ea580c)', box: 'border-orange-300 bg-orange-50/80', num: 'bg-orange-500', text: 'text-orange-700', task: 'border-orange-200 border-l-orange-500', soft: 'bg-orange-100 text-orange-900' },
  { name: 'xanh lá', bar: 'linear-gradient(90deg,#16a34a,#86efac,#16a34a)', box: 'border-emerald-300 bg-emerald-50/80', num: 'bg-emerald-600', text: 'text-emerald-700', task: 'border-emerald-200 border-l-emerald-600', soft: 'bg-emerald-100 text-emerald-900' },
  { name: 'tím', bar: 'linear-gradient(90deg,#7c3aed,#c4b5fd,#7c3aed)', box: 'border-violet-300 bg-violet-50/80', num: 'bg-violet-600', text: 'text-violet-700', task: 'border-violet-200 border-l-violet-600', soft: 'bg-violet-100 text-violet-900' },
  { name: 'hồng', bar: 'linear-gradient(90deg,#e11d48,#fda4af,#e11d48)', box: 'border-rose-300 bg-rose-50/80', num: 'bg-rose-500', text: 'text-rose-700', task: 'border-rose-200 border-l-rose-500', soft: 'bg-rose-100 text-rose-900' },
  { name: 'vàng', bar: 'linear-gradient(90deg,#d97706,#fcd34d,#d97706)', box: 'border-amber-300 bg-amber-50/80', num: 'bg-amber-500', text: 'text-amber-700', task: 'border-amber-200 border-l-amber-500', soft: 'bg-amber-100 text-amber-900' },
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
  if (phase === 'soon') return <span className="chip bg-amber-100 text-amber-900 ring-amber-200">Sắp hết hạn · {countdown(task.dueAt, now)}</span>;
  return <span className="chip bg-emerald-100 text-emerald-800 ring-emerald-200">Đang nhận bài{task.dueAt ? ` · ${countdown(task.dueAt, now)}` : ''}</span>;
}

/**
 * Khu vực 1: lớp → bài học (hoặc buổi tập huấn) → tài liệu + bài tập / yêu cầu có hạn nộp và đối tượng được giao.
 * Giáo viên thêm, sửa, xóa; học sinh xem tài liệu ngay trong trang và bấm "Nộp bài" ở đúng bài tập.
 */
export function LessonsPanel({ board, canManage, canSubmit, now, actions }: Props) {
  const w = wordsFor(board.mode);
  const [open, setOpen] = useState(true);
  const [viewing, setViewing] = useState<PinnedResource | null>(null);
  const [closedLessons, setClosedLessons] = useState<Record<string, boolean>>({});

  const classMaterials = board.pinned.filter((r) => !r.lessonId || !board.lessons.some((l) => l.id === r.lessonId));
  const groups = groupTasks(board.lessons, board.tasks);
  const looseTasks = groups.find((g) => g.lesson === null)?.tasks ?? [];
  const submissions = (taskId: string): number => board.cards.filter((c) => c.taskId === taskId).length;

  const kid = canSubmit && !canManage;
  const taskRow = (t: TaskItem, pal: Palette = PALETTES[0], ti = 0) => {
    const phase = taskPhase(t, now);
    const mayPost = canSubmit && !canManage && phase !== 'scheduled' && !(phase === 'overdue' && !t.allowLate);
    const targets = t.targetUnits ?? [];
    return (
      <li key={t.id} className={`rounded-2xl border-2 border-l-[10px] bg-white p-3 transition duration-200 hover:-translate-y-0.5 hover:shadow-soft ${kid ? 'sm:p-4' : ''} ${pal.task}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white ${pal.num}`} aria-hidden>{ti + 1}</span>
              <span className={`chip ${t.kind === 'requirement' ? 'bg-violet-100 text-violet-800 ring-violet-200' : 'bg-brand-100 text-brand-800 ring-brand-200'}`}>
                <ListChecks className="h-3.5 w-3.5" aria-hidden /> {KIND_LABEL[t.kind ?? 'assignment']}
              </span>
              <span className={`${kid ? 'text-lg' : 'text-sm'} font-extrabold`}>{t.label}</span>
            </p>
            {t.instructions && <p className={`mt-1 ${kid ? 'text-base text-ink' : 'text-sm text-ink-2'}`}>{t.instructions}</p>}
          </div>
          <PhaseChip task={t} now={now} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-2">
          <span className="chip bg-brand-50 text-ink-2 ring-brand-100"><Users className="h-3.5 w-3.5" aria-hidden /> {targets.length === 0 ? 'Cả lớp' : `Giao cho: ${targets.join(', ')}`}</span>
          {t.dueAt && <span className="chip bg-brand-50 text-ink-2 ring-brand-100"><CalendarClock className="h-3.5 w-3.5" aria-hidden /> Hạn: {formatDateTime(t.dueAt)}</span>}
          <span>{submissions(t.id)} bài nộp</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {mayPost && <button type="button" onClick={() => actions.onSubmitTo(t.id)} className={kid ? 'btn-primary !min-h-[52px] !px-6 text-base' : 'btn-primary btn-sm'}>Nộp bài</button>}
          <button type="button" onClick={() => actions.onViewSubmissions(t.id)} className="btn-ghost btn-sm">Xem bài nộp</button>
          {canManage && (
            <>
              <button type="button" onClick={() => actions.onEditTask(t)} className="btn-ghost btn-sm"><Pencil className="h-3.5 w-3.5" aria-hidden /> Sửa</button>
              <button type="button" onClick={() => actions.onDeleteTask(t)} aria-label={`Xóa ${t.label}`} className="btn-ghost btn-sm !px-2.5 hover:!border-rose-300 hover:!text-rose-700"><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
            </>
          )}
        </div>
      </li>
    );
  };

  const materialList = (list: PinnedResource[]) => (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {list.map((r) => <MaterialCard key={r.id} r={r} canManage={canManage} onOpen={() => setViewing(r)} onDelete={() => actions.onDeleteMaterial(r)} />)}
    </ul>
  );

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
                <button type="button" onClick={actions.onAddLesson} className="btn-primary btn-sm"><Plus className="h-3.5 w-3.5" aria-hidden /> Thêm {w.lessonLower}</button>
                <button type="button" onClick={() => actions.onAddTask(null)} className="btn-ghost btn-sm"><ListChecks className="h-3.5 w-3.5" aria-hidden /> Giao bài tập / yêu cầu</button>
                <button type="button" onClick={() => actions.onAddMaterial(null)} className="btn-ghost btn-sm"><Paperclip className="h-3.5 w-3.5" aria-hidden /> Thêm tài liệu</button>
                <button type="button" onClick={() => actions.onAddMaterial(null, { mindmap: true })} className="btn-ghost btn-sm"><Network className="h-3.5 w-3.5" aria-hidden /> Tạo sơ đồ tư duy</button>
              </div>
            )}

            <div>
              <h3 className="mb-2 text-sm font-extrabold text-teal2-700">Tài liệu chung của lớp</h3>
              {classMaterials.length === 0 ? <p className="text-sm text-ink-3">Chưa có tài liệu chung.</p> : materialList(classMaterials)}
            </div>

            {board.lessons.length === 0 && (canManage ? (
              <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Bắt đầu nhanh">
                {[
                  { n: 1, t: `Thêm ${w.lessonLower}`, d: `Tạo ${w.lessonLower} đầu tiên của lớp.`, run: actions.onAddLesson },
                  { n: 2, t: 'Giao bài tập / yêu cầu', d: 'Đặt hạn nộp, giao cả lớp hoặc từng tổ.', run: () => actions.onAddTask(null) },
                  { n: 3, t: 'Chia sẻ link cho học sinh', d: 'Bấm “Chia sẻ & QR” ở đầu trang.', run: undefined },
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
            ) : looseTasks.length === 0 && <p className="rounded-2xl bg-white/80 p-3 text-sm text-ink-3">Giáo viên chưa đăng {w.lessonLower} nào.</p>)}

            {groups.filter((g) => g.lesson !== null).map(({ lesson, tasks }, idx) => {
              if (!lesson) return null;
              const pal = PALETTES[idx % PALETTES.length];
              const mats = board.pinned.filter((r) => r.lessonId === lesson.id);
              const collapsed = !!closedLessons[lesson.id];
              return (
                <article key={lesson.id} style={{ ['--bar' as string]: pal.bar }} className={`rounded-3xl border-2 p-3 pt-4 sm:p-4 sm:pt-5 ${pal.box}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <button type="button" aria-expanded={!collapsed} onClick={() => setClosedLessons((m) => ({ ...m, [lesson.id]: !collapsed }))} className="flex min-w-0 items-start gap-2 text-left">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base font-extrabold text-white shadow-soft ${pal.num}`} aria-hidden>{idx + 1}</span>
                      <ChevronDown className={`mt-2 h-4 w-4 shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''}`} aria-hidden />
                      <span className="min-w-0">
                        <span className={`block ${kid ? 'text-xl' : 'text-base'} font-extrabold ${pal.text}`}>{lesson.title}</span>
                        {(lesson.startsAt || lesson.endsAt) && (
                          <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-2"><CalendarClock className="h-3.5 w-3.5" aria-hidden /> {formatDateTime(lesson.startsAt)}{lesson.endsAt ? ` – ${formatDateTime(lesson.endsAt)}` : ''}</span>
                        )}
                        {lesson.description && <span className="mt-1 block text-sm text-ink-2">{lesson.description}</span>}
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
                        {tasks.length === 0 ? <p className="text-sm text-ink-3">Chưa có bài tập hoặc yêu cầu.</p> : <ul className="space-y-3">{tasks.map((t, ti) => taskRow(t, pal, ti))}</ul>}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}

            {looseTasks.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-extrabold text-brand-700">Bài tập & yêu cầu chưa xếp vào {w.lessonLower}</h3>
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
