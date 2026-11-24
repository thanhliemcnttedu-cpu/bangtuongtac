import { useEffect, useMemo, useState } from 'react';
import type { DragEvent, FormEvent } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Circle, Columns3, ExternalLink, ListChecks, Loader2, Plus, Send, Trash2, UserPlus } from 'lucide-react';
import type { BoardData } from '../types/board';
import type { BoardStore } from '../hooks/useBoardStore';
import type { AssignedTask } from '../lib/boardApi';
import { getMyAssigned } from '../lib/boardApi';
import { buildMyTasks, sortMyTasks, startOfWeek } from '../lib/myTasks';
import type { MyKind, MyStatus, MyTask } from '../lib/myTasks';
import { countdown, formatDateTime, fromLocalInput } from '../lib/lessons';

interface Props {
  store: BoardStore;
  myEmail: string;
  onOpenBoard: (boardId: string) => void;
}

const KIND_TABS: { id: MyKind | 'all'; label: string }[] = [
  { id: 'all', label: 'Tất cả' }, { id: 'assigned', label: 'Giao cho tôi' }, { id: 'created', label: 'Tôi giao' }, { id: 'group', label: 'Của nhóm' }, { id: 'personal', label: 'Việc riêng' },
];
const STATUS_TABS: { id: MyStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'Tất cả' }, { id: 'doing', label: 'Đang làm' }, { id: 'done', label: 'Đã nộp' }, { id: 'overdue', label: 'Quá hạn' },
];
const STATUS_CHIP: Record<MyStatus, string> = {
  todo: 'bg-slate-100 text-slate-800 ring-slate-300', doing: 'bg-sky-100 text-sky-900 ring-sky-300', done: 'bg-emerald-100 text-emerald-900 ring-emerald-300', overdue: 'bg-rose-100 text-rose-900 ring-rose-300',
};
const STATUS_TEXT: Record<MyStatus, string> = { todo: 'Chưa làm', doing: 'Đang làm', done: 'Đã xong', overdue: 'Quá hạn' };
const PRIORITY_DOT = { high: 'bg-rose-500', normal: 'bg-sky-500', low: 'bg-slate-400' } as const;
const PRIORITY_TEXT = { high: 'Cao', normal: 'Vừa', low: 'Thấp' } as const;
const COLS: { id: 'todo' | 'doing' | 'done'; label: string }[] = [{ id: 'todo', label: 'Cần làm' }, { id: 'doing', label: 'Đang làm' }, { id: 'done', label: 'Xong' }];

const pad = (n: number): string => String(n).padStart(2, '0');
const dayKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * "Công việc của tôi": gom việc giao cho tôi, việc tôi giao, việc của nhóm và việc riêng về một chỗ.
 * Chỉ là cách nhìn gộp trên các bảng; việc riêng nằm trong một bảng ẩn tự tạo.
 */
export function MyTasksPage({ store, myEmail, onOpenBoard }: Props) {
  const [assigned, setAssigned] = useState<AssignedTask[]>([]);
  const [loadingAssigned, setLoadingAssigned] = useState(false);
  const [kind, setKind] = useState<MyKind | 'all'>('all');
  const [status, setStatus] = useState<MyStatus | 'all'>('all');
  const [view, setView] = useState<'list' | 'kanban' | 'week'>('list');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);

  // Việc người khác giao cho tôi (bảng không nằm trong danh sách bảng của tôi): chỉ có khi dùng Supabase thật.
  useEffect(() => {
    if (!store.isReal) return;
    let alive = true;
    setLoadingAssigned(true);
    getMyAssigned().then((l) => { if (alive) setAssigned(l); }).catch((e) => { if (alive) setError(e instanceof Error ? `Chưa lấy được việc người khác giao: ${e.message}` : ''); }).finally(() => { if (alive) setLoadingAssigned(false); });
    return () => { alive = false; };
  }, [store.isReal]);
  useEffect(() => {
    for (const b of store.boards) if ((b.access ?? 'owner') === 'owner' && b.settings.scope === 'team' && !b.settings.personal && !b.archivedAt && !b.deletedAt) void store.rollRecurring(b.id).catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(t); }, []);

  const all = useMemo(() => sortMyTasks(buildMyTasks(store.boards, myEmail, assigned, now)), [store.boards, myEmail, assigned, now]);
  const byKind = kind === 'all' ? all : all.filter((t) => t.kind === kind);
  const shown = status === 'all' ? byKind : byKind.filter((t) => t.status === status);
  const count = (s: MyStatus | 'all'): number => (s === 'all' ? byKind.length : byKind.filter((t) => t.status === s).length);
  const kindCount = (k: MyKind | 'all'): number => (k === 'all' ? all.length : all.filter((t) => t.kind === k).length);
  const overdue = all.filter((t) => t.status === 'overdue').length;
  const open = all.filter((t) => t.status !== 'done').length;
  const personal = all.filter((t) => t.kind === 'personal');
  const teamBoards = store.boards.filter((b) => (b.access ?? 'owner') === 'owner' && b.settings.scope === 'team' && !b.settings.personal && !b.deletedAt && !b.archivedAt);

  const run = async (fn: () => Promise<void>): Promise<void> => { setError(''); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Không thực hiện được.'); } };

  const addPersonal = async (title: string, priority: 'high' | 'normal' | 'low', due: string): Promise<void> => {
    const b = await store.ensurePersonalBoard();
    await store.saveTask(b.id, null, { label: title, lessonId: null, kind: 'requirement', instructions: '', assignedAt: null, dueAt: fromLocalInput(due), allowLate: true, targetUnits: [], progress: 'todo', priority });
  };
  const move = (t: MyTask, progress: 'todo' | 'doing' | 'done'): void => { void run(() => store.setTaskProgress(t.boardId, t.taskId, progress)); };
  const remove = (t: MyTask): void => { void run(() => store.removeTask(t.boardId, t.taskId)); };
  const openTask = (t: MyTask): void => {
    if (t.kind === 'personal') return;
    if (t.external || t.kind === 'assigned') window.open(`${window.location.origin}/b/${t.shareToken}?task=${encodeURIComponent(t.taskId)}`, '_blank', 'noopener');
    else onOpenBoard(t.boardId);
  };

  const dueChip = (t: MyTask) => t.dueAt ? <span className={`chip ${t.status === 'overdue' ? 'bg-rose-50 text-rose-800 ring-rose-200' : 'bg-white text-ink-2 ring-brand-200'}`}>{formatDateTime(t.dueAt)} · {countdown(t.dueAt, now)}</span> : <span className="chip bg-white text-ink-3 ring-brand-100">Không hạn</span>;

  const row = (t: MyTask) => (
    <li key={t.key} className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border-[1.5px] bg-white px-3 py-2.5 ${t.status === 'overdue' ? 'border-rose-300' : 'border-brand-100'}`}>
      <span className={`h-3 w-3 shrink-0 rounded-full ${PRIORITY_DOT[t.priority]}`} title={`Ưu tiên ${PRIORITY_TEXT[t.priority]}`} aria-label={`Ưu tiên ${PRIORITY_TEXT[t.priority]}`} />
      <span className="min-w-0 flex-1 basis-56">
        <span className={`block text-sm font-extrabold ${t.status === 'done' ? 'text-ink-3 line-through' : ''}`}>{t.label}</span>
        <span className="block truncate text-xs text-ink-2">{t.kind === 'personal' ? 'Việc riêng' : t.boardTitle}{t.count ? ` · đã nộp ${t.count.done}/${t.count.total}` : ''}</span>
      </span>
      {dueChip(t)}
      <span className={`chip ${STATUS_CHIP[t.status]}`}>{STATUS_TEXT[t.status]}</span>
      <span className="ml-auto flex flex-wrap gap-1.5">
        {t.kind === 'personal' ? (
          <>
            {t.progress !== 'doing' && t.progress !== 'done' && <button type="button" onClick={() => move(t, 'doing')} className="btn-ghost btn-sm">Bắt đầu</button>}
            {t.progress !== 'done' ? <button type="button" onClick={() => move(t, 'done')} className="btn-primary btn-sm"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Xong</button> : <button type="button" onClick={() => move(t, 'todo')} className="btn-ghost btn-sm">Mở lại</button>}
            <button type="button" onClick={() => remove(t)} aria-label={`Xóa ${t.label}`} className="btn-ghost btn-sm !px-2.5 hover:!border-rose-300 hover:!text-rose-700"><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
          </>
        ) : t.kind === 'assigned' ? (
          t.status !== 'done' && <button type="button" onClick={() => openTask(t)} className="btn-primary btn-sm"><Send className="h-3.5 w-3.5" aria-hidden /> {t.ackOnly ? 'Tôi đã đọc' : 'Nộp minh chứng'}</button>
        ) : (
          <button type="button" onClick={() => openTask(t)} className="btn-ghost btn-sm"><ExternalLink className="h-3.5 w-3.5" aria-hidden /> Mở bảng</button>
        )}
      </span>
    </li>
  );

  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; });
  const todayKey = dayKey(new Date(now));

  return (
    <main className="mx-auto w-full max-w-[min(100%,1500px)] space-y-4 px-4 py-5 pb-28 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Công việc của tôi</h1>
          <p className="text-sm text-ink-2">{open} việc chưa xong{overdue > 0 ? <> · <b className="text-rose-700">{overdue} quá hạn</b></> : null}{myEmail ? ` · ${myEmail}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {teamBoards.length > 0 && <button type="button" onClick={() => setAssignOpen((v) => !v)} aria-expanded={assignOpen} className="btn-ghost"><UserPlus className="h-4 w-4" aria-hidden /> Giao việc cho đồng nghiệp</button>}
          <div className="flex rounded-full border-[1.5px] border-brand-200 bg-white p-0.5" role="group" aria-label="Cách xem">
            {([['list', 'Danh sách', ListChecks], ['kanban', 'Kanban', Columns3], ['week', 'Lịch tuần', CalendarDays]] as const).map(([id, label, Icon]) => (
              <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold max-lg:min-h-[44px] max-lg:min-w-[44px] max-lg:justify-center ${view === id ? 'bg-brand-600 text-white' : 'text-ink-2 hover:bg-brand-50'}`}><Icon className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">{label}</span></button>
            ))}
          </div>
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p>}
      {assignOpen && <AssignPanel boards={teamBoards} store={store} onDone={() => setAssignOpen(false)} onError={setError} />}
      <QuickAdd onAdd={(t, p, d) => run(() => addPersonal(t, p, d))} />

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo nguồn">
        {KIND_TABS.map((k) => <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)} className={`chip cursor-pointer !px-3 !py-1.5 text-sm max-lg:!min-h-[44px] ${kind === k.id ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-2 ring-brand-200 hover:bg-brand-50'}`}>{k.label} ({kindCount(k.id)})</button>)}
      </div>

      {view !== 'kanban' && (
        <div className="flex flex-wrap gap-1 border-b border-brand-100" role="tablist" aria-label="Lọc theo tình trạng">
          {STATUS_TABS.map((s) => <button key={s.id} type="button" role="tab" aria-selected={status === s.id} onClick={() => setStatus(s.id)} className={`-mb-px border-b-[3px] px-3 py-2 text-sm font-extrabold max-lg:min-h-[44px] ${status === s.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-2 hover:text-ink'}`}>{s.label} ({count(s.id)})</button>)}
        </div>
      )}

      {loadingAssigned && <p className="flex items-center gap-2 text-sm text-ink-2" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Đang lấy việc người khác giao…</p>}

      {view === 'list' && (shown.length === 0
        ? <p className="rounded-2xl border border-dashed border-brand-200 bg-white/70 p-8 text-center text-ink-2">{all.length === 0 ? 'Chưa có việc nào. Thêm việc riêng ở ô phía trên, hoặc nhờ tổ trưởng nhập Gmail của bạn vào danh sách tổ.' : 'Không có việc nào ở mục này.'}</p>
        : <ul className="space-y-2">{shown.map(row)}</ul>)}

      {view === 'kanban' && (
        <section aria-label="Kanban việc riêng" className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {COLS.map((c) => <KanbanCol key={c.id} col={c} tasks={personal.filter((t) => (t.progress ?? 'todo') === c.id)} lookup={personal} now={now} onMove={move} onRemove={remove} />)}
          {personal.length === 0 && <p className="text-sm text-ink-2 md:col-span-3">Kanban chỉ gồm việc riêng. Thêm việc ở ô phía trên.</p>}
        </section>
      )}

      {view === 'week' && (
        <section aria-label="Lịch tuần">
          <div className="mb-2 flex items-center gap-2">
            <button type="button" onClick={() => setWeekStart((w) => { const d = new Date(w); d.setDate(d.getDate() - 7); return d; })} className="btn-ghost btn-sm" aria-label="Tuần trước"><ChevronLeft className="h-4 w-4" aria-hidden /></button>
            <b className="text-sm">{pad(days[0].getDate())}/{pad(days[0].getMonth() + 1)} – {pad(days[6].getDate())}/{pad(days[6].getMonth() + 1)}/{days[6].getFullYear()}</b>
            <button type="button" onClick={() => setWeekStart((w) => { const d = new Date(w); d.setDate(d.getDate() + 7); return d; })} className="btn-ghost btn-sm" aria-label="Tuần sau"><ChevronRight className="h-4 w-4" aria-hidden /></button>
            <button type="button" onClick={() => setWeekStart(startOfWeek(new Date()))} className="btn-ghost btn-sm">Tuần này</button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
            {days.map((d, i) => {
              const list = byKind.filter((t) => t.dueAt && dayKey(new Date(t.dueAt)) === dayKey(d));
              return (
                <div key={i} className={`min-h-[120px] rounded-2xl border-[1.5px] p-2 ${dayKey(d) === todayKey ? 'border-brand-500 bg-brand-50' : 'border-brand-100 bg-white'}`}>
                  <p className="text-xs font-extrabold text-ink-2">{['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'][i]} · {pad(d.getDate())}/{pad(d.getMonth() + 1)}</p>
                  <ul className="mt-1 space-y-1">
                    {list.map((t) => (
                      <li key={t.key} className={`rounded-lg px-2 py-1 text-xs font-bold ring-1 ${STATUS_CHIP[t.status]}`} title={`${t.label} · ${t.kind === 'personal' ? 'Việc riêng' : t.boardTitle}`}>
                        <span className="block truncate">{t.label}</span>
                        <span className="block truncate font-medium opacity-80">{new Date(t.dueAt as string).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} · {STATUS_TEXT[t.status]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          {byKind.some((t) => !t.dueAt) && <p className="mt-2 text-xs text-ink-2">{byKind.filter((t) => !t.dueAt).length} việc không có hạn nên không hiện trên lịch.</p>}
        </section>
      )}
    </main>
  );
}

function QuickAdd({ onAdd }: { onAdd: (title: string, priority: 'high' | 'normal' | 'low', due: string) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<'high' | 'normal' | 'low'>('normal');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!title.trim()) { document.getElementById('mt-title')?.focus(); return; }
    setBusy(true);
    try { await onAdd(title.trim(), priority, due); setTitle(''); setDue(''); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-wrap items-end gap-2 rounded-2xl border-[1.5px] border-brand-100 bg-white p-3" aria-label="Thêm việc riêng">
      <div className="min-w-[200px] flex-1 basis-64">
        <label htmlFor="mt-title" className="field-label">Thêm việc riêng</label>
        <input id="mt-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ví dụ: Soạn đề kiểm tra giữa kỳ" />
      </div>
      <div>
        <label htmlFor="mt-pri" className="field-label">Ưu tiên</label>
        <select id="mt-pri" className="input" value={priority} onChange={(e) => setPriority(e.target.value as 'high' | 'normal' | 'low')}>
          <option value="high">Cao</option><option value="normal">Vừa</option><option value="low">Thấp</option>
        </select>
      </div>
      <div>
        <label htmlFor="mt-due" className="field-label">Hạn</label>
        <input id="mt-due" type="datetime-local" className="input" value={due} onChange={(e) => setDue(e.target.value)} />
      </div>
      <button type="submit" disabled={busy} className="btn-primary"><Plus className="h-4 w-4" aria-hidden /> Thêm</button>
    </form>
  );
}

function KanbanCol({ col, tasks, lookup, now, onMove, onRemove }: { col: { id: 'todo' | 'doing' | 'done'; label: string }; tasks: MyTask[]; lookup: MyTask[]; now: number; onMove: (t: MyTask, p: 'todo' | 'doing' | 'done') => void; onRemove: (t: MyTask) => void }) {
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
        {tasks.map((t) => (
            <li key={t.key} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', t.key)} className={`cursor-grab rounded-xl border-[1.5px] bg-white p-2.5 ${t.status === 'overdue' ? 'border-rose-300' : 'border-brand-100'}`}>
              <p className="flex items-start gap-2 text-sm font-bold"><span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${PRIORITY_DOT[t.priority]}`} aria-label={`Ưu tiên ${PRIORITY_TEXT[t.priority]}`} />{t.label}</p>
              {t.dueAt && <p className={`mt-1 flex items-center gap-1 text-xs ${t.status === 'overdue' ? 'font-bold text-rose-700' : 'text-ink-2'}`}>{t.status === 'overdue' ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> : <Circle className="h-3 w-3" aria-hidden />} {formatDateTime(t.dueAt)} · {countdown(t.dueAt, now)}</p>}
              <div className="mt-2 flex flex-wrap gap-1">
                {COLS.filter((c) => c.id !== col.id).map((c) => <button key={c.id} type="button" onClick={() => onMove(t, c.id)} className="btn-ghost btn-sm !min-h-[32px]">→ {c.label}</button>)}
                <button type="button" onClick={() => onRemove(t)} aria-label={`Xóa ${t.label}`} className="btn-ghost btn-sm !min-h-[32px] !px-2 hover:!border-rose-300 hover:!text-rose-700"><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
              </div>
            </li>
        ))}
      </ul>
    </div>
  );
}

/** Giao việc cho đồng nghiệp theo Gmail: Gmail chưa có trong danh sách tổ thì được thêm vào, việc chỉ tính cho đúng những người đó. */
function AssignPanel({ boards, store, onDone, onError }: { boards: BoardData[]; store: BoardStore; onDone: () => void; onError: (m: string) => void }) {
  const [boardId, setBoardId] = useState(boards[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [emails, setEmails] = useState('');
  const [evidence, setEvidence] = useState(true);
  const [busy, setBusy] = useState(false);
  const list = [...new Set(emails.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))];

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const b = boards.find((x) => x.id === boardId);
    if (!b) return;
    if (!title.trim()) { onError('Hãy nhập tên việc.'); return; }
    if (list.length === 0) { onError('Hãy nhập ít nhất một Gmail hợp lệ.'); return; }
    setBusy(true); onError('');
    try {
      const known = new Set(b.roster.map((m) => (m.email ?? '').toLowerCase()));
      const fresh = list.filter((m) => !known.has(m));
      if (fresh.length > 0) await store.setRoster(b.id, [...b.roster, ...fresh.map((m, i) => ({ id: `gm-${Date.now()}-${i}`, name: m.split('@')[0], unit: '', email: m }))]);
      await store.saveTask(b.id, null, { label: title.trim(), lessonId: null, kind: 'requirement', instructions: '', assignedAt: new Date().toISOString(), dueAt: fromLocalInput(due), allowLate: true, targetUnits: [], needsEvidence: evidence, ackOnly: !evidence, assigneeEmails: list });
      setTitle(''); setEmails(''); setDue(''); onDone();
    } catch (err) { onError(err instanceof Error ? err.message : 'Không giao được việc.'); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="grid grid-cols-1 gap-3 rounded-2xl border-[1.5px] border-brand-200 bg-brand-50/60 p-3 md:grid-cols-2" aria-label="Giao việc cho đồng nghiệp">
      <div className="space-y-3">
        <div><label htmlFor="as-board" className="field-label">Bảng của tổ</label>
          <select id="as-board" className="input" value={boardId} onChange={(e) => setBoardId(e.target.value)}>{boards.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</select></div>
        <div><label htmlFor="as-title" className="field-label">Tên việc *</label>
          <input id="as-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ví dụ: Nộp báo cáo thi đua tháng 12" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="as-due" className="field-label">Hạn</label><input id="as-due" type="datetime-local" className="input" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          <label className="mt-6 flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={evidence} onChange={(e) => setEvidence(e.target.checked)} /> Cần nộp minh chứng</label>
        </div>
      </div>
      <div className="space-y-3">
        <div><label htmlFor="as-mail" className="field-label">Gmail người nhận * <span className="font-normal text-ink-2">(cách nhau bằng dấu phẩy hoặc xuống dòng)</span></label>
          <textarea id="as-mail" className="input min-h-[96px] py-2 text-base" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="thaya@gmail.com, cob@gmail.com" /></div>
        <p className="text-xs text-ink-2">{list.length > 0 ? `${list.length} người nhận. ` : ''}Người nhận thấy việc này trong “Công việc của tôi” khi đăng nhập đúng Gmail đó.</p>
        <div className="flex justify-end gap-2"><button type="button" onClick={onDone} className="btn-ghost">Hủy</button><button type="submit" disabled={busy} className="btn-primary"><Send className="h-4 w-4" aria-hidden /> {busy ? 'Đang giao…' : 'Giao việc'}</button></div>
      </div>
    </form>
  );
}
