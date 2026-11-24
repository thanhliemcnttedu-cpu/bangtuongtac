import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DragEvent, FormEvent } from 'react';
import {
  AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Circle, Columns3, ExternalLink, ListChecks, Loader2, Paperclip, Pencil, Plus, Repeat, Search, Send, Share2, SquarePlus, Trash2,
} from 'lucide-react';
import type { RepeatRule, TaskItem, TaskProgress, TaskSubItem } from '../types/board';
import type { BoardStore } from '../hooks/useBoardStore';
import type { AssignedTask } from '../lib/boardApi';
import { getMyAssigned } from '../lib/boardApi';
import { buildMyTasks, sortMyTasks, startOfWeek } from '../lib/myTasks';
import type { MyKind, MyStatus, MyTask } from '../lib/myTasks';
import { countdown, formatDateTime } from '../lib/lessons';
import { splitChecklist, toggleChecklistItem } from '../lib/checklist';
import { taskToInput } from '../lib/recurrence';
import { CATEGORIES, ITEM_STATUS, PROGRESS_META, PROGRESS_ORDER, categoryOf, fmtDay, itemOverdue, itemStats } from '../lib/taskPlan';
import { MyTaskForm } from './MyTaskForm';
import { TaskDetailModal, itemInputOf } from './TaskDetailModal';
import { TaskDocs } from './TaskDocs';
import { ShareTasksModal } from './ShareTasksModal';
import { renderRich } from '../lib/richText';

interface Props {
  store: BoardStore;
  myEmail: string;
  onOpenBoard: (boardId: string) => void;
}

const KIND_TABS: { id: MyKind | 'all'; label: string }[] = [
  { id: 'all', label: 'Tất cả' }, { id: 'assigned', label: 'Giao cho tôi' }, { id: 'created', label: 'Tôi giao' }, { id: 'group', label: 'Của nhóm' }, { id: 'personal', label: 'Việc riêng' },
];
type Focus = 'all' | 'today' | 'soon' | 'doing' | 'overdue' | 'done';
const STATUS_CHIP: Record<MyStatus, string> = {
  todo: PROGRESS_META.todo.chip, doing: PROGRESS_META.doing.chip, waiting: PROGRESS_META.waiting.chip, postponed: PROGRESS_META.postponed.chip, cancelled: PROGRESS_META.cancelled.chip,
  done: 'bg-emerald-100 text-emerald-900 ring-emerald-300', overdue: 'bg-rose-100 text-rose-900 ring-rose-300',
};
const STATUS_TEXT: Record<MyStatus, string> = { todo: 'Chưa làm', doing: 'Đang làm', waiting: 'Chờ bổ sung', postponed: 'Hoãn', cancelled: 'Đã hủy', done: 'Đã xong', overdue: 'Quá hạn' };
const REPEAT_TEXT: Record<Exclude<RepeatRule, 'none'>, string> = { daily: 'Hằng ngày', weekdays: 'Thứ 2–6', weekly: 'Hằng tuần', monthly: 'Hằng tháng', quarterly: 'Hằng quý', semester: 'Hằng học kỳ', yearly: 'Hằng năm' };
const PRIORITY_DOT = { high: 'bg-rose-500', normal: 'bg-sky-500', low: 'bg-slate-400' } as const;
const PRIORITY_TEXT = { high: 'Cao', normal: 'Vừa', low: 'Thấp' } as const;
/** Kanban việc riêng: năm cột (đã hủy không hiện ở Kanban, chỉ hiện ở danh sách). */
const COLS: { id: TaskProgress; label: string }[] = [
  { id: 'todo', label: 'Chưa thực hiện' }, { id: 'doing', label: 'Đang thực hiện' }, { id: 'waiting', label: 'Chờ bổ sung' }, { id: 'postponed', label: 'Hoãn' }, { id: 'done', label: 'Hoàn thành' },
];

const pad = (n: number): string => String(n).padStart(2, '0');
const dayKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAY_MS = 86_400_000;
const closed = (s: MyStatus): boolean => s === 'done' || s === 'cancelled';

/**
 * "Công việc của tôi": bảng điều khiển (thẻ thống kê bấm được, việc cần quan tâm, tiến độ tuần), danh sách phân cấp mở rộng
 * (công việc tổng → đầu việc con → ghi chú, tài liệu), Kanban và lịch tuần. Mọi chế độ dùng chung một nguồn dữ liệu.
 */
export function MyTasksPage({ store, myEmail, onOpenBoard }: Props) {
  const [assigned, setAssigned] = useState<AssignedTask[]>([]);
  const [loadingAssigned, setLoadingAssigned] = useState(false);
  const [kind, setKind] = useState<MyKind | 'all'>('all');
  const [focus, setFocus] = useState<Focus>('all');
  const [category, setCategory] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'list' | 'kanban' | 'week'>('list');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [editRef, setEditRef] = useState<{ boardId: string; taskId: string } | null>(null);
  const [detail, setDetail] = useState<{ boardId: string; taskId: string; canEdit: boolean } | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [items, setItems] = useState<TaskSubItem[]>([]);
  const [itemsMissing, setItemsMissing] = useState(false);

  // Việc người khác giao cho tôi (bảng không nằm trong danh sách bảng của tôi): chỉ có khi dùng Supabase thật.
  useEffect(() => {
    if (!store.isReal) return;
    let alive = true;
    setLoadingAssigned(true);
    getMyAssigned().then((l) => { if (alive) setAssigned(l); }).catch((e) => { if (alive) setError(e instanceof Error ? `Chưa lấy được việc người khác giao: ${e.message}` : ''); }).finally(() => { if (alive) setLoadingAssigned(false); });
    return () => { alive = false; };
  }, [store.isReal]);
  useEffect(() => {
    for (const b of store.boards) if ((b.access ?? 'owner') === 'owner' && (b.settings.scope === 'team' || b.settings.personal) && !b.archivedAt && !b.deletedAt) void store.rollRecurring(b.id).catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(t); }, []);

  const all = useMemo(() => sortMyTasks(buildMyTasks(store.boards, myEmail, assigned, now)), [store.boards, myEmail, assigned, now]);
  const canItems = (t: MyTask): boolean => t.kind === 'personal' || t.kind === 'created';
  const itemTaskIds = useMemo(() => all.filter(canItems).map((t) => t.taskId), [all]);
  const idsKey = itemTaskIds.join(',');

  /** Đọc đầu việc của các công việc tôi quản lý để tính tiến độ ngay trên danh sách. Chưa có bảng ở máy chủ thì bỏ qua, không làm hỏng trang. */
  const refreshItems = useCallback(async (): Promise<void> => {
    if (itemTaskIds.length === 0) { setItems([]); return; }
    try { setItems(await store.loadItemSummaries(itemTaskIds)); setItemsMissing(false); } catch { setItemsMissing(true); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, store.loadItemSummaries]);
  useEffect(() => { void refreshItems(); }, [refreshItems]);

  const itemsOf = useMemo(() => {
    const m = new Map<string, TaskSubItem[]>();
    for (const it of items) m.set(it.taskId, [...(m.get(it.taskId) ?? []), it]);
    return m;
  }, [items]);
  const statsOf = (t: MyTask) => itemStats(itemsOf.get(t.taskId) ?? [], now);

  // Bộ lọc dùng chung: nguồn, nhóm, từ khóa; rồi thẻ thống kê (focus) thu hẹp thêm.
  const q = query.trim().toLowerCase();
  const base = useMemo(() => all.filter((t) => (kind === 'all' || t.kind === kind) && (category === 'all' || t.category === category) && (!q || `${t.label} ${t.boardTitle}`.toLowerCase().includes(q))), [all, kind, category, q]);
  const today = dayKey(new Date(now));
  const soonMs = now + 2 * DAY_MS;
  const isToday = (t: MyTask): boolean => !closed(t.status) && t.status !== 'postponed' && !!t.dueAt && dayKey(new Date(t.dueAt)) === today;
  const isSoon = (t: MyTask): boolean => !closed(t.status) && t.status !== 'overdue' && !!t.dueAt && Date.parse(t.dueAt) >= now && Date.parse(t.dueAt) <= soonMs;
  const matches = (t: MyTask, f: Focus): boolean => {
    if (f === 'all') return true;
    if (f === 'today') return isToday(t);
    if (f === 'soon') return isSoon(t);
    if (f === 'doing') return t.status === 'doing';
    if (f === 'overdue') return t.status === 'overdue';
    return t.status === 'done';
  };
  const shown = base.filter((t) => matches(t, focus));
  const count = (f: Focus): number => base.filter((t) => matches(t, f)).length;
  const open = all.filter((t) => !closed(t.status) && t.status !== 'postponed').length;
  const overdueAll = all.filter((t) => t.status === 'overdue').length;
  const personal = base.filter((t) => t.kind === 'personal');
  const usedCats = useMemo(() => CATEGORIES.filter((c) => all.some((t) => t.category === c.id)), [all]);

  const weekEnd = weekStart.getTime() + 7 * DAY_MS;
  const weekTasks = all.filter((t) => t.dueAt && Date.parse(t.dueAt) >= weekStart.getTime() && Date.parse(t.dueAt) < weekEnd && t.status !== 'cancelled' && (kind === 'all' || t.kind === kind));
  const weekDone = weekTasks.filter((t) => t.status === 'done').length;
  const weekPct = weekTasks.length > 0 ? Math.round((weekDone / weekTasks.length) * 100) : 0;
  const attention = useMemo(() => base.filter((t) => !closed(t.status) && t.status !== 'postponed' && (t.status === 'overdue' || isSoon(t) || isToday(t)))
    .sort((a, b) => (a.status === 'overdue' ? 0 : 1) - (b.status === 'overdue' ? 0 : 1) || Date.parse(a.dueAt ?? '') - Date.parse(b.dueAt ?? '')).slice(0, 3),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [base, now]);

  const run = async (fn: () => Promise<void>): Promise<void> => { setError(''); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Không thực hiện được.'); } };
  const saved = (msg: string): void => { setNow(Date.now()); setNotice(msg); void refreshItems(); window.setTimeout(() => setNotice(''), 4000); };

  const addPersonal = async (title: string): Promise<void> => {
    const b = await store.ensurePersonalBoard();
    await store.saveTask(b.id, null, { label: title, lessonId: null, kind: 'requirement', instructions: '', assignedAt: null, dueAt: null, allowLate: true, targetUnits: [], progress: 'todo', priority: 'normal' });
  };
  const move = (t: MyTask, progress: TaskProgress): void => { void run(() => store.setTaskProgress(t.boardId, t.taskId, progress)); };
  const remove = (t: MyTask): void => {
    if (!window.confirm(`Xóa công việc “${t.label}”? Các đầu việc và nhật ký đi kèm cũng bị xóa. Không thể hoàn tác.`)) return;
    void run(() => store.removeTask(t.boardId, t.taskId));
  };
  /** Tích / bỏ tích một việc nhỏ (checklist) của việc riêng; lưu ngay vào ghi chú của việc. */
  const toggleCheck = (t: MyTask, index: number): void => {
    const task = store.boards.find((b) => b.id === t.boardId)?.tasks.find((x) => x.id === t.taskId);
    if (!task) return;
    void run(async () => { await store.saveTask(t.boardId, t.taskId, { ...taskToInput(task), instructions: toggleChecklistItem(task.instructions ?? '', index) }); });
  };
  const quickItemDone = (t: MyTask, it: TaskSubItem): void => { void run(async () => { await store.saveTaskItem(t.boardId, t.taskId, it, { ...itemInputOf(it), status: 'done' }, ''); await refreshItems(); }); };
  const openTask = (t: MyTask): void => {
    if (t.kind === 'personal') return;
    if (t.external || t.kind === 'assigned') window.open(`${window.location.origin}/b/${t.shareToken}?task=${encodeURIComponent(t.taskId)}`, '_blank', 'noopener');
    else onOpenBoard(t.boardId);
  };
  const personalShare = store.boards.find((b) => b.settings.personal && !b.deletedAt && (b.access ?? 'owner') === 'owner')?.settings.taskShare;
  const editing: TaskItem | undefined = editRef ? store.boards.find((b) => b.id === editRef.boardId)?.tasks.find((x) => x.id === editRef.taskId) : undefined;

  const dueChip = (t: MyTask) => t.dueAt ? <span className={`chip ${t.status === 'overdue' ? 'bg-rose-50 text-rose-800 ring-rose-200' : 'bg-white text-ink-2 ring-brand-200'}`}>{formatDateTime(t.dueAt)}{closed(t.status) ? '' : ` · ${countdown(t.dueAt, now)}`}</span> : <span className="chip bg-white text-ink-3 ring-brand-100">Không hạn</span>;
  const catChip = (t: MyTask) => { const c = categoryOf(t.category); return c ? <span className="chip" style={{ background: c.soft, color: c.text, boxShadow: 'none' }}><c.Icon className="h-3 w-3" aria-hidden /> {c.label}</span> : null; };

  const row = (t: MyTask) => {
    const { note, items: checks } = splitChecklist(t.instructions);
    const doneN = checks.filter((i) => i.done).length;
    const opened = openKey === t.key;
    const mine = t.kind === 'personal';
    const manage = canItems(t);
    const docs = t.attachments ?? [];
    const rep = t.repeat && t.repeat !== 'none' ? REPEAT_TEXT[t.repeat] : '';
    const sub = (itemsOf.get(t.taskId) ?? []).filter((i) => !i.deletedAt);
    const st = statsOf(t);
    const cat = categoryOf(t.category);
    return (
      <li key={t.key} className={`overflow-hidden rounded-2xl border-[1.5px] bg-white ${t.status === 'overdue' ? 'border-rose-300' : 'border-brand-100'}`} style={cat ? { borderLeft: `5px solid ${cat.bar}` } : undefined}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
          <span className={`h-3 w-3 shrink-0 rounded-full ${PRIORITY_DOT[t.priority]}`} title={`Ưu tiên ${PRIORITY_TEXT[t.priority]}`} aria-label={`Ưu tiên ${PRIORITY_TEXT[t.priority]}`} />
          <button type="button" aria-expanded={opened} onClick={() => setOpenKey(opened ? null : t.key)} className="min-w-0 flex-1 basis-56 text-left max-lg:min-h-[44px]">
            <span className="flex items-start gap-1.5">
              <span className={`block text-sm font-extrabold ${closed(t.status) ? 'text-ink-3' : ''} ${t.status === 'done' ? 'line-through' : ''}`}>{t.label}</span>
              <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-ink-3 transition ${opened ? 'rotate-180' : ''}`} aria-hidden />
            </span>
            <span className="block truncate text-xs text-ink-2">{mine ? 'Việc riêng' : t.boardTitle}{t.count ? ` · đã nộp ${t.count.done}/${t.count.total}` : ''}</span>
            <span className="mt-1 flex flex-wrap gap-1">
              {catChip(t)}
              {st.all > 0 && <span className="chip bg-brand-50 text-brand-800 ring-brand-200"><ListChecks className="h-3 w-3" aria-hidden /> {st.done}/{st.valid} đầu việc · {st.pct}%</span>}
              {checks.length > 0 && <span className="chip bg-brand-50 text-brand-800 ring-brand-200"><CheckCircle2 className="h-3 w-3" aria-hidden /> {doneN}/{checks.length}</span>}
              {docs.length > 0 && <span className="chip bg-brand-50 text-brand-800 ring-brand-200"><Paperclip className="h-3 w-3" aria-hidden /> {docs.length}</span>}
              {rep && <span className="chip bg-violet-50 text-violet-800 ring-violet-200"><Repeat className="h-3 w-3" aria-hidden /> {rep}</span>}
              {st.overdue > 0 && <span className="chip bg-rose-50 text-rose-800 ring-rose-200">{st.overdue} đầu việc quá hạn</span>}
            </span>
            {st.all > 0 && <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-brand-100" aria-hidden><span className="block h-full rounded-full bg-gradient-to-r from-brand-500 to-teal2-500" style={{ width: `${st.pct}%` }} /></span>}
          </button>
          {dueChip(t)}
          <span className={`chip ${STATUS_CHIP[t.status]}`}>{STATUS_TEXT[t.status]}</span>
          <span className="ml-auto flex flex-wrap gap-1.5 max-sm:w-full max-sm:[&>*]:flex-1 max-lg:[&>*]:!min-h-[44px]">
            {mine ? (
              <>
                {(t.progress === 'todo' || t.progress === 'waiting' || t.progress === 'postponed') && <button type="button" onClick={() => move(t, 'doing')} className="btn-ghost btn-sm">Bắt đầu</button>}
                {t.progress !== 'done' && t.progress !== 'cancelled' ? <button type="button" onClick={() => move(t, 'done')} className="btn-primary btn-sm"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Xong</button> : <button type="button" onClick={() => move(t, 'todo')} className="btn-ghost btn-sm">Mở lại</button>}
              </>
            ) : t.kind === 'assigned' ? (
              t.status !== 'done' && <button type="button" onClick={() => openTask(t)} className="btn-primary btn-sm"><Send className="h-3.5 w-3.5" aria-hidden /> {t.ackOnly ? 'Tôi đã đọc' : 'Nộp minh chứng'}</button>
            ) : (
              <button type="button" onClick={() => openTask(t)} className="btn-ghost btn-sm"><ExternalLink className="h-3.5 w-3.5" aria-hidden /> Mở bảng</button>
            )}
            {manage && <button type="button" onClick={() => setDetail({ boardId: t.boardId, taskId: t.taskId, canEdit: true })} className="btn-ghost btn-sm">Chi tiết</button>}
          </span>
        </div>
        {opened && (
          <div className="space-y-3 border-t border-brand-100 bg-brand-50/30 px-3 py-3">
            {note && <div className="text-sm leading-relaxed text-ink-2">{renderRich(note)}</div>}
            {checks.length > 0 && (
              <ul className="space-y-1" aria-label="Các việc nhỏ">
                {checks.map((it, i) => (
                  <li key={`${it.text}-${i}`}>
                    <label className={`flex items-start gap-2.5 rounded-xl px-2 py-1.5 text-sm max-lg:min-h-[44px] max-lg:items-center ${mine ? 'cursor-pointer hover:bg-white' : ''}`}>
                      <input type="checkbox" className="h-5 w-5 shrink-0 accent-brand-600" checked={it.done} disabled={!mine} onChange={() => toggleCheck(t, i)} />
                      <span className={it.done ? 'text-ink-3 line-through' : ''}>{it.text}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {sub.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-ink-3">Đầu việc thành phần ({st.done}/{st.valid})</p>
                <ul className="space-y-1" aria-label="Đầu việc thành phần">
                  {sub.slice(0, 8).map((it) => (
                    <li key={it.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-2.5 py-1.5 text-sm ring-1 ring-brand-100">
                      <span className={`min-w-0 flex-1 truncate font-bold ${it.status === 'done' ? 'text-ink-3 line-through' : ''}`}>{it.subject || it.title}</span>
                      {it.plannedAt && <span className={`text-xs ${itemOverdue(it, now) ? 'font-bold text-rose-700' : 'text-ink-2'}`}>{fmtDay(it.plannedAt).slice(0, 5)}</span>}
                      <span className={`chip ${ITEM_STATUS[it.status].chip}`}>{ITEM_STATUS[it.status].label}</span>
                      {manage && it.status !== 'done' && it.status !== 'cancelled' && <button type="button" onClick={() => quickItemDone(t, it)} className="btn-ghost btn-sm max-lg:!min-h-[44px]" aria-label={`Hoàn thành ${it.subject || it.title}`}><CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Xong</button>}
                    </li>
                  ))}
                </ul>
                {sub.length > 8 && <button type="button" onClick={() => setDetail({ boardId: t.boardId, taskId: t.taskId, canEdit: true })} className="mt-1 text-xs font-bold text-brand-700 hover:underline">Xem tất cả {sub.length} đầu việc</button>}
              </div>
            )}
            {docs.length > 0 && <TaskDocs task={{ id: t.taskId, label: t.label, attachments: docs }} className="" />}
            {!note && checks.length === 0 && sub.length === 0 && docs.length === 0 && <p className="text-sm text-ink-3">Việc này chưa có ghi chú, đầu việc hay tệp đính kèm.{manage ? ' Bấm “Chi tiết” để thêm đầu việc.' : ''}</p>}
            {mine && (
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label htmlFor={`pg-${t.key}`} className="field-label">Trạng thái</label>
                  <select id={`pg-${t.key}`} className="input !min-h-[40px]" value={t.progress ?? 'todo'} onChange={(e) => move(t, e.target.value as TaskProgress)}>
                    {PROGRESS_ORDER.map((p) => <option key={p} value={p}>{PROGRESS_META[p].label}</option>)}
                  </select>
                </div>
                <button type="button" onClick={() => setEditRef({ boardId: t.boardId, taskId: t.taskId })} className="btn-ghost max-lg:min-h-[44px]"><Pencil className="h-4 w-4" aria-hidden /> Sửa</button>
                <button type="button" onClick={() => remove(t)} aria-label={`Xóa ${t.label}`} className="btn-ghost max-lg:min-h-[44px] hover:!border-rose-300 hover:!text-rose-700"><Trash2 className="h-4 w-4" aria-hidden /> Xóa</button>
              </div>
            )}
          </div>
        )}
      </li>
    );
  };

  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; });

  const cards: { id: Focus; label: string; tone: string }[] = [
    { id: 'all', label: 'Tổng công việc', tone: 'bg-white text-ink ring-brand-200' },
    { id: 'today', label: 'Hôm nay', tone: 'bg-sky-50 text-sky-900 ring-sky-200' },
    { id: 'soon', label: 'Sắp đến hạn', tone: 'bg-amber-50 text-amber-900 ring-amber-200' },
    { id: 'doing', label: 'Đang thực hiện', tone: 'bg-indigo-50 text-indigo-900 ring-indigo-200' },
    { id: 'overdue', label: 'Quá hạn', tone: 'bg-rose-50 text-rose-900 ring-rose-200' },
    { id: 'done', label: 'Đã hoàn thành', tone: 'bg-emerald-50 text-emerald-900 ring-emerald-200' },
  ];

  return (
    <main className="mx-auto w-full max-w-[min(100%,1500px)] space-y-4 px-4 py-5 pb-28 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Công việc của tôi</h1>
          <p className="text-sm text-ink-2">{open} việc chưa xong{overdueAll > 0 ? <> · <b className="text-rose-700">{overdueAll} quá hạn</b></> : null}{myEmail ? ` · ${myEmail}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setFormOpen(true)} className="btn-primary max-lg:min-h-[44px]"><SquarePlus className="h-4 w-4" aria-hidden /> Thêm việc</button>
          <button type="button" onClick={() => setShareOpen(true)} className="btn-ghost max-lg:min-h-[44px]" aria-label="Chia sẻ Công việc của tôi"><Share2 className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Chia sẻ</span>{personalShare && <span className="ml-1 h-2 w-2 rounded-full bg-emerald-500" title="Đang chia sẻ" aria-hidden />}</button>
          <div className="flex rounded-full border-[1.5px] border-brand-200 bg-white p-0.5" role="group" aria-label="Cách xem">
            {([['list', 'Danh sách', ListChecks], ['kanban', 'Kanban', Columns3], ['week', 'Lịch tuần', CalendarDays]] as const).map(([id, label, Icon]) => (
              <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold max-lg:min-h-[44px] max-lg:min-w-[44px] max-lg:justify-center ${view === id ? 'bg-brand-600 text-white' : 'text-ink-2 hover:bg-brand-50'}`}><Icon className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">{label}</span></button>
            ))}
          </div>
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">{notice}</p>}
      {itemsMissing && <p role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">Máy chủ chưa có bảng đầu việc nên chưa hiện tiến độ đầu việc. Hãy chạy tệp docs/cap-nhat-cong-viec-nang-cao.sql trong Supabase.</p>}

      {/* Bảng điều khiển: thẻ thống kê bấm vào để lọc danh sách */}
      <section aria-label="Tổng quan công việc" className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {cards.map((c) => (
            <button key={c.id} type="button" aria-pressed={focus === c.id} onClick={() => setFocus(focus === c.id && c.id !== 'all' ? 'all' : c.id)}
              className={`rounded-2xl p-3 text-left ring-1 transition hover:-translate-y-0.5 max-lg:min-h-[64px] ${c.tone} ${focus === c.id ? 'ring-2 !ring-brand-600 shadow-soft' : ''}`}>
              <span className="block text-2xl font-extrabold leading-none">{count(c.id)}</span>
              <span className="mt-1 block text-xs font-bold">{c.label}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border-[1.5px] border-brand-100 bg-white p-3">
            <p className="text-xs font-extrabold uppercase tracking-wide text-ink-3">Tiến độ tuần {pad(days[0].getDate())}/{pad(days[0].getMonth() + 1)} – {pad(days[6].getDate())}/{pad(days[6].getMonth() + 1)}</p>
            <p className="mt-1 text-2xl font-extrabold text-brand-700">{weekTasks.length > 0 ? `${weekPct}%` : '—'}</p>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-brand-100" role="progressbar" aria-valuenow={weekPct} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ tuần"><div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-teal2-500" style={{ width: `${weekPct}%` }} /></div>
            <p className="mt-1 text-xs text-ink-2">{weekTasks.length > 0 ? `${weekDone}/${weekTasks.length} việc có hạn trong tuần đã xong` : 'Tuần này chưa có việc nào đặt hạn.'}</p>
          </div>
          <div className="rounded-2xl border-[1.5px] border-brand-100 bg-white p-3 lg:col-span-2">
            <p className="text-xs font-extrabold uppercase tracking-wide text-ink-3">Công việc cần quan tâm</p>
            {attention.length === 0 ? <p className="mt-1 text-sm text-ink-2">Không có việc quá hạn hay sắp đến hạn trong 2 ngày tới.</p> : (
              <ul className="mt-1 space-y-1">
                {attention.map((t) => (
                  <li key={t.key}>
                    <button type="button" onClick={() => { setFocus('all'); setView('list'); setOpenKey(t.key); window.setTimeout(() => document.getElementById(`task-${t.key}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80); }}
                      className="flex w-full flex-wrap items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-brand-50 max-lg:min-h-[44px]">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${PRIORITY_DOT[t.priority]}`} aria-hidden />
                      <span className="min-w-0 flex-1 truncate font-bold">{t.label}</span>
                      <span className={`chip ${t.status === 'overdue' ? 'bg-rose-50 text-rose-800 ring-rose-200' : 'bg-amber-50 text-amber-900 ring-amber-200'}`}>{t.status === 'overdue' ? 'Quá hạn' : 'Sắp đến hạn'}{t.dueAt ? ` · ${countdown(t.dueAt, now)}` : ''}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <QuickAdd onAdd={(t) => run(() => addPersonal(t))} onFull={() => setFormOpen(true)} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 basis-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input type="search" className="input !pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm công việc theo tên…" aria-label="Tìm công việc" />
        </div>
        {usedCats.length > 0 && (
          <select className="input max-w-[14rem]" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Lọc theo nhóm công việc">
            <option value="all">Mọi nhóm công việc</option>{usedCats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        )}
        {(focus !== 'all' || category !== 'all' || query) && <button type="button" onClick={() => { setFocus('all'); setCategory('all'); setQuery(''); }} className="btn-ghost max-lg:min-h-[44px]">Xóa bộ lọc</button>}
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo nguồn">
        {KIND_TABS.map((k) => <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)} className={`chip cursor-pointer !px-3 !py-1.5 text-sm max-lg:!min-h-[44px] ${kind === k.id ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-2 ring-brand-200 hover:bg-brand-50'}`}>{k.label} ({k.id === 'all' ? all.length : all.filter((t) => t.kind === k.id).length})</button>)}
      </div>

      {loadingAssigned && <p className="flex items-center gap-2 text-sm text-ink-2" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Đang lấy việc người khác giao…</p>}

      {view === 'list' && (shown.length === 0
        ? <p className="rounded-2xl border border-dashed border-brand-200 bg-white/70 p-8 text-center text-ink-2">{all.length === 0 ? 'Chưa có việc nào. Bấm “Thêm việc” để ghi lại công việc của bạn.' : 'Không có việc nào phù hợp bộ lọc.'}</p>
        : <ul className="space-y-2">{shown.map((t) => <div key={t.key} id={`task-${t.key}`} className="contents">{row(t)}</div>)}</ul>)}

      {view === 'kanban' && (
        <section aria-label="Kanban việc riêng" className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          {COLS.map((c) => <KanbanCol key={c.id} col={c} tasks={personal.filter((t) => (t.progress ?? 'todo') === c.id)} lookup={personal} now={now} statsOf={statsOf} onMove={move} onOpen={(t) => setDetail({ boardId: t.boardId, taskId: t.taskId, canEdit: true })} />)}
          {personal.length === 0 && <p className="text-sm text-ink-2 md:col-span-2 xl:col-span-5">Kanban chỉ gồm việc riêng. Bấm “Thêm việc” để tạo.</p>}
        </section>
      )}

      {view === 'week' && (
        <section aria-label="Lịch tuần">
          <div className="mb-2 flex items-center gap-2">
            <button type="button" onClick={() => setWeekStart((w) => { const d = new Date(w); d.setDate(d.getDate() - 7); return d; })} className="btn-ghost btn-sm max-lg:!min-h-[44px]" aria-label="Tuần trước"><ChevronLeft className="h-4 w-4" aria-hidden /></button>
            <b className="text-sm">{pad(days[0].getDate())}/{pad(days[0].getMonth() + 1)} – {pad(days[6].getDate())}/{pad(days[6].getMonth() + 1)}/{days[6].getFullYear()}</b>
            <button type="button" onClick={() => setWeekStart((w) => { const d = new Date(w); d.setDate(d.getDate() + 7); return d; })} className="btn-ghost btn-sm max-lg:!min-h-[44px]" aria-label="Tuần sau"><ChevronRight className="h-4 w-4" aria-hidden /></button>
            <button type="button" onClick={() => setWeekStart(startOfWeek(new Date()))} className="btn-ghost btn-sm max-lg:!min-h-[44px]">Tuần này</button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
            {days.map((d, i) => {
              const list = base.filter((t) => t.dueAt && dayKey(new Date(t.dueAt)) === dayKey(d));
              return (
                <div key={i} className={`min-h-[120px] rounded-2xl border-[1.5px] p-2 ${dayKey(d) === today ? 'border-brand-500 bg-brand-50' : 'border-brand-100 bg-white'}`}>
                  <p className="text-xs font-extrabold text-ink-2">{['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'][i]} · {pad(d.getDate())}/{pad(d.getMonth() + 1)}</p>
                  <ul className="mt-1 space-y-1">
                    {list.map((t) => {
                      const c = categoryOf(t.category);
                      return (
                        <li key={t.key} className={`rounded-lg px-2 py-1 text-xs font-bold ring-1 ${STATUS_CHIP[t.status]}`} style={c ? { borderLeft: `4px solid ${c.bar}` } : undefined} title={`${t.label} · ${t.kind === 'personal' ? 'Việc riêng' : t.boardTitle}`}>
                          <span className="block truncate">{t.label}</span>
                          <span className="block truncate font-medium opacity-80">{new Date(t.dueAt as string).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} · {STATUS_TEXT[t.status]}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
          {base.some((t) => !t.dueAt) && <p className="mt-2 text-xs text-ink-2">{base.filter((t) => !t.dueAt).length} việc không có hạn nên không hiện trên lịch.</p>}
        </section>
      )}

      <button type="button" onClick={() => setFormOpen(true)} className="btn-primary fixed bottom-[92px] right-4 z-30 flex h-14 w-14 items-center justify-center !rounded-full !p-0 shadow-lift lg:hidden" aria-label="Thêm công việc" title="Thêm công việc"><SquarePlus className="h-6 w-6" aria-hidden /></button>
      {detail && <TaskDetailModal store={store} boardId={detail.boardId} taskId={detail.taskId} canEdit={detail.canEdit} onClose={() => { setDetail(null); void refreshItems(); }} onChanged={() => { setNow(Date.now()); void refreshItems(); }}
        onEdit={() => { setEditRef({ boardId: detail.boardId, taskId: detail.taskId }); }} />}
      {shareOpen && <ShareTasksModal store={store} onClose={() => setShareOpen(false)} onChanged={saved} />}
      {formOpen && <MyTaskForm store={store} onClose={() => setFormOpen(false)} onSaved={saved} />}
      {editRef && editing && <MyTaskForm store={store} editing={{ boardId: editRef.boardId, task: editing }} onClose={() => setEditRef(null)} onSaved={saved} />}
    </main>
  );
}

function QuickAdd({ onAdd, onFull }: { onAdd: (title: string) => Promise<void>; onFull: () => void }) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!title.trim()) { document.getElementById('mt-title')?.focus(); return; }
    setBusy(true);
    try { await onAdd(title.trim()); setTitle(''); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-wrap items-end gap-2 rounded-2xl border-[1.5px] border-brand-100 bg-white p-3" aria-label="Thêm nhanh việc riêng">
      <div className="min-w-[200px] flex-1 basis-64">
        <label htmlFor="mt-title" className="field-label">Thêm nhanh một việc riêng</label>
        <input id="mt-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ví dụ: Soạn đề kiểm tra giữa kỳ" />
      </div>
      <button type="submit" disabled={busy} className="btn-primary max-lg:min-h-[44px]"><Plus className="h-4 w-4" aria-hidden /> Thêm</button>
      <button type="button" onClick={onFull} className="btn-ghost max-lg:min-h-[44px]">Thêm đầy đủ…</button>
    </form>
  );
}

function KanbanCol({ col, tasks, lookup, now, statsOf, onMove, onOpen }: {
  col: { id: TaskProgress; label: string }; tasks: MyTask[]; lookup: MyTask[]; now: number; statsOf: (t: MyTask) => ReturnType<typeof itemStats>;
  onMove: (t: MyTask, p: TaskProgress) => void; onOpen: (t: MyTask) => void;
}) {
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent): void => {
    e.preventDefault(); setOver(false);
    const key = e.dataTransfer.getData('text/plain');
    const t = lookup.find((x) => x.key === key);
    if (t && t.progress !== col.id) onMove(t, col.id);
  };
  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}
      className={`min-h-[160px] rounded-2xl border-[1.5px] p-2 ${over ? 'border-brand-500 bg-brand-50' : 'border-brand-100 bg-white/70'}`}>
      <h2 className="mb-2 flex items-center justify-between px-1 text-sm font-extrabold">{col.label}<span className="chip bg-white text-ink-2 ring-brand-200">{tasks.length}</span></h2>
      <ul className="space-y-2">
        {tasks.map((t) => {
          const c = categoryOf(t.category);
          const st = statsOf(t);
          return (
            <li key={t.key} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', t.key)} className={`cursor-grab rounded-xl border-[1.5px] bg-white p-2.5 ${t.status === 'overdue' ? 'border-rose-300' : 'border-brand-100'}`} style={c ? { borderLeft: `4px solid ${c.bar}` } : undefined}>
              <p className="flex items-start gap-2 text-sm font-bold"><span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${PRIORITY_DOT[t.priority]}`} aria-label={`Ưu tiên ${PRIORITY_TEXT[t.priority]}`} />{t.label}</p>
              {st.all > 0 && <p className="mt-1 text-xs text-ink-2">{st.done}/{st.valid} đầu việc · {st.pct}%</p>}
              {t.dueAt && <p className={`mt-1 flex items-center gap-1 text-xs ${t.status === 'overdue' ? 'font-bold text-rose-700' : 'text-ink-2'}`}>{t.status === 'overdue' ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> : <Circle className="h-3 w-3" aria-hidden />} {formatDateTime(t.dueAt)} · {countdown(t.dueAt, now)}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <select aria-label={`Chuyển ${t.label} sang`} className="input !min-h-[36px] max-w-[10rem] !py-0 text-xs max-lg:!min-h-[44px]" value={t.progress ?? 'todo'} onChange={(e) => onMove(t, e.target.value as TaskProgress)}>
                  {PROGRESS_ORDER.map((p) => <option key={p} value={p}>{PROGRESS_META[p].label}</option>)}
                </select>
                <button type="button" onClick={() => onOpen(t)} className="btn-ghost btn-sm !min-h-[36px] max-lg:!min-h-[44px]">Chi tiết</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
