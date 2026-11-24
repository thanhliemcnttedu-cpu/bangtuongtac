import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowDown, ArrowUp, CalendarDays, CheckCircle2, Copy, FileText, History, ListChecks, Loader2, NotebookPen, Pencil, Plus, RotateCcw, Trash2, Undo2, X } from 'lucide-react';
import type { Attachment, ItemStatus, TaskLog, TaskProgress, TaskSubItem } from '../types/board';
import type { BoardStore, ItemInput } from '../hooks/useBoardStore';
import { fromLocalInput, toLocalInput } from '../lib/lessons';
import { splitChecklist, toggleChecklistItem } from '../lib/checklist';
import { taskToInput } from '../lib/recurrence';
import { formatSize } from '../lib/media';
import {
  ACTION_LABEL, EVIDENCE_GROUPS, FIELD_LABEL, ITEM_STATUS, ITEM_STATUS_ORDER, PROGRESS_META, PROGRESS_ORDER, buildPlanReport, categoryOf, fmtDay, fmtTime, itemOverdue, itemStats,
} from '../lib/taskPlan';
import { ModalShell } from './ModalShell';
import { TaskDocs } from './TaskDocs';

type Tab = 'overview' | 'items' | 'progress' | 'docs' | 'log' | 'report';
const TABS: [Tab, string][] = [['overview', 'Tổng quan'], ['items', 'Đầu việc'], ['progress', 'Tiến độ'], ['docs', 'Tài liệu'], ['log', 'Nhật ký'], ['report', 'Báo cáo']];

interface Props {
  store: BoardStore;
  boardId: string;
  taskId: string;
  /** Người dùng được sửa (chủ bảng): chỉ xem thì ẩn các nút ghi. */
  canEdit: boolean;
  onClose: () => void;
  /** Báo cho trang danh sách tải lại tiến độ sau mỗi thay đổi. */
  onChanged: () => void;
  /** Mở biểu mẫu sửa thông tin công việc (chỉ việc riêng). */
  onEdit?: () => void;
}

const fmtVal = (k: string, v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (k === 'status') return ITEM_STATUS[v as ItemStatus]?.label ?? String(v);
  if (k === 'progress') return PROGRESS_META[v as TaskProgress]?.label ?? String(v);
  if (k === 'plannedAt' || k === 'doneAt' || k === 'startedAt') return `${fmtDay(String(v))} ${fmtTime(String(v))}`.trim();
  if (Array.isArray(v)) return v.join(', ') || '—';
  return String(v).replace(/\s+/g, ' ').slice(0, 140);
};

const EMPTY_INPUT = (sort: number): ItemInput => ({ title: '', subject: '', plannedAt: null, status: 'todo', result: '', note: '', startedAt: null, doneAt: null, sort, keep: [], files: [], links: [], group: EVIDENCE_GROUPS[2] });
export const itemInputOf = (it: TaskSubItem): ItemInput => ({ title: it.title, subject: it.subject, plannedAt: it.plannedAt, status: it.status, result: it.result, note: it.note, startedAt: it.startedAt, doneAt: it.doneAt, sort: it.sort, keep: it.attachments, files: [], links: [], group: EVIDENCE_GROUPS[2] });

/**
 * Trang chi tiết một công việc tổng: tổng quan, các đầu việc thành phần (mỗi đầu việc có kết quả, minh chứng, nhật ký riêng),
 * tiến độ tự tính, tài liệu và minh chứng, nhật ký chỉ thêm, và báo cáo tự tổng hợp.
 */
export function TaskDetailModal({ store, boardId, taskId, canEdit, onClose, onChanged, onEdit }: Props) {
  const task = store.boards.find((b) => b.id === boardId)?.tasks.find((t) => t.id === taskId);
  const [tab, setTab] = useState<Tab>('overview');
  const [items, setItems] = useState<TaskSubItem[]>([]);
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<string | null>(null); // 'new' hoặc mã đầu việc
  const [showDeleted, setShowDeleted] = useState(false);
  const [filter, setFilter] = useState<ItemStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [logItem, setLogItem] = useState('all');
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async (): Promise<void> => {
    try {
      const r = await store.loadTaskItems(boardId, taskId);
      setItems(r.items);
      setLogs([...r.logs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setNow(Date.now());
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được đầu việc.'); } finally { setLoading(false); }
  }, [store, boardId, taskId]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [boardId, taskId]);

  const run = async (fn: () => Promise<void>, ok?: string): Promise<void> => {
    setError(''); setNotice('');
    try { await fn(); await load(); onChanged(); if (ok) { setNotice(ok); window.setTimeout(() => setNotice(''), 3500); } } catch (e) { setError(e instanceof Error ? e.message : 'Không thực hiện được.'); }
  };

  const live = useMemo(() => items.filter((i) => !i.deletedAt), [items]);
  const st = useMemo(() => itemStats(items, now), [items, now]);
  const nameOf = (id: string | null): string => { const it = items.find((x) => x.id === id); return it ? (it.subject || it.title) : 'Công việc tổng'; };
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => (showDeleted ? true : !i.deletedAt) && (filter === 'all' || i.status === filter) && (!q || `${i.title} ${i.subject}`.toLowerCase().includes(q)));
  }, [items, showDeleted, filter, query]);

  const cat = categoryOf(task?.category);
  const nextSort = items.reduce((m, i) => Math.max(m, i.sort), -1) + 1;

  const quickDone = (it: TaskSubItem): void => { void run(async () => { await store.saveTaskItem(boardId, taskId, it, { ...itemInputOf(it), status: 'done' }, ''); }, 'Đã đánh dấu hoàn thành.'); };
  const reopen = (it: TaskSubItem): void => { void run(async () => { await store.saveTaskItem(boardId, taskId, it, { ...itemInputOf(it), status: 'doing' }, 'Mở lại'); }, 'Đã mở lại đầu việc.'); };
  const remove = (it: TaskSubItem): void => {
    const reason = window.prompt(`Xóa đầu việc “${it.subject || it.title}”? Có thể khôi phục lại sau.\nLý do (không bắt buộc):`);
    if (reason === null) return;
    void run(async () => { await store.setTaskItemDeleted(boardId, it, true, reason); }, 'Đã xóa (có thể khôi phục).');
  };
  const move = (it: TaskSubItem, dir: -1 | 1): void => {
    const list = items.filter((i) => !i.deletedAt);
    const i = list.findIndex((x) => x.id === it.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    void run(async () => { await store.reorderTaskItems(boardId, taskId, next); });
  };

  const toggleCheck = (idx: number): void => {
    if (!task) return;
    void run(async () => { await store.saveTask(boardId, taskId, { ...taskToInput(task), instructions: toggleChecklistItem(task.instructions ?? '', idx) }); });
  };

  if (!task) return null;
  const { note, items: checks } = splitChecklist(task.instructions ?? '');
  const itemSel = (it: TaskSubItem) => (
    <span className={`chip ${ITEM_STATUS[it.status].chip}`}>{ITEM_STATUS[it.status].label}</span>
  );

  return (
    <ModalShell title={task.label} onClose={onClose} maxWidth="max-w-5xl">
      <div className="-mt-2 mb-3 flex flex-wrap items-center gap-1.5 text-xs">
        {cat && <span className="chip" style={{ background: cat.soft, color: cat.text, boxShadow: 'none' }}><cat.Icon className="h-3 w-3" aria-hidden /> {cat.label}</span>}
        <span className={`chip ${PROGRESS_META[task.progress ?? 'todo'].chip}`}>{PROGRESS_META[task.progress ?? 'todo'].label}</span>
        {st.all > 0 && <span className="chip bg-white text-brand-800 ring-brand-200"><ListChecks className="h-3 w-3" aria-hidden /> {st.done}/{st.valid} đầu việc · {st.pct}%</span>}
        {st.overdue > 0 && <span className="chip bg-rose-50 text-rose-800 ring-rose-200">{st.overdue} quá hạn</span>}
      </div>

      <div role="tablist" aria-label="Các phần của công việc" className="mb-4 flex gap-1 overflow-x-auto border-b border-brand-100">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`-mb-px shrink-0 border-b-[3px] px-3 py-2 text-sm font-extrabold max-lg:min-h-[44px] ${tab === id ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-2 hover:text-ink'}`}>
            {label}{id === 'items' && st.all > 0 ? ` (${st.all})` : ''}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p>}
      {notice && <p role="status" className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">{notice}</p>}
      {loading && <p className="flex items-center gap-2 text-sm text-ink-2" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Đang tải…</p>}

      {/* ---------- TỔNG QUAN ---------- */}
      {tab === 'overview' && (
        <section className="space-y-4" aria-label="Tổng quan">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {([['Bắt đầu', task.startAt], ['Hạn hoàn thành', task.dueAt], ['Hạn báo cáo / nộp', task.reportDueAt], ['Hoàn thành thực tế', task.completedAt]] as const).map(([l, v]) => (
              <div key={l} className="rounded-xl bg-brand-50/70 p-2.5"><p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-3">{l}</p><p className="text-sm font-bold">{v ? `${fmtDay(v)} ${fmtTime(v)}` : '—'}</p></div>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {canEdit && (
              <div>
                <label htmlFor="td-prog" className="field-label">Trạng thái công việc</label>
                <select id="td-prog" className="input" value={task.progress ?? 'todo'} onChange={(e) => void run(async () => { await store.setTaskProgress(boardId, taskId, e.target.value as TaskProgress); }, 'Đã đổi trạng thái.')}>
                  {PROGRESS_ORDER.map((p) => <option key={p} value={p}>{PROGRESS_META[p].label}</option>)}
                </select>
              </div>
            )}
            {canEdit && onEdit && <button type="button" onClick={onEdit} className="btn-ghost max-lg:min-h-[44px]"><Pencil className="h-4 w-4" aria-hidden /> Sửa thông tin</button>}
            <p className="text-xs text-ink-2">Công việc tổng không tự hoàn thành dù các đầu việc con đã xong: bạn xác nhận hoàn thành ở đây.</p>
          </div>
          {task.repeat && task.repeat !== 'none' && <p className="text-sm text-ink-2">Việc lặp lại. Mỗi kỳ là một công việc riêng; kỳ trước giữ nguyên kết quả.{task.repeatUntil ? ` Lặp đến ${fmtDay(task.repeatUntil)}.` : ''}</p>}
          {note && <div><p className="field-label">Ghi chú / hướng dẫn</p><p className="whitespace-pre-line text-sm leading-relaxed text-ink-2">{note}</p></div>}
          {checks.length > 0 && (
            <div>
              <p className="field-label">Các việc nhỏ</p>
              <ul className="space-y-1">
                {checks.map((c, i) => (
                  <li key={`${c.text}-${i}`}><label className={`flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm max-lg:min-h-[44px] ${canEdit ? 'cursor-pointer hover:bg-brand-50' : ''}`}>
                    <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={c.done} disabled={!canEdit} onChange={() => toggleCheck(i)} /><span className={c.done ? 'text-ink-3 line-through' : ''}>{c.text}</span></label></li>
                ))}
              </ul>
            </div>
          )}
          {(task.attachments ?? []).length > 0 && <div><p className="field-label">Tài liệu kèm theo</p><TaskDocs task={task} className="" /></div>}
        </section>
      )}

      {/* ---------- ĐẦU VIỆC ---------- */}
      {tab === 'items' && (
        <section className="space-y-3" aria-label="Danh sách đầu việc">
          {canEdit && <BulkAdd onAdd={(rows) => run(async () => { await store.addTaskItems(boardId, taskId, rows, nextSort); }, `Đã thêm ${rows.length} đầu việc.`)} onSingle={() => setEditing('new')} />}
          {editing === 'new' && (
            <ItemEditor key="new" initial={EMPTY_INPUT(nextSort)} prev={null} onCancel={() => setEditing(null)}
              onSave={(inp, reason) => run(async () => { await store.saveTaskItem(boardId, taskId, null, inp, reason); setEditing(null); }, 'Đã thêm đầu việc.')} />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input className="input !min-h-[40px] max-w-xs flex-1" type="search" placeholder="Tìm đầu việc hoặc người…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Tìm đầu việc" />
            <select className="input !min-h-[40px] max-w-[11rem]" value={filter} onChange={(e) => setFilter(e.target.value as ItemStatus | 'all')} aria-label="Lọc theo trạng thái">
              <option value="all">Mọi trạng thái</option>{ITEM_STATUS_ORDER.map((s) => <option key={s} value={s}>{ITEM_STATUS[s].label}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-ink-2"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} /> Hiện đã xóa</label>
          </div>
          {shown.length === 0 && !loading && <p className="rounded-2xl border border-dashed border-brand-200 bg-white/70 p-6 text-center text-sm text-ink-2">{items.length === 0 ? 'Chưa có đầu việc nào. Thêm từng đầu việc hoặc dán danh sách (mỗi dòng một đầu việc) ở trên.' : 'Không có đầu việc phù hợp bộ lọc.'}</p>}
          <ul className="space-y-2">
            {shown.map((it) => {
              const over = itemOverdue(it, now);
              return (
                <li key={it.id} className={`rounded-2xl border-[1.5px] bg-white ${it.deletedAt ? 'border-dashed border-zinc-300 opacity-70' : over ? 'border-rose-300' : 'border-brand-100'}`}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                    <div className="min-w-0 flex-1 basis-52">
                      <p className={`text-sm font-extrabold ${it.status === 'done' || it.deletedAt ? 'text-ink-3' : ''} ${it.deletedAt ? 'line-through' : ''}`}>{it.subject || it.title}</p>
                      {it.subject && it.title !== it.subject && <p className="text-xs text-ink-2">{it.title}</p>}
                      {it.result && <p className="mt-0.5 line-clamp-2 text-xs text-ink-2">{it.result}</p>}
                    </div>
                    {it.plannedAt && <span className={`chip ${over ? 'bg-rose-50 text-rose-800 ring-rose-200' : 'bg-white text-ink-2 ring-brand-200'}`}><CalendarDays className="h-3 w-3" aria-hidden /> {fmtDay(it.plannedAt)}</span>}
                    {it.attachments.length > 0 && <span className="chip bg-white text-ink-2 ring-brand-200"><FileText className="h-3 w-3" aria-hidden /> {it.attachments.length}</span>}
                    {itemSel(it)}
                    {it.deletedAt ? (
                      canEdit && <button type="button" onClick={() => void run(async () => { await store.setTaskItemDeleted(boardId, it, false, ''); }, 'Đã khôi phục.')} className="btn-ghost btn-sm max-lg:!min-h-[44px]"><Undo2 className="h-3.5 w-3.5" aria-hidden /> Khôi phục</button>
                    ) : canEdit && (
                      <span className="ml-auto flex flex-wrap gap-1.5 max-lg:[&>*]:!min-h-[44px]">
                        {it.status !== 'done'
                          ? <button type="button" onClick={() => quickDone(it)} className="btn-primary btn-sm"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Hoàn thành</button>
                          : <button type="button" onClick={() => reopen(it)} className="btn-ghost btn-sm"><RotateCcw className="h-3.5 w-3.5" aria-hidden /> Mở lại</button>}
                        <button type="button" onClick={() => setEditing(editing === it.id ? null : it.id)} className="btn-ghost btn-sm"><Pencil className="h-3.5 w-3.5" aria-hidden /> Cập nhật</button>
                        <button type="button" onClick={() => { setLogItem(it.id); setTab('log'); }} className="btn-ghost btn-sm" aria-label={`Lịch sử ${it.subject || it.title}`}><History className="h-3.5 w-3.5" aria-hidden /></button>
                        <button type="button" onClick={() => move(it, -1)} className="btn-ghost btn-sm !px-2" aria-label="Chuyển lên"><ArrowUp className="h-3.5 w-3.5" aria-hidden /></button>
                        <button type="button" onClick={() => move(it, 1)} className="btn-ghost btn-sm !px-2" aria-label="Chuyển xuống"><ArrowDown className="h-3.5 w-3.5" aria-hidden /></button>
                        <button type="button" onClick={() => remove(it)} className="btn-ghost btn-sm !px-2 hover:!border-rose-300 hover:!text-rose-700" aria-label={`Xóa ${it.subject || it.title}`}><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
                      </span>
                    )}
                  </div>
                  {editing === it.id && (
                    <div className="border-t border-brand-100 p-3">
                      <ItemEditor initial={itemInputOf(it)} prev={it} onCancel={() => setEditing(null)}
                        onSave={(inp, reason) => run(async () => { await store.saveTaskItem(boardId, taskId, it, inp, reason); setEditing(null); }, 'Đã lưu đầu việc.')} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ---------- TIẾN ĐỘ ---------- */}
      {tab === 'progress' && (
        <section className="space-y-4" aria-label="Tiến độ">
          {st.all === 0 ? <p className="text-sm text-ink-2">Chưa có đầu việc nên chưa tính được tiến độ. Thêm đầu việc ở tab “Đầu việc”.</p> : (
            <>
              <div>
                <div className="flex items-end justify-between"><p className="text-3xl font-extrabold text-brand-700">{st.pct}%</p><p className="text-sm text-ink-2">{st.done} / {st.valid} đầu việc hoàn thành</p></div>
                <div className="mt-1 h-3 overflow-hidden rounded-full bg-brand-100" role="progressbar" aria-valuenow={st.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ công việc"><div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-teal2-500" style={{ width: `${st.pct}%` }} /></div>
                <p className="mt-1 text-xs text-ink-2">Tiến độ = hoàn thành / (tổng − đã hủy). Hoãn vẫn tính vào tổng; đã hủy không tính.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([['Tổng', st.all], ['Hoàn thành', st.done], ['Đang thực hiện', st.doing], ['Chưa thực hiện', st.todo], ['Chờ bổ sung', st.waiting], ['Hoãn', st.postponed], ['Đã hủy', st.cancelled], ['Quá hạn', st.overdue]] as const).map(([l, n]) => (
                  <div key={l} className={`rounded-xl p-2.5 ${l === 'Quá hạn' && n > 0 ? 'bg-rose-50 text-rose-800' : 'bg-brand-50/70'}`}><p className="text-2xl font-extrabold">{n}</p><p className="text-xs font-bold">{l}</p></div>
                ))}
              </div>
              <div>
                <p className="field-label">Theo trạng thái</p>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-6">
                  {ITEM_STATUS_ORDER.map((s) => {
                    const col = live.filter((i) => i.status === s);
                    return (
                      <div key={s} className="rounded-xl border border-brand-100 bg-white/70 p-2">
                        <p className="mb-1 flex items-center justify-between text-xs font-extrabold">{ITEM_STATUS[s].label}<span className="chip bg-white text-ink-2 ring-brand-200">{col.length}</span></p>
                        <ul className="space-y-1">{col.slice(0, 8).map((i) => <li key={i.id} className="truncate rounded-lg bg-white px-2 py-1 text-xs ring-1 ring-brand-100" title={i.subject || i.title}>{i.subject || i.title}{i.plannedAt ? ` · ${fmtDay(i.plannedAt).slice(0, 5)}` : ''}</li>)}{col.length > 8 && <li className="px-2 text-xs text-ink-3">+ {col.length - 8} đầu việc khác</li>}</ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {/* ---------- TÀI LIỆU VÀ MINH CHỨNG ---------- */}
      {tab === 'docs' && (
        <section className="space-y-4" aria-label="Tài liệu và minh chứng">
          <div><p className="field-label">Tài liệu của công việc</p>{(task.attachments ?? []).length > 0 ? <TaskDocs task={task} className="" /> : <p className="text-sm text-ink-3">Chưa có tài liệu kèm theo công việc này.</p>}</div>
          {[...EVIDENCE_GROUPS, 'Khác'].map((g) => {
            const rows = live.map((it) => ({ it, att: it.attachments.filter((a) => (a.group || 'Khác') === g || (g === 'Khác' && !EVIDENCE_GROUPS.includes(a.group ?? ''))) })).filter((r) => r.att.length > 0);
            if (rows.length === 0) return null;
            return (
              <div key={g}>
                <p className="field-label">{g}</p>
                <ul className="space-y-1.5">{rows.map(({ it, att }) => (
                  <li key={it.id} className="rounded-xl bg-white p-2 ring-1 ring-brand-100"><p className="text-xs font-bold text-ink-2">{it.subject || it.title}</p><TaskDocs task={{ id: it.id, label: it.title, attachments: att as Attachment[] }} className="mt-1" /></li>
                ))}</ul>
              </div>
            );
          })}
          {live.every((i) => i.attachments.length === 0) && <p className="text-sm text-ink-3">Chưa có minh chứng nào được đính kèm vào các đầu việc.</p>}
        </section>
      )}

      {/* ---------- NHẬT KÝ ---------- */}
      {tab === 'log' && (
        <section className="space-y-3" aria-label="Nhật ký hoạt động">
          {canEdit && <NoteForm onAdd={(text) => run(async () => { await store.addTaskNote(boardId, taskId, logItem === 'all' ? null : logItem, text); }, 'Đã ghi vào nhật ký.')} />}
          <div className="flex items-center gap-2">
            <label htmlFor="td-logitem" className="text-xs font-bold text-ink-2">Xem nhật ký của</label>
            <select id="td-logitem" className="input !min-h-[40px] max-w-xs" value={logItem} onChange={(e) => setLogItem(e.target.value)}>
              <option value="all">Tất cả</option>{items.map((i) => <option key={i.id} value={i.id}>{i.subject || i.title}{i.deletedAt ? ' (đã xóa)' : ''}</option>)}
            </select>
          </div>
          <p className="text-xs text-ink-2">Nhật ký chỉ thêm, không sửa hay xóa được: mọi thay đổi trạng thái, lịch, kết quả, minh chứng đều được giữ lại cùng giá trị cũ và mới.</p>
          <ol className="space-y-2">
            {logs.filter((l) => logItem === 'all' || l.itemId === logItem).map((l) => {
              const keys = Object.keys({ ...(l.before ?? {}), ...(l.after ?? {}) });
              return (
                <li key={l.id} className="rounded-xl bg-white p-2.5 ring-1 ring-brand-100">
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-2"><b className="text-sm text-ink">{ACTION_LABEL[l.action] ?? l.action}</b>{l.itemId ? `· ${nameOf(l.itemId)}` : ''}<span className="ml-auto">{fmtDay(l.createdAt)} {fmtTime(l.createdAt)} · {l.actor}</span></p>
                  {keys.length > 0 && !['tao_dau_viec', 'xoa', 'khoi_phuc'].includes(l.action) && (
                    <ul className="mt-1 space-y-0.5 text-xs">{keys.map((k) => <li key={k}><b>{FIELD_LABEL[k] ?? (k === 'progress' ? 'Trạng thái' : k)}:</b> <span className="text-ink-3">{fmtVal(k, l.before?.[k])}</span> → <span className="font-semibold">{fmtVal(k, l.after?.[k])}</span></li>)}</ul>
                  )}
                  {l.action === 'tao_dau_viec' && l.after && <p className="mt-1 text-xs text-ink-2">{fmtVal('title', l.after.subject || l.after.title)}{l.after.plannedAt ? ` · dự kiến ${fmtDay(String(l.after.plannedAt))}` : ''}</p>}
                  {l.note && <p className="mt-1 text-xs"><b>Ghi chú:</b> {l.note}</p>}
                </li>
              );
            })}
          </ol>
          {logs.length === 0 && !loading && <p className="text-sm text-ink-3">Chưa có hoạt động nào được ghi nhận.</p>}
        </section>
      )}

      {/* ---------- BÁO CÁO ---------- */}
      {tab === 'report' && <ReportTab title={task.label} items={items} now={now} />}
    </ModalShell>
  );
}

/** Thêm nhiều đầu việc một lượt: mỗi dòng một tên (người hoặc nội dung), cùng một ngày dự kiến chung. */
function BulkAdd({ onAdd, onSingle }: { onAdd: (rows: { title: string; subject: string; plannedAt: string | null }[]) => Promise<void>; onSingle: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const names = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    if (names.length === 0) return;
    setBusy(true);
    try { await onAdd(names.map((n) => ({ title: n, subject: n, plannedAt: fromLocalInput(date) }))); setText(''); setDate(''); setOpen(false); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onSingle} className="btn-primary max-lg:min-h-[44px]"><Plus className="h-4 w-4" aria-hidden /> Thêm đầu việc</button>
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="btn-ghost max-lg:min-h-[44px]"><ListChecks className="h-4 w-4" aria-hidden /> Thêm nhiều (mỗi dòng một đầu việc)</button>
      </div>
      {open && (
        <form onSubmit={(e) => void submit(e)} className="space-y-2 rounded-2xl bg-brand-50/70 p-3">
          <label htmlFor="bulk-text" className="field-label">Danh sách <span className="font-normal text-ink-2">(ví dụ tên từng giáo viên cần kiểm tra)</span></label>
          <textarea id="bulk-text" className="input min-h-[110px] py-2" value={text} onChange={(e) => setText(e.target.value)} placeholder={'Đồng chí A\nĐồng chí B\nĐồng chí C'} />
          <div className="flex flex-wrap items-end gap-2">
            <div><label htmlFor="bulk-date" className="field-label">Ngày dự kiến chung <span className="font-normal text-ink-2">(không bắt buộc, sửa riêng sau)</span></label><input id="bulk-date" type="datetime-local" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <button type="submit" disabled={busy || !text.trim()} className="btn-primary max-lg:min-h-[44px]">{busy ? 'Đang thêm…' : `Thêm ${text.split(/\r?\n/).filter((x) => x.trim()).length || ''} đầu việc`}</button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Biểu mẫu cập nhật một đầu việc: trạng thái, ngày, kết quả, ghi chú, minh chứng; mọi thay đổi được ghi nhật ký kèm lý do. */
function ItemEditor({ initial, prev, onSave, onCancel }: { initial: ItemInput; prev: TaskSubItem | null; onSave: (input: ItemInput, reason: string) => Promise<void>; onCancel: () => void }) {
  const [f, setF] = useState<ItemInput>(initial);
  const [planned, setPlanned] = useState(toLocalInput(initial.plannedAt));
  const [linkText, setLinkText] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = <K extends keyof ItemInput>(k: K, v: ItemInput[K]): void => setF((x) => ({ ...x, [k]: v }));
  const rescheduled = !!prev && (fromLocalInput(planned) ?? null) !== (prev.plannedAt ?? null);
  const statusChanged = !!prev && f.status !== prev.status;

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await onSave({ ...f, plannedAt: fromLocalInput(planned), links: linkText.split(/\r?\n|\s{2,}/).map((x) => x.trim()).filter(Boolean) }, reason); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Không lưu được.'); setBusy(false); }
  };
  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="grid grid-cols-1 gap-3 rounded-2xl border border-brand-200 bg-brand-50/50 p-3 lg:grid-cols-2" aria-label={prev ? 'Cập nhật đầu việc' : 'Thêm đầu việc'}>
      <div className="space-y-3">
        <div><label className="field-label" htmlFor="ie-subject">Người / đối tượng</label><input id="ie-subject" className="input" value={f.subject} onChange={(e) => set('subject', e.target.value)} placeholder="Ví dụ: Đồng chí A" autoFocus /></div>
        <div><label className="field-label" htmlFor="ie-title">Nội dung đầu việc</label><input id="ie-title" className="input" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Ví dụ: Kiểm tra hồ sơ chuyên môn" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="field-label" htmlFor="ie-date">Ngày dự kiến</label><input id="ie-date" type="datetime-local" className="input" value={planned} onChange={(e) => setPlanned(e.target.value)} /></div>
          <div><label className="field-label" htmlFor="ie-status">Trạng thái</label>
            <select id="ie-status" className="input" value={f.status} onChange={(e) => set('status', e.target.value as ItemStatus)}>{ITEM_STATUS_ORDER.map((s) => <option key={s} value={s}>{ITEM_STATUS[s].label}</option>)}</select></div>
        </div>
        {(rescheduled || statusChanged) && <div><label className="field-label" htmlFor="ie-reason">Lý do thay đổi <span className="font-normal text-ink-2">(lưu vào nhật ký)</span></label><input id="ie-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={rescheduled ? 'Ví dụ: Chuyển lịch do trùng tiết dạy' : 'Ví dụ: Chờ bổ sung hồ sơ'} /></div>}
        <div><label className="field-label" htmlFor="ie-result">Kết quả thực hiện</label><textarea id="ie-result" className="input min-h-[84px] py-2" value={f.result} onChange={(e) => set('result', e.target.value)} placeholder="Ví dụ: Đã kiểm tra hồ sơ, dự giờ và trao đổi tư vấn chuyên môn." /></div>
        <div><label className="field-label" htmlFor="ie-note">Ghi chú</label><textarea id="ie-note" className="input min-h-[52px] py-2" value={f.note} onChange={(e) => set('note', e.target.value)} /></div>
      </div>
      <div className="space-y-3">
        <fieldset className="space-y-2 rounded-2xl border border-brand-100 bg-white p-3">
          <legend className="field-label px-1">Minh chứng</legend>
          {f.keep.length > 0 && <ul className="space-y-1">{f.keep.map((a, i) => (
            <li key={`${a.url ?? a.name}-${i}`} className="flex items-center gap-2 rounded-xl bg-brand-50/60 px-2 py-1.5 text-sm"><FileText className="h-4 w-4 shrink-0 text-brand-700" aria-hidden /><span className="min-w-0 flex-1 truncate">{a.label || a.name}{a.group ? <span className="text-xs text-ink-3"> · {a.group}</span> : null}</span>
              <button type="button" onClick={() => set('keep', f.keep.filter((_, j) => j !== i))} aria-label={`Bỏ ${a.name}`} className="rounded-full p-1.5 text-ink-2 hover:bg-rose-50 hover:text-rose-700"><X className="h-4 w-4" aria-hidden /></button></li>
          ))}</ul>}
          {f.files.length > 0 && <ul className="space-y-1">{f.files.map((x, i) => (
            <li key={`${x.name}-${i}`} className="flex items-center gap-2 rounded-xl bg-brand-50/60 px-2 py-1.5 text-sm"><FileText className="h-4 w-4 shrink-0 text-brand-700" aria-hidden /><span className="min-w-0 flex-1 truncate">{x.name} <span className="text-xs text-ink-2">({formatSize(x.size)})</span></span>
              <button type="button" onClick={() => set('files', f.files.filter((_, j) => j !== i))} aria-label={`Bỏ ${x.name}`} className="rounded-full p-1.5 text-ink-2 hover:bg-rose-50 hover:text-rose-700"><X className="h-4 w-4" aria-hidden /></button></li>
          ))}</ul>}
          <div>
            <label htmlFor="ie-group" className="field-label">Loại minh chứng sắp thêm</label>
            <select id="ie-group" className="input" value={f.group} onChange={(e) => set('group', e.target.value)}>{EVIDENCE_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}</select>
          </div>
          <label className="btn-ghost btn-sm cursor-pointer max-lg:min-h-[44px]"><FileText className="h-3.5 w-3.5" aria-hidden /> Tải tệp / chụp ảnh
            <input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*" className="sr-only" onChange={(e) => { set('files', [...f.files, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }} />
          </label>
          <div><label htmlFor="ie-links" className="field-label">Liên kết (Google Drive, website…) <span className="font-normal text-ink-2">mỗi dòng một link</span></label><textarea id="ie-links" className="input min-h-[48px] py-2" value={linkText} onChange={(e) => setLinkText(e.target.value)} placeholder="https://drive.google.com/…" /></div>
        </fieldset>
        {prev && (prev.startedAt || prev.doneAt) && <p className="text-xs text-ink-2">{prev.startedAt ? `Bắt đầu thực tế: ${fmtDay(prev.startedAt)} ${fmtTime(prev.startedAt)}. ` : ''}{prev.doneAt ? `Hoàn thành thực tế: ${fmtDay(prev.doneAt)} ${fmtTime(prev.doneAt)}.` : ''}</p>}
      </div>
      {err && <p role="alert" className="text-sm font-bold text-rose-700 lg:col-span-2">{err}</p>}
      <div className="flex justify-end gap-2 lg:col-span-2">
        <button type="button" onClick={onCancel} className="btn-ghost max-lg:min-h-[44px]">Hủy</button>
        <button type="submit" disabled={busy} className="btn-primary max-lg:min-h-[44px]">{busy ? 'Đang lưu…' : prev ? 'Lưu cập nhật' : 'Thêm đầu việc'}</button>
      </div>
    </form>
  );
}

function NoteForm({ onAdd }: { onAdd: (text: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try { await onAdd(text); setText(''); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-wrap items-end gap-2 rounded-2xl bg-brand-50/70 p-3">
      <div className="min-w-[200px] flex-1"><label htmlFor="nf-text" className="field-label flex items-center gap-1"><NotebookPen className="h-4 w-4 text-brand-700" aria-hidden /> Ghi thêm vào nhật ký</label><input id="nf-text" className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ví dụ: Đã trao đổi với tổ trưởng, chờ phản hồi" /></div>
      <button type="submit" disabled={busy || !text.trim()} className="btn-primary max-lg:min-h-[44px]">Ghi</button>
    </form>
  );
}

function ReportTab({ title, items, now }: { title: string; items: TaskSubItem[]; now: number }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [copied, setCopied] = useState('');
  const f = from ? new Date(`${from}T00:00:00`).getTime() : null;
  const t = to ? new Date(`${to}T23:59:59`).getTime() : null;
  const text = useMemo(() => buildPlanReport({ title, items, from: f, to: t, now }), [title, items, f, t, now]);
  const copy = async (): Promise<void> => {
    try { await navigator.clipboard.writeText(text); setCopied('Đã sao chép báo cáo.'); } catch { setCopied('Không sao chép tự động được. Hãy bôi đen và sao chép thủ công.'); }
    window.setTimeout(() => setCopied(''), 3500);
  };
  return (
    <section className="space-y-3" aria-label="Báo cáo kết quả">
      <div className="flex flex-wrap items-end gap-3">
        <div><label htmlFor="rp-from" className="field-label">Từ ngày</label><input id="rp-from" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label htmlFor="rp-to" className="field-label">Đến ngày</label><input id="rp-to" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <button type="button" onClick={() => void copy()} className="btn-primary max-lg:min-h-[44px]"><Copy className="h-4 w-4" aria-hidden /> Sao chép báo cáo</button>
        {(from || to) && <button type="button" onClick={() => { setFrom(''); setTo(''); }} className="btn-ghost max-lg:min-h-[44px]">Bỏ giới hạn</button>}
      </div>
      <p className="text-xs text-ink-2">Báo cáo được tổng hợp từ các đầu việc và kết quả đã lưu, không có số liệu nào được thêm vào. Chọn khoảng ngày để chỉ liệt kê các đầu việc hoàn thành trong khoảng đó.</p>
      {copied && <p role="status" className="text-sm font-bold text-emerald-700">{copied}</p>}
      <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm leading-relaxed ring-1 ring-brand-100">{text}</pre>
    </section>
  );
}
