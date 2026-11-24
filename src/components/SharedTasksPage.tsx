import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ListChecks, Loader2, Lock, Paperclip, Pencil, RefreshCw, Repeat, Search } from 'lucide-react';
import type { TaskSubItem } from '../types/board';
import { getSharedTasks } from '../lib/boardApi';
import type { SharedTasks } from '../lib/boardApi';
import { personalStatus, sortMyTasks } from '../lib/myTasks';
import type { MyStatus, MyTask } from '../lib/myTasks';
import { splitChecklist } from '../lib/checklist';
import { renderRich } from '../lib/richText';
import { ITEM_STATUS, PROGRESS_META, categoryOf, fmtDay, fmtTime, itemOverdue, itemStats } from '../lib/taskPlan';
import { countdown, formatDateTime } from '../lib/lessons';
import { TaskDocs } from './TaskDocs';

const REPEAT_TEXT: Record<string, string> = { daily: 'Hằng ngày', weekdays: 'Thứ 2–6', weekly: 'Hằng tuần', monthly: 'Hằng tháng', quarterly: 'Hằng quý', semester: 'Hằng học kỳ', yearly: 'Hằng năm' };
const STATUS_TEXT: Record<MyStatus, string> = { todo: 'Chưa làm', doing: 'Đang làm', waiting: 'Chờ bổ sung', postponed: 'Hoãn', cancelled: 'Đã hủy', done: 'Đã xong', overdue: 'Quá hạn' };
const STATUS_CHIP: Record<MyStatus, string> = {
  todo: PROGRESS_META.todo.chip, doing: PROGRESS_META.doing.chip, waiting: PROGRESS_META.waiting.chip, postponed: PROGRESS_META.postponed.chip, cancelled: PROGRESS_META.cancelled.chip,
  done: 'bg-emerald-100 text-emerald-900 ring-emerald-300', overdue: 'bg-rose-100 text-rose-900 ring-rose-300',
};
type Focus = 'all' | 'doing' | 'overdue' | 'done';

/**
 * Trang xem "Công việc của tôi" qua link chia sẻ (/v/<mã>): chỉ đọc, dùng được trên máy tính bảng và điện thoại, không cần đăng nhập.
 * Chỉ chủ tài khoản đăng nhập đúng Gmail mới có nút "Chỉnh sửa" (khi chế độ link là xem và sửa); việc sửa luôn làm trong ứng dụng đã đăng nhập.
 */
export default function SharedTasksPage({ shareKey }: { shareKey: string }) {
  const [data, setData] = useState<SharedTasks | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [focus, setFocus] = useState<Focus>('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try { setData(await getSharedTasks(shareKey)); setError(''); setNow(Date.now()); } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được.'); } finally { setLoading(false); }
  }, [shareKey]);
  useEffect(() => { void load(); const t = window.setInterval(() => void load(), 60_000); return () => window.clearInterval(t); }, [load]);

  const tasks = useMemo<MyTask[]>(() => sortMyTasks((data?.tasks ?? []).map((t) => ({
    key: t.id, kind: 'personal' as const, boardId: '', boardTitle: '', shareToken: '', taskId: t.id, label: t.label, instructions: t.instructions ?? '', dueAt: t.dueAt ?? null,
    priority: t.priority ?? 'normal', status: personalStatus(t.progress ?? 'todo', t.dueAt ?? null, now), external: false, progress: t.progress ?? 'todo', category: t.category,
    startAt: t.startAt ?? null, reportDueAt: t.reportDueAt ?? null, completedAt: t.completedAt ?? null, attachments: t.attachments ?? [], repeat: t.repeat ?? 'none',
  }))), [data, now]);
  const itemsOf = useMemo(() => { const m = new Map<string, TaskSubItem[]>(); for (const i of data?.items ?? []) m.set(i.taskId, [...(m.get(i.taskId) ?? []), i]); return m; }, [data]);

  const q = query.trim().toLowerCase();
  const matches = (t: MyTask, f: Focus): boolean => f === 'all' || (f === 'doing' ? t.status === 'doing' : f === 'overdue' ? t.status === 'overdue' : t.status === 'done');
  const base = tasks.filter((t) => !q || t.label.toLowerCase().includes(q));
  const shown = base.filter((t) => matches(t, focus));
  const cards: [Focus, string, string][] = [['all', 'Tất cả', 'bg-white ring-brand-200'], ['doing', 'Đang thực hiện', 'bg-indigo-50 text-indigo-900 ring-indigo-200'], ['overdue', 'Quá hạn', 'bg-rose-50 text-rose-900 ring-rose-200'], ['done', 'Đã hoàn thành', 'bg-emerald-50 text-emerald-900 ring-emerald-200']];

  if (data === undefined && !error) return <p className="p-10 text-center text-ink-2" role="status"><Loader2 className="mr-2 inline h-5 w-5 animate-spin" aria-hidden /> Đang tải…</p>;
  if (error && !data) return <main className="mx-auto max-w-lg p-6 text-center"><p role="alert" className="rounded-2xl bg-rose-50 p-4 font-bold text-rose-800">{error}</p><button type="button" onClick={() => void load()} className="btn-primary mt-3">Thử lại</button></main>;
  if (data === null || !data) return (
    <main className="mx-auto max-w-lg space-y-3 p-6 text-center">
      <Lock className="mx-auto h-10 w-10 text-ink-3" aria-hidden />
      <h1 className="text-xl font-extrabold">Link không còn dùng được</h1>
      <p className="text-sm text-ink-2">Link này sai, hoặc chủ tài khoản đã tắt chia sẻ hay tạo link mới. Hãy xin lại link từ người chia sẻ.</p>
    </main>
  );

  return (
    <main className="mx-auto w-full max-w-5xl space-y-4 px-4 py-5 pb-16 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Công việc của tôi</h1>
          <p className="flex items-center gap-1.5 text-sm text-ink-2"><Lock className="h-4 w-4" aria-hidden /> Chỉ xem · cập nhật lúc {fmtTime(data.now)} {fmtDay(data.now)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.isOwner && data.mode === 'edit' && <a href="/?p=my" className="btn-primary max-lg:min-h-[44px]"><Pencil className="h-4 w-4" aria-hidden /> Chỉnh sửa</a>}
          <button type="button" onClick={() => void load()} disabled={loading} className="btn-ghost max-lg:min-h-[44px]"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden /> Làm mới</button>
        </div>
      </header>
      {data.isOwner
        ? <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-900">{data.mode === 'edit' ? 'Bạn đang đăng nhập đúng tài khoản chủ. Bấm “Chỉnh sửa” để mở ứng dụng và sửa công việc.' : 'Link này đang ở chế độ chỉ xem. Muốn sửa, hãy mở ứng dụng, hoặc đổi chế độ chia sẻ sang “Xem và sửa”.'}</p>
        : <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-ink-2">Bạn đang xem ở chế độ chỉ xem. Chỉ chủ tài khoản đăng nhập đúng Gmail mới sửa được.</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cards.map(([id, label, tone]) => (
          <button key={id} type="button" aria-pressed={focus === id} onClick={() => setFocus(id)} className={`rounded-2xl p-3 text-left ring-1 max-lg:min-h-[64px] ${tone} ${focus === id ? 'ring-2 !ring-brand-600' : ''}`}>
            <span className="block text-2xl font-extrabold leading-none">{base.filter((t) => matches(t, id)).length}</span><span className="mt-1 block text-xs font-bold">{label}</span>
          </button>
        ))}
      </div>
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden /><input type="search" className="input !pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm công việc…" aria-label="Tìm công việc" /></div>

      {shown.length === 0 && <p className="rounded-2xl border border-dashed border-brand-200 bg-white/70 p-8 text-center text-ink-2">Không có công việc nào ở mục này.</p>}
      <ul className="space-y-2">
        {shown.map((t) => {
          const opened = openId === t.key;
          const cat = categoryOf(t.category);
          const sub = itemsOf.get(t.taskId) ?? [];
          const st = itemStats(sub, now);
          const { note, items: checks } = splitChecklist(t.instructions);
          const docs = t.attachments ?? [];
          return (
            <li key={t.key} className={`overflow-hidden rounded-2xl border-[1.5px] bg-white ${t.status === 'overdue' ? 'border-rose-300' : 'border-brand-100'}`} style={cat ? { borderLeft: `5px solid ${cat.bar}` } : undefined}>
              <button type="button" aria-expanded={opened} onClick={() => setOpenId(opened ? null : t.key)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-left max-lg:min-h-[44px]">
                <span className="min-w-0 flex-1 basis-56">
                  <span className="flex items-start gap-1.5"><span className={`block text-sm font-extrabold ${t.status === 'done' ? 'text-ink-3 line-through' : ''}`}>{t.label}</span><ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-ink-3 transition ${opened ? 'rotate-180' : ''}`} aria-hidden /></span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {cat && <span className="chip" style={{ background: cat.soft, color: cat.text, boxShadow: 'none' }}><cat.Icon className="h-3 w-3" aria-hidden /> {cat.label}</span>}
                    {st.all > 0 && <span className="chip bg-brand-50 text-brand-800 ring-brand-200"><ListChecks className="h-3 w-3" aria-hidden /> {st.done}/{st.valid} đầu việc · {st.pct}%</span>}
                    {docs.length > 0 && <span className="chip bg-brand-50 text-brand-800 ring-brand-200"><Paperclip className="h-3 w-3" aria-hidden /> {docs.length}</span>}
                    {t.repeat && t.repeat !== 'none' && <span className="chip bg-violet-50 text-violet-800 ring-violet-200"><Repeat className="h-3 w-3" aria-hidden /> {REPEAT_TEXT[t.repeat]}</span>}
                  </span>
                  {st.all > 0 && <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-brand-100" aria-hidden><span className="block h-full rounded-full bg-gradient-to-r from-brand-500 to-teal2-500" style={{ width: `${st.pct}%` }} /></span>}
                </span>
                {t.dueAt ? <span className={`chip ${t.status === 'overdue' ? 'bg-rose-50 text-rose-800 ring-rose-200' : 'bg-white text-ink-2 ring-brand-200'}`}>{formatDateTime(t.dueAt)}{t.status === 'done' || t.status === 'cancelled' ? '' : ` · ${countdown(t.dueAt, now)}`}</span> : <span className="chip bg-white text-ink-3 ring-brand-100">Không hạn</span>}
                <span className={`chip ${STATUS_CHIP[t.status]}`}>{STATUS_TEXT[t.status]}</span>
              </button>
              {opened && (
                <div className="space-y-3 border-t border-brand-100 bg-brand-50/30 px-3 py-3">
                  {note && <div className="text-sm leading-relaxed text-ink-2">{renderRich(note)}</div>}
                  {checks.length > 0 && <ul className="space-y-1" aria-label="Các việc nhỏ">{checks.map((c, i) => <li key={`${c.text}-${i}`} className="flex items-start gap-2 text-sm"><CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${c.done ? 'text-emerald-600' : 'text-ink-3'}`} aria-hidden /><span className={c.done ? 'text-ink-3 line-through' : ''}>{c.text}</span></li>)}</ul>}
                  {sub.length > 0 && (
                    <ul className="space-y-1" aria-label="Đầu việc thành phần">
                      {sub.map((it) => (
                        <li key={it.id} className="rounded-xl bg-white px-2.5 py-1.5 text-sm ring-1 ring-brand-100">
                          <span className="flex flex-wrap items-center gap-2"><span className={`min-w-0 flex-1 truncate font-bold ${it.status === 'done' ? 'text-ink-3 line-through' : ''}`}>{it.subject || it.title}</span>
                            {it.plannedAt && <span className={`text-xs ${itemOverdue(it, now) ? 'font-bold text-rose-700' : 'text-ink-2'}`}>{fmtDay(it.plannedAt).slice(0, 5)}</span>}
                            <span className={`chip ${ITEM_STATUS[it.status].chip}`}>{ITEM_STATUS[it.status].label}</span></span>
                          {it.result && <span className="mt-0.5 block text-xs text-ink-2">{it.result}</span>}
                          {it.attachments.length > 0 && <TaskDocs task={{ id: it.id, label: it.title, attachments: it.attachments }} className="mt-1" />}
                        </li>
                      ))}
                    </ul>
                  )}
                  {docs.length > 0 && <TaskDocs task={{ id: t.taskId, label: t.label, attachments: docs }} className="" />}
                  {!note && checks.length === 0 && sub.length === 0 && docs.length === 0 && <p className="text-sm text-ink-3">Việc này chưa có ghi chú, đầu việc hay tệp đính kèm.</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
