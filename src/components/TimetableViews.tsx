import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Paperclip, Pencil } from 'lucide-react';
import type { CalEvent, TimetableEntry, TimetableNote } from '../types/schedule';
import { WEEKDAYS, dayKey, entriesOnDate, eventsOnDate, kindOf, sortEntries, startOfWeekMon, timeLabel, weekdayOf } from '../lib/timetable';
import { TaskDocs } from './TaskDocs';

export type ViewMode = 'day' | 'week' | 'month' | 'class' | 'subject';

interface Props {
  mode: ViewMode;
  entries: TimetableEntry[];
  events: CalEvent[];
  notes: TimetableNote[];
  anchor: Date;
  setAnchor: (d: Date) => void;
  /** Giá trị đang lọc cho chế độ theo lớp / theo môn. */
  filterValue: string;
  canEdit: boolean;
  onEditEntry: (e: TimetableEntry) => void;
  onEditEvent: (e: CalEvent) => void;
  onNote: (entry: TimetableEntry, day: string, text: string) => Promise<void>;
  /** Bấm vào một ngày ở tuần / tháng: chuyển sang xem ngày đó. */
  onPickDay: (d: Date) => void;
}

const addDays = (d: Date, n: number): Date => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
const pad = (n: number): string => String(n).padStart(2, '0');
const longDay = (d: Date): string => `${WEEKDAYS[weekdayOf(d) - 1]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const clock = (iso: string): string => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

function EventChip({ ev, onClick }: { ev: CalEvent; onClick: () => void }) {
  const k = kindOf(ev.kind);
  return (
    <button type="button" onClick={onClick} className="block w-full truncate rounded-lg px-2 py-1 text-left text-xs font-bold ring-1 ring-black/5 max-lg:min-h-[36px]" style={{ background: k.soft, color: k.text, borderLeft: `4px solid ${k.bar}` }} title={`${k.label}: ${ev.title}`}>
      {clock(ev.startsAt)} {ev.title}
    </button>
  );
}

/** Ghi chú sau tiết dạy của một ngày: lưu khi rời ô nhập. */
function NoteBox({ entry, day, saved, onSave }: { entry: TimetableEntry; day: string; saved: string; onSave: (text: string) => Promise<void> }) {
  const [text, setText] = useState(saved);
  const [msg, setMsg] = useState('');
  useEffect(() => setText(saved), [saved, day, entry.id]);
  const commit = async (): Promise<void> => {
    if (text.trim() === saved.trim()) return;
    try { await onSave(text); setMsg('Đã lưu ghi chú.'); } catch (e) { setMsg(e instanceof Error ? e.message : 'Không lưu được.'); }
    window.setTimeout(() => setMsg(''), 2500);
  };
  return (
    <div>
      <label htmlFor={`nt-${entry.id}`} className="field-label">Ghi chú sau tiết dạy ngày này</label>
      <textarea id={`nt-${entry.id}`} className="input min-h-[56px] py-2" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => void commit()} placeholder="Ví dụ: Lớp hoàn thành bài 5, 3 em chưa nộp bài thực hành." />
      {msg && <p role="status" className="mt-0.5 text-xs font-bold text-brand-700">{msg}</p>}
    </div>
  );
}

/** Chế độ xem thời khóa biểu và lịch công tác: ngày, tuần, tháng, theo lớp, theo môn. */
export function TimetableViews({ mode, entries, events, notes, anchor, setAnchor, filterValue, canEdit, onEditEntry, onEditEvent, onNote, onPickDay }: Props) {
  const today = new Date();
  const noteOf = (entryId: string, day: string): string => notes.find((n) => n.entryId === entryId && n.day === day)?.note ?? '';

  const nav = (label: string, prev: () => void, next: () => void) => (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <button type="button" onClick={prev} className="btn-ghost btn-sm max-lg:!min-h-[44px]" aria-label="Trước"><ChevronLeft className="h-4 w-4" aria-hidden /></button>
      <b className="min-w-[10rem] text-center text-sm">{label}</b>
      <button type="button" onClick={next} className="btn-ghost btn-sm max-lg:!min-h-[44px]" aria-label="Sau"><ChevronRight className="h-4 w-4" aria-hidden /></button>
      <button type="button" onClick={() => setAnchor(new Date())} className="btn-ghost btn-sm max-lg:!min-h-[44px]">Hôm nay</button>
      <input type="date" aria-label="Chọn ngày" className="input !min-h-[36px] max-w-[11rem] max-lg:!min-h-[44px]" value={dayKey(anchor)} onChange={(e) => { if (e.target.value) setAnchor(new Date(`${e.target.value}T00:00:00`)); }} />
    </div>
  );

  const entryBtn = (e: TimetableEntry, compact = false) => (
    <button key={e.id} type="button" onClick={() => onEditEntry(e)} className={`block w-full rounded-xl bg-white px-2 py-1.5 text-left ring-1 ring-brand-200 transition hover:bg-brand-50 ${compact ? 'text-xs' : 'text-sm'} max-lg:min-h-[44px]`}>
      <span className="block text-[11px] font-bold text-ink-3">{timeLabel(e)}</span>
      <span className="block font-extrabold leading-tight">{e.subject}{e.className ? ` · ${e.className}` : ''}</span>
      {(e.room || e.location) && !compact && <span className="block text-xs text-ink-2">{[e.room, e.location].filter(Boolean).join(' · ')}</span>}
      {e.attachments.length > 0 && <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold text-brand-700"><Paperclip className="h-3 w-3" aria-hidden /> {e.attachments.length}</span>}
    </button>
  );

  /* ----- Ngày ----- */
  if (mode === 'day') {
    const list = entriesOnDate(entries, anchor);
    const evs = eventsOnDate(events, anchor);
    const dk = dayKey(anchor);
    return (
      <section aria-label="Lịch trong ngày">
        {nav(longDay(anchor), () => setAnchor(addDays(anchor, -1)), () => setAnchor(addDays(anchor, 1)))}
        {evs.length > 0 && <ul className="mb-3 space-y-1.5" aria-label="Lịch công tác trong ngày">{evs.map((ev) => <li key={ev.id}><EventChip ev={ev} onClick={() => onEditEvent(ev)} /></li>)}</ul>}
        {list.length === 0 && <p className="rounded-2xl border border-dashed border-brand-200 bg-white/70 p-8 text-center text-ink-2">{entries.length === 0 ? 'Chưa có thời khóa biểu. Bấm “Nhập từ Excel” để thêm.' : 'Ngày này không có tiết dạy.'}</p>}
        <ul className="space-y-2">
          {list.map((e) => (
            <li key={e.id} className="rounded-2xl border-[1.5px] border-brand-100 bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-ink-3">{timeLabel(e)}</p>
                  <p className="text-base font-extrabold">{e.subject}{e.className ? ` · Lớp ${e.className}` : ''}</p>
                  {(e.room || e.location) && <p className="flex items-center gap-1 text-sm text-ink-2"><MapPin className="h-3.5 w-3.5" aria-hidden /> {[e.room, e.location].filter(Boolean).join(' · ')}</p>}
                  {e.topic && <p className="mt-1 text-sm">{e.topic}</p>}
                  {e.note && <p className="text-xs text-ink-2">{e.note}</p>}
                </div>
                {canEdit && <button type="button" onClick={() => onEditEntry(e)} className="btn-ghost btn-sm max-lg:!min-h-[44px]"><Pencil className="h-3.5 w-3.5" aria-hidden /> Sửa / gắn giáo án</button>}
              </div>
              {e.attachments.length > 0 && <div className="mt-2"><p className="text-xs font-extrabold uppercase tracking-wide text-ink-3">Giáo án và tài liệu</p><TaskDocs task={{ id: e.id, label: e.subject, attachments: e.attachments }} className="mt-1" /></div>}
              {canEdit && <div className="mt-2"><NoteBox entry={e} day={dk} saved={noteOf(e.id, dk)} onSave={(t) => onNote(e, dk, t)} /></div>}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  /* ----- Tuần ----- */
  if (mode === 'week') {
    const start = startOfWeekMon(anchor);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    return (
      <section aria-label="Lịch tuần">
        {nav(`${pad(days[0].getDate())}/${pad(days[0].getMonth() + 1)} – ${pad(days[6].getDate())}/${pad(days[6].getMonth() + 1)}/${days[6].getFullYear()}`, () => setAnchor(addDays(anchor, -7)), () => setAnchor(addDays(anchor, 7)))}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
          {days.map((d) => {
            const list = entriesOnDate(entries, d);
            const evs = eventsOnDate(events, d);
            const isToday = dayKey(d) === dayKey(today);
            return (
              <div key={dayKey(d)} className={`min-h-[110px] rounded-2xl border-[1.5px] p-2 ${isToday ? 'border-brand-500 bg-brand-50' : 'border-brand-100 bg-white/80'}`}>
                <button type="button" onClick={() => onPickDay(d)} className="mb-1 block w-full text-left text-xs font-extrabold text-ink-2 hover:text-brand-700 max-lg:min-h-[36px]">{WEEKDAYS[weekdayOf(d) - 1]} · {pad(d.getDate())}/{pad(d.getMonth() + 1)}</button>
                <div className="space-y-1">
                  {evs.map((ev) => <EventChip key={ev.id} ev={ev} onClick={() => onEditEvent(ev)} />)}
                  {list.map((e) => entryBtn(e, true))}
                  {list.length === 0 && evs.length === 0 && <p className="text-xs text-ink-3">Trống</p>}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  /* ----- Tháng ----- */
  if (mode === 'month') {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = startOfWeekMon(first);
    const weeks = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(gridStart, w * 7 + i))).filter((row) => row.some((d) => d.getMonth() === first.getMonth()));
    return (
      <section aria-label="Lịch tháng">
        {nav(`Tháng ${first.getMonth() + 1}/${first.getFullYear()}`, () => setAnchor(new Date(first.getFullYear(), first.getMonth() - 1, 1)), () => setAnchor(new Date(first.getFullYear(), first.getMonth() + 1, 1)))}
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-extrabold text-ink-3">{WEEKDAYS.map((w) => <span key={w}>{w.replace('Thứ ', 'T').replace('Chủ nhật', 'CN')}</span>)}</div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {weeks.flat().map((d) => {
            const inMonth = d.getMonth() === first.getMonth();
            const n = entriesOnDate(entries, d).length;
            const evs = eventsOnDate(events, d);
            const isToday = dayKey(d) === dayKey(today);
            return (
              <button key={dayKey(d)} type="button" onClick={() => onPickDay(d)} aria-label={`${longDay(d)}: ${n} tiết, ${evs.length} sự kiện`}
                className={`min-h-[64px] rounded-xl border p-1 text-left transition hover:bg-brand-50 lg:min-h-[96px] ${isToday ? 'border-brand-500 bg-brand-50' : 'border-brand-100 bg-white'} ${inMonth ? '' : 'opacity-40'}`}>
                <span className={`text-xs font-extrabold ${isToday ? 'text-brand-700' : ''}`}>{d.getDate()}</span>
                {n > 0 && <span className="mt-0.5 block text-[10px] font-bold text-ink-2">{n} tiết</span>}
                <span className="mt-0.5 hidden space-y-0.5 lg:block">{evs.slice(0, 2).map((ev) => { const k = kindOf(ev.kind); return <span key={ev.id} className="block truncate rounded px-1 text-[10px] font-bold" style={{ background: k.soft, color: k.text }}>{ev.title}</span>; })}{evs.length > 2 && <span className="block text-[10px] text-ink-3">+{evs.length - 2}</span>}</span>
                {evs.length > 0 && <span className="mt-0.5 flex gap-0.5 lg:hidden">{evs.slice(0, 4).map((ev) => <span key={ev.id} className="h-1.5 w-1.5 rounded-full" style={{ background: kindOf(ev.kind).bar }} />)}</span>}
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  /* ----- Theo lớp / theo môn: bảng tiết × thứ ----- */
  return <MatrixView mode={mode} entries={entries} filterValue={filterValue} onEditEntry={onEditEntry} />;
}

function MatrixView({ mode, entries, filterValue, onEditEntry }: { mode: 'class' | 'subject'; entries: TimetableEntry[]; filterValue: string; onEditEntry: (e: TimetableEntry) => void }) {
  const rows = useMemo(() => entries.filter((e) => (mode === 'class' ? e.className === filterValue : e.subject === filterValue)), [entries, mode, filterValue]);
  const slots = useMemo(() => {
    const m = new Map<string, { key: string; label: string; order: number }>();
    for (const e of rows) { const key = e.period !== null ? `p${e.period}` : `t${e.startTime}`; if (!m.has(key)) m.set(key, { key, label: e.period !== null ? `Tiết ${e.period}` : e.startTime, order: e.period !== null ? e.period : 100 + Number(e.startTime.replace(':', '')) }); }
    return [...m.values()].sort((a, b) => a.order - b.order);
  }, [rows]);
  const cols = [1, 2, 3, 4, 5, 6, 7].filter((w) => w <= 6 || rows.some((e) => e.weekday === 7));
  if (!filterValue) return <p className="rounded-2xl border border-dashed border-brand-200 bg-white/70 p-8 text-center text-ink-2">{mode === 'class' ? 'Chọn một lớp để xem lịch của lớp đó.' : 'Chọn một môn để xem lịch của môn đó.'}</p>;
  return (
    <section aria-label={mode === 'class' ? 'Lịch theo lớp' : 'Lịch theo môn'} className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-separate border-spacing-1 text-sm">
        <thead><tr><th className="w-20 text-left text-xs text-ink-3"><CalendarDays className="h-4 w-4" aria-hidden /></th>{cols.map((w) => <th key={w} className="rounded-lg bg-brand-50 py-1 text-xs font-extrabold">{WEEKDAYS[w - 1]}</th>)}</tr></thead>
        <tbody>
          {slots.map((s) => (
            <tr key={s.key}>
              <th className="pr-2 text-left align-top text-xs font-bold text-ink-2">{s.label}</th>
              {cols.map((w) => {
                const cell = sortEntries(rows.filter((e) => e.weekday === w && (e.period !== null ? `p${e.period}` : `t${e.startTime}`) === s.key));
                return (
                  <td key={w} className="align-top">
                    {cell.map((e) => <button key={e.id} type="button" onClick={() => onEditEntry(e)} className="mb-1 block w-full rounded-lg bg-white p-1.5 text-left text-xs ring-1 ring-brand-200 hover:bg-brand-50 max-lg:min-h-[44px]"><b>{mode === 'class' ? e.subject : e.className}</b>{e.room ? <span className="block text-ink-2">{e.room}</span> : null}</button>)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
