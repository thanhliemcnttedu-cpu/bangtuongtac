import { supabase } from './supabase';
import type { Attachment } from '../types/board';
import type { CalEvent, EventKind, Timetable, TimetableEntry, TimetableNote } from '../types/schedule';

/**
 * Truy cập thời khóa biểu và lịch công tác. Dữ liệu thật nằm ở Supabase (bảng timetables, timetable_entries, timetable_notes, calendar_events);
 * khi chưa cấu hình Supabase (bản mẫu) thì giữ trong bộ nhớ của trang để thử giao diện.
 */
export type EntryData = Omit<TimetableEntry, 'id' | 'timetableId' | 'boardId'>;
export type EventData = Omit<CalEvent, 'id' | 'boardId'>;

const MISSING = /timetables|timetable_entries|timetable_notes|calendar_events|schema cache|does not exist/i;
function fail(action: string, message: string): never {
  throw new Error(MISSING.test(message)
    ? `${action}: máy chủ chưa có bảng lịch. Hãy chạy tệp docs/cap-nhat-lich.sql trong Supabase (SQL Editor) rồi thử lại.`
    : `${action}: ${message}`);
}
const db = () => { if (!supabase) throw new Error('Chưa cấu hình Supabase.'); return supabase; };
const uid = (p: string): string => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/* ---------- Bản mẫu: bộ nhớ trang ---------- */
const mem = { tts: [] as Timetable[], entries: [] as TimetableEntry[], notes: [] as TimetableNote[], events: [] as CalEvent[] };

/* ---------- Chuyển dòng CSDL ---------- */
interface TtDb { id: string; board_id: string; name: string; school_year: string | null; term: string | null; active: boolean; created_at: string }
interface EnDb { id: string; timetable_id: string; board_id: string; weekday: number; period: number | null; start_time: string | null; end_time: string | null; subject: string | null; class_name: string | null; room: string | null; location: string | null; topic: string | null; note: string | null; attachments: Attachment[] | null }
interface EvDb { id: string; board_id: string; title: string; kind: string; starts_at: string; ends_at: string | null; location: string | null; description: string | null; attachments: Attachment[] | null; task_id: string | null }
const toTt = (r: TtDb): Timetable => ({ id: r.id, boardId: r.board_id, name: r.name, schoolYear: r.school_year ?? '', term: r.term ?? '', active: r.active, createdAt: r.created_at });
const toEn = (r: EnDb): TimetableEntry => ({ id: r.id, timetableId: r.timetable_id, boardId: r.board_id, weekday: r.weekday, period: r.period, startTime: r.start_time ?? '', endTime: r.end_time ?? '', subject: r.subject ?? '', className: r.class_name ?? '', room: r.room ?? '', location: r.location ?? '', topic: r.topic ?? '', note: r.note ?? '', attachments: r.attachments ?? [] });
const toEv = (r: EvDb): CalEvent => ({ id: r.id, boardId: r.board_id, title: r.title, kind: r.kind as EventKind, startsAt: r.starts_at, endsAt: r.ends_at, location: r.location ?? '', description: r.description ?? '', attachments: r.attachments ?? [], taskId: r.task_id });
const enRow = (e: EntryData) => ({ weekday: e.weekday, period: e.period, start_time: e.startTime, end_time: e.endTime, subject: e.subject, class_name: e.className, room: e.room, location: e.location, topic: e.topic, note: e.note, attachments: e.attachments });
const evRow = (e: EventData) => ({ title: e.title, kind: e.kind, starts_at: e.startsAt, ends_at: e.endsAt, location: e.location, description: e.description, attachments: e.attachments, task_id: e.taskId });

/* ---------- Thời khóa biểu ---------- */
export async function listTimetables(boardId: string): Promise<Timetable[]> {
  if (!supabase) return mem.tts.filter((t) => t.boardId === boardId);
  const { data, error } = await db().from('timetables').select('*').eq('board_id', boardId).order('created_at', { ascending: false });
  if (error) fail('Không tải được thời khóa biểu', error.message);
  return ((data ?? []) as TtDb[]).map(toTt);
}

/** Tạo thời khóa biểu mới từ các dòng đã kiểm tra; thời khóa biểu mới thành "đang dùng", các bản cũ được giữ lại. */
export async function createTimetable(boardId: string, meta: { name: string; schoolYear: string; term: string }, entries: EntryData[]): Promise<Timetable> {
  if (!supabase) {
    mem.tts = mem.tts.map((t) => (t.boardId === boardId ? { ...t, active: false } : t));
    const tt: Timetable = { id: uid('tt'), boardId, ...meta, active: true, createdAt: new Date().toISOString() };
    mem.tts.unshift(tt);
    mem.entries.push(...entries.map((e) => ({ ...e, id: uid('en'), timetableId: tt.id, boardId })));
    return tt;
  }
  const { data, error } = await db().from('timetables').insert({ board_id: boardId, name: meta.name, school_year: meta.schoolYear, term: meta.term, active: false }).select('*').single();
  if (error) fail('Không tạo được thời khóa biểu', error.message);
  const tt = toTt(data as TtDb);
  if (entries.length > 0) {
    const ins = await db().from('timetable_entries').insert(entries.map((e) => ({ ...enRow(e), timetable_id: tt.id, board_id: boardId })));
    if (ins.error) { await db().from('timetables').delete().eq('id', tt.id); fail('Không lưu được các tiết học', ins.error.message); }
  }
  await setActiveTimetable(boardId, tt.id);
  return { ...tt, active: true };
}

export async function setActiveTimetable(boardId: string, id: string): Promise<void> {
  if (!supabase) { mem.tts = mem.tts.map((t) => (t.boardId === boardId ? { ...t, active: t.id === id } : t)); return; }
  const off = await db().from('timetables').update({ active: false }).eq('board_id', boardId).neq('id', id);
  if (off.error) fail('Không đổi được thời khóa biểu đang dùng', off.error.message);
  const on = await db().from('timetables').update({ active: true }).eq('id', id);
  if (on.error) fail('Không đổi được thời khóa biểu đang dùng', on.error.message);
}

export async function deleteTimetable(id: string): Promise<void> {
  if (!supabase) { const ids = new Set(mem.entries.filter((e) => e.timetableId === id).map((e) => e.id)); mem.tts = mem.tts.filter((t) => t.id !== id); mem.entries = mem.entries.filter((e) => e.timetableId !== id); mem.notes = mem.notes.filter((n) => !ids.has(n.entryId)); return; }
  const { error } = await db().from('timetables').delete().eq('id', id);
  if (error) fail('Không xóa được thời khóa biểu', error.message);
}

export async function listEntries(timetableId: string): Promise<TimetableEntry[]> {
  if (!supabase) return mem.entries.filter((e) => e.timetableId === timetableId);
  const { data, error } = await db().from('timetable_entries').select('*').eq('timetable_id', timetableId);
  if (error) fail('Không tải được các tiết học', error.message);
  return ((data ?? []) as EnDb[]).map(toEn);
}

export async function saveEntry(boardId: string, timetableId: string, id: string | null, e: EntryData): Promise<TimetableEntry> {
  if (!supabase) {
    const made: TimetableEntry = { ...e, id: id ?? uid('en'), timetableId, boardId };
    mem.entries = id ? mem.entries.map((x) => (x.id === id ? made : x)) : [...mem.entries, made];
    return made;
  }
  const q = id ? db().from('timetable_entries').update(enRow(e)).eq('id', id) : db().from('timetable_entries').insert({ ...enRow(e), timetable_id: timetableId, board_id: boardId });
  const { data, error } = await q.select('*').single();
  if (error) fail('Không lưu được tiết học', error.message);
  return toEn(data as EnDb);
}

export async function deleteEntry(id: string): Promise<void> {
  if (!supabase) { mem.entries = mem.entries.filter((e) => e.id !== id); mem.notes = mem.notes.filter((n) => n.entryId !== id); return; }
  const { error } = await db().from('timetable_entries').delete().eq('id', id);
  if (error) fail('Không xóa được tiết học', error.message);
}

export async function listNotes(entryIds: string[]): Promise<TimetableNote[]> {
  if (!supabase) return mem.notes.filter((n) => entryIds.includes(n.entryId));
  if (entryIds.length === 0) return [];
  const { data, error } = await db().from('timetable_notes').select('id,entry_id,day,note').in('entry_id', entryIds);
  if (error) fail('Không tải được ghi chú tiết dạy', error.message);
  return ((data ?? []) as { id: string; entry_id: string; day: string; note: string }[]).map((r) => ({ id: r.id, entryId: r.entry_id, day: r.day, note: r.note }));
}

export async function saveNote(boardId: string, entryId: string, day: string, note: string): Promise<void> {
  if (!supabase) {
    mem.notes = mem.notes.filter((n) => !(n.entryId === entryId && n.day === day));
    if (note.trim()) mem.notes.push({ id: uid('nt'), entryId, day, note: note.trim() });
    return;
  }
  if (!note.trim()) {
    const del = await db().from('timetable_notes').delete().eq('entry_id', entryId).eq('day', day);
    if (del.error) fail('Không lưu được ghi chú', del.error.message);
    return;
  }
  const { error } = await db().from('timetable_notes').upsert({ entry_id: entryId, board_id: boardId, day, note: note.trim(), updated_at: new Date().toISOString() }, { onConflict: 'entry_id,day' });
  if (error) fail('Không lưu được ghi chú', error.message);
}

/* ---------- Lịch công tác ---------- */
export async function listEvents(boardId: string): Promise<CalEvent[]> {
  if (!supabase) return mem.events.filter((e) => e.boardId === boardId);
  const { data, error } = await db().from('calendar_events').select('*').eq('board_id', boardId).order('starts_at');
  if (error) fail('Không tải được lịch công tác', error.message);
  return ((data ?? []) as EvDb[]).map(toEv);
}

export async function saveEvent(boardId: string, id: string | null, e: EventData): Promise<CalEvent> {
  if (!supabase) {
    const made: CalEvent = { ...e, id: id ?? uid('ev'), boardId };
    mem.events = id ? mem.events.map((x) => (x.id === id ? made : x)) : [...mem.events, made];
    return made;
  }
  const q = id ? db().from('calendar_events').update(evRow(e)).eq('id', id) : db().from('calendar_events').insert({ ...evRow(e), board_id: boardId });
  const { data, error } = await q.select('*').single();
  if (error) fail('Không lưu được sự kiện', error.message);
  return toEv(data as EvDb);
}

export async function deleteEvent(id: string): Promise<void> {
  if (!supabase) { mem.events = mem.events.filter((e) => e.id !== id); return; }
  const { error } = await db().from('calendar_events').delete().eq('id', id);
  if (error) fail('Không xóa được sự kiện', error.message);
}
