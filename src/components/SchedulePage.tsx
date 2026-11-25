import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CalendarDays, Download, FileSpreadsheet, Loader2, Plus, Trash2 } from 'lucide-react';
import type { BoardStore } from '../hooks/useBoardStore';
import type { CalEvent, Timetable, TimetableEntry, TimetableNote } from '../types/schedule';
import * as api from '../lib/scheduleApi';
import type { EntryData, EventData } from '../lib/scheduleApi';
import { buildExport, kindOf } from '../lib/timetable';
import { TimetableViews } from './TimetableViews';
import type { ViewMode } from './TimetableViews';
import { TimetableImport } from './TimetableImport';
import { EntryEditor } from './EntryEditor';
import { EventForm, EventsView } from './EventsView';

const MODES: [ViewMode, string][] = [['day', 'Ngày'], ['week', 'Tuần'], ['month', 'Tháng'], ['class', 'Theo lớp'], ['subject', 'Theo môn']];

/**
 * Trang "Lịch": Thời khóa biểu (nhập từ Excel, xem theo ngày, tuần, tháng, lớp, môn, gắn giáo án vào từng tiết, ghi chú sau tiết dạy)
 * và Lịch công tác (họp, sinh hoạt tổ, dự giờ, tập huấn, nộp báo cáo… có thể tạo công việc nhắc từ sự kiện).
 */
export function SchedulePage({ store, onOpenTask }: { store: BoardStore; onOpenTask: (taskKey: string) => void }) {
  const personal = store.boards.find((b) => b.settings.personal && !b.deletedAt && (b.access ?? 'owner') === 'owner');
  const boardId = personal?.id ?? null;
  const [tab, setTab] = useState<'tkb' | 'events'>('tkb');
  const [mode, setMode] = useState<ViewMode>('day');
  const [anchor, setAnchor] = useState(() => new Date());
  const [tts, setTts] = useState<Timetable[]>([]);
  const [ttId, setTtId] = useState<string | null>(null);
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [notes, setNotes] = useState<TimetableNote[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [importing, setImporting] = useState(false);
  const [editEntry, setEditEntry] = useState<TimetableEntry | 'new' | null>(null);
  const [eventForm, setEventForm] = useState<{ event?: CalEvent } | null>(null);
  const [filterValue, setFilterValue] = useState('');

  const say = (m: string): void => { setNotice(m); window.setTimeout(() => setNotice(''), 4000); };

  const loadAll = useCallback(async (o?: { board?: string; tt?: string }): Promise<void> => {
    const bid = o?.board ?? boardId;
    if (!bid) { setTts([]); setTtId(null); setEntries([]); setNotes([]); setEvents([]); return; }
    setLoading(true);
    try {
      const list = await api.listTimetables(bid);
      setTts(list);
      const cur = list.find((t) => t.id === (o?.tt ?? ttId)) ?? list.find((t) => t.active) ?? list[0];
      setTtId(cur?.id ?? null);
      if (cur) { const es = await api.listEntries(cur.id); setEntries(es); setNotes(await api.listNotes(es.map((e) => e.id))); } else { setEntries([]); setNotes([]); }
      setEvents(await api.listEvents(bid));
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được lịch.'); } finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, ttId]);
  useEffect(() => { void loadAll(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  const classes = useMemo(() => [...new Set(entries.map((e) => e.className).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')), [entries]);
  const subjects = useMemo(() => [...new Set(entries.map((e) => e.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')), [entries]);
  const options = mode === 'class' ? classes : subjects;
  useEffect(() => { if ((mode === 'class' || mode === 'subject') && !options.includes(filterValue)) setFilterValue(options[0] ?? ''); }, [mode, options, filterValue]);

  const run = async (fn: () => Promise<void>): Promise<void> => { setError(''); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Không thực hiện được.'); } };
  const ensureBoard = async (): Promise<string> => boardId ?? (await store.ensurePersonalBoard()).id;
  const tasks = personal?.tasks ?? [];
  /** Bảng việc riêng phải có trước khi tải giáo án lên (tệp đi theo mã bảng). */
  const openNew = async (then: () => void): Promise<void> => { await run(async () => { if (!boardId) await store.ensurePersonalBoard(); then(); }); };

  const onImport = async (meta: { name: string; schoolYear: string; term: string }, list: EntryData[]): Promise<void> => {
    const bid = await ensureBoard();
    const tt = await api.createTimetable(bid, meta, list);
    await loadAll({ board: bid, tt: tt.id });
    setTab('tkb');
    say(`Đã nhập ${list.length} tiết vào “${tt.name}”.`);
  };
  const saveEntry = async (data: EntryData): Promise<void> => {
    const bid = await ensureBoard();
    let id = ttId;
    if (!id) { const tt = await api.createTimetable(bid, { name: 'Thời khóa biểu', schoolYear: '', term: '' }, []); id = tt.id; }
    await api.saveEntry(bid, id, editEntry && editEntry !== 'new' ? editEntry.id : null, data);
    await loadAll({ board: bid, tt: id });
    say('Đã lưu tiết học.');
  };
  const removeEntry = async (): Promise<void> => {
    if (!editEntry || editEntry === 'new') return;
    await api.deleteEntry(editEntry.id);
    await loadAll();
    say('Đã xóa tiết học.');
  };
  const saveNote = async (entry: TimetableEntry, day: string, text: string): Promise<void> => {
    const bid = await ensureBoard();
    await api.saveNote(bid, entry.id, day, text);
    setNotes(await api.listNotes(entries.map((e) => e.id)));
  };

  /** Tạo việc riêng từ sự kiện: hạn là giờ bắt đầu, nhóm theo loại sự kiện. */
  const makeTask = async (bid: string, d: EventData): Promise<string> => {
    const t = await store.saveTask(bid, null, {
      label: d.title, lessonId: null, kind: 'requirement', instructions: [d.description, d.location ? `Địa điểm: ${d.location}` : ''].filter(Boolean).join('\n'), assignedAt: null, dueAt: d.startsAt,
      allowLate: true, targetUnits: [], category: kindOf(d.kind).category, startAt: d.startsAt, attachments: d.attachments, progress: 'todo', priority: 'normal',
    });
    return t.id;
  };
  const saveEvent = async (data: EventData, createTask: boolean): Promise<void> => {
    const bid = await ensureBoard();
    const id = eventForm?.event?.id ?? null;
    const taskId = createTask ? await makeTask(bid, data) : data.taskId;
    await api.saveEvent(bid, id, { ...data, taskId });
    await loadAll({ board: bid });
    say(createTask ? 'Đã lưu sự kiện và tạo công việc nhắc.' : 'Đã lưu sự kiện.');
  };
  const makeTaskFor = (e: CalEvent): void => {
    void run(async () => {
      const bid = await ensureBoard();
      const taskId = await makeTask(bid, e);
      await api.saveEvent(bid, e.id, { ...e, taskId });
      await loadAll({ board: bid });
      say('Đã tạo công việc nhắc từ sự kiện.');
    });
  };

  const active = tts.find((t) => t.id === ttId);
  const download = (blob: Blob, name: string): void => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 2000); };

  return (
    <main className="mx-auto w-full max-w-[min(100%,1500px)] space-y-4 px-4 py-5 pb-28 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Lịch</h1>
          <p className="text-sm text-ink-2">Thời khóa biểu và lịch công tác của riêng bạn.</p>
        </div>
        <div className="flex rounded-full border-[1.5px] border-brand-200 bg-white p-0.5" role="tablist" aria-label="Chọn loại lịch">
          {([['tkb', 'Thời khóa biểu', CalendarDays], ['events', 'Lịch công tác', CalendarClock]] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold max-lg:min-h-[44px] ${tab === id ? 'bg-brand-600 text-white' : 'text-ink-2 hover:bg-brand-50'}`}><Icon className="h-4 w-4" aria-hidden /> {label}</button>
          ))}
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">{notice}</p>}
      {loading && <p className="flex items-center gap-2 text-sm text-ink-2" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Đang tải…</p>}

      {tab === 'tkb' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setImporting(true)} className="btn-primary max-lg:min-h-[44px]"><FileSpreadsheet className="h-4 w-4" aria-hidden /> Nhập từ Excel</button>
            <button type="button" onClick={() => void openNew(() => setEditEntry('new'))} className="btn-ghost max-lg:min-h-[44px]"><Plus className="h-4 w-4" aria-hidden /> Thêm tiết</button>
            {entries.length > 0 && <button type="button" onClick={() => download(buildExport(entries), `thoi-khoa-bieu-${(active?.schoolYear || 'hien-tai').replace(/\W+/g, '-')}.xlsx`)} className="btn-ghost max-lg:min-h-[44px]"><Download className="h-4 w-4" aria-hidden /> Xuất Excel</button>}
            {tts.length > 0 && (
              <span className="ml-auto flex flex-wrap items-center gap-2">
                <label htmlFor="sc-tt" className="sr-only">Thời khóa biểu đang xem</label>
                <select id="sc-tt" className="input !min-h-[40px] max-w-[18rem]" value={ttId ?? ''} onChange={(e) => void loadAll({ tt: e.target.value })}>
                  {tts.map((t) => <option key={t.id} value={t.id}>{t.name}{t.active ? ' (đang dùng)' : ''}</option>)}
                </select>
                {active && !active.active && boardId && <button type="button" onClick={() => void run(async () => { await api.setActiveTimetable(boardId, active.id); await loadAll(); say('Đã đặt làm thời khóa biểu đang dùng.'); })} className="btn-ghost btn-sm max-lg:!min-h-[44px]">Đặt làm bản đang dùng</button>}
                {active && <button type="button" aria-label="Xóa thời khóa biểu này" onClick={() => { if (window.confirm(`Xóa “${active.name}” cùng mọi tiết học và ghi chú của nó? Không thể hoàn tác.`)) void run(async () => { await api.deleteTimetable(active.id); await loadAll(); say('Đã xóa thời khóa biểu.'); }); }} className="btn-ghost btn-sm !px-2 max-lg:!min-h-[44px] max-lg:!min-w-[44px] hover:!border-rose-300 hover:!text-rose-700"><Trash2 className="h-4 w-4" aria-hidden /></button>}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1" role="group" aria-label="Cách xem lịch">
              {MODES.map(([id, label]) => <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)} className={`chip cursor-pointer !px-3 !py-1.5 text-sm max-lg:!min-h-[44px] ${mode === id ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-2 ring-brand-200 hover:bg-brand-50'}`}>{label}</button>)}
            </div>
            {(mode === 'class' || mode === 'subject') && (
              <select aria-label={mode === 'class' ? 'Chọn lớp' : 'Chọn môn'} className="input !min-h-[40px] max-w-[14rem]" value={filterValue} onChange={(e) => setFilterValue(e.target.value)}>
                {options.length === 0 && <option value="">Chưa có dữ liệu</option>}{options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
          </div>
          {entries.length === 0 && events.length === 0 && !loading ? (
            <p className="rounded-2xl border border-dashed border-brand-200 bg-white/70 p-8 text-center text-ink-2">Chưa có thời khóa biểu. Bấm “Nhập từ Excel” (có tệp mẫu để tải) hoặc “Thêm tiết” để nhập từng tiết.</p>
          ) : (
            <TimetableViews mode={mode} entries={entries} events={events} notes={notes} anchor={anchor} setAnchor={setAnchor} filterValue={filterValue} canEdit
              onEditEntry={setEditEntry} onEditEvent={(e) => { setTab('events'); setEventForm({ event: e }); }} onNote={saveNote} onPickDay={(d) => { setAnchor(d); setMode('day'); }} />
          )}
        </>
      )}

      {tab === 'events' && (
        <EventsView events={events} tasks={tasks} anchor={anchor} setAnchor={setAnchor} onAdd={() => void openNew(() => setEventForm({}))} onEdit={(e) => setEventForm({ event: e })}
          onOpenTask={(id) => onOpenTask(`p-${id}`)} onMakeTask={makeTaskFor} />
      )}

      {importing && <TimetableImport onImport={onImport} onClose={() => setImporting(false)} />}
      {editEntry && (
        <EntryEditor store={store} boardId={boardId ?? ''} entry={editEntry === 'new' ? undefined : editEntry} onSave={saveEntry} onDelete={editEntry !== 'new' ? removeEntry : undefined} onClose={() => setEditEntry(null)} />
      )}
      {eventForm && (
        <EventForm store={store} boardId={boardId} event={eventForm.event} tasks={tasks} defaultDay={anchor} onSave={saveEvent}
          onDelete={eventForm.event ? async () => { await api.deleteEvent((eventForm.event as CalEvent).id); await loadAll(); say('Đã xóa sự kiện.'); } : undefined} onClose={() => setEventForm(null)} />
      )}
    </main>
  );
}
