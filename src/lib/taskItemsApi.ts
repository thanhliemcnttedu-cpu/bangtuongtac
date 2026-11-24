import { supabase } from './supabase';
import type { Attachment, ItemStatus, TaskLog, TaskSubItem } from '../types/board';

/** Truy cập bảng task_items (đầu việc thành phần) và task_logs (nhật ký chỉ thêm) của Supabase. */

function db() {
  if (!supabase) throw new Error('Chưa cấu hình Supabase (.env).');
  return supabase;
}

const MISSING = /task_items|task_logs|relation .* does not exist|schema cache/i;
function fail(action: string, message: string): never {
  throw new Error(MISSING.test(message)
    ? `${action}: máy chủ chưa có bảng đầu việc. Hãy chạy tệp docs/cap-nhat-cong-viec-nang-cao.sql trong Supabase (SQL Editor) rồi thử lại.`
    : `${action}: ${message}`);
}

export interface ItemDb {
  id: string; task_id: string; board_id: string; title: string; subject: string | null; planned_at: string | null; status: string; result: string | null;
  note: string | null; started_at: string | null; done_at: string | null; sort: number | null; attachments: Attachment[] | null; deleted_at: string | null; created_at: string;
}
const STATUSES: ItemStatus[] = ['todo', 'scheduled', 'doing', 'waiting', 'done', 'postponed', 'cancelled'];

export const toItem = (r: ItemDb): TaskSubItem => ({
  id: r.id, taskId: r.task_id, boardId: r.board_id, title: r.title, subject: r.subject ?? '', plannedAt: r.planned_at,
  status: STATUSES.find((s) => s === r.status) ?? 'todo', result: r.result ?? '', note: r.note ?? '', startedAt: r.started_at, doneAt: r.done_at,
  sort: r.sort ?? 0, attachments: r.attachments ?? [], deletedAt: r.deleted_at, createdAt: r.created_at,
});

const toRow = (i: Omit<TaskSubItem, 'id' | 'createdAt'>) => ({
  task_id: i.taskId, board_id: i.boardId, title: i.title, subject: i.subject, planned_at: i.plannedAt, status: i.status, result: i.result, note: i.note,
  started_at: i.startedAt, done_at: i.doneAt, sort: i.sort, attachments: i.attachments, deleted_at: i.deletedAt,
});

/** Đọc mọi đầu việc (kể cả đã xóa mềm) của các công việc đã cho. */
export async function listItems(taskIds: string[]): Promise<TaskSubItem[]> {
  if (taskIds.length === 0) return [];
  const { data, error } = await db().from('task_items').select('*').in('task_id', taskIds).order('sort').order('created_at');
  if (error) fail('Không tải được đầu việc', error.message);
  return ((data ?? []) as ItemDb[]).map(toItem);
}

export async function insertItems(rows: Omit<TaskSubItem, 'id' | 'createdAt'>[]): Promise<TaskSubItem[]> {
  const { data, error } = await db().from('task_items').insert(rows.map(toRow)).select('*');
  if (error) fail('Không thêm được đầu việc', error.message);
  return ((data ?? []) as ItemDb[]).map(toItem).sort((a, b) => a.sort - b.sort);
}

export async function updateItem(id: string, row: Omit<TaskSubItem, 'id' | 'createdAt'>): Promise<TaskSubItem> {
  const { data, error } = await db().from('task_items').update(toRow(row)).eq('id', id).select('*').single();
  if (error) fail('Không lưu được đầu việc', error.message);
  return toItem(data as ItemDb);
}

export async function setItemOrder(order: { id: string; sort: number }[]): Promise<void> {
  for (const o of order) {
    const { error } = await db().from('task_items').update({ sort: o.sort }).eq('id', o.id);
    if (error) fail('Không đổi được thứ tự', error.message);
  }
}

interface LogDb { id: string; task_id: string; item_id: string | null; actor: string; action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; note: string | null; created_at: string }
const toLog = (r: LogDb): TaskLog => ({ id: r.id, taskId: r.task_id, itemId: r.item_id, actor: r.actor, action: r.action, before: r.before, after: r.after, note: r.note ?? '', createdAt: r.created_at });

export async function listLogs(taskId: string): Promise<TaskLog[]> {
  const { data, error } = await db().from('task_logs').select('*').eq('task_id', taskId).order('created_at', { ascending: false }).limit(500);
  if (error) fail('Không tải được nhật ký', error.message);
  return ((data ?? []) as LogDb[]).map(toLog);
}

export async function addLog(l: { taskId: string; boardId: string; itemId: string | null; actor: string; action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; note: string }): Promise<void> {
  const { error } = await db().from('task_logs').insert({ task_id: l.taskId, board_id: l.boardId, item_id: l.itemId, actor: l.actor, action: l.action, before: l.before, after: l.after, note: l.note });
  if (error) fail('Không ghi được nhật ký', error.message);
}
