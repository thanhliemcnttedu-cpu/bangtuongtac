import { repeatLabel } from './recurrence';
import type { TaskSubItem } from '../types/board';
import { startOfWeek } from './myTasks';
import type { MyTask } from './myTasks';
import { ITEM_STATUS, categoryOf, fmtDay, fmtTime, itemStats } from './taskPlan';

export type Period = 'week' | 'month' | '30d' | '90d' | 'all';
export const PERIODS: [Period, string][] = [['week', 'Tuần này'], ['month', 'Tháng này'], ['30d', '30 ngày qua'], ['90d', '90 ngày qua'], ['all', 'Tất cả']];

const DAY = 86_400_000;
const ms = (iso: string | null | undefined): number | null => { const t = iso ? Date.parse(iso) : NaN; return Number.isNaN(t) ? null : t; };

/** Khoảng thời gian tính theo HẠN của việc; null = không giới hạn. */
export function periodRange(p: Period, now: number): { from: number | null; to: number | null } {
  const d = new Date(now);
  if (p === 'week') { const s = startOfWeek(d); return { from: s.getTime(), to: s.getTime() + 7 * DAY - 1 }; }
  if (p === 'month') return { from: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), to: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() - 1 };
  const endToday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - 1;
  if (p === '30d') return { from: now - 30 * DAY, to: endToday };
  if (p === '90d') return { from: now - 90 * DAY, to: endToday };
  return { from: null, to: null };
}

export interface Row { label: string; total: number; done: number; late: number; overdue: number }
export interface Stats {
  /** Việc có hạn trong kỳ. */
  total: number;
  noDue: number;
  doneOnTime: number;
  doneLate: number;
  /** Đã xong nhưng chưa có ngày hoàn thành thực tế (việc xong từ trước khi có ghi nhận ngày) nên không biết đúng hạn hay trễ. */
  doneUnknown: number;
  doing: number; todo: number; waiting: number; postponed: number; cancelled: number; overdue: number;
  /** Hoàn thành / (tổng − đã hủy). */
  completionPct: number;
  /** Đúng hạn / (đúng hạn + trễ), chỉ tính các việc biết ngày hoàn thành. */
  onTimePct: number | null;
  byCategory: Row[];
  /** Việc lặp: MỖI LƯỢT tính riêng, gom theo chuỗi (báo cáo bán trú 20 ngày = 20 lượt). */
  series: Row[];
  items: { all: number; done: number; overdue: number };
}

const isDone = (t: MyTask): boolean => t.status === 'done';
const wasLate = (t: MyTask): boolean => { const c = ms(t.completedAt); const d = ms(t.dueAt); return isDone(t) && c !== null && d !== null && c > d; };
const wasOnTime = (t: MyTask): boolean => { const c = ms(t.completedAt); const d = ms(t.dueAt); return isDone(t) && c !== null && d !== null && c <= d; };

export function computeStats(tasks: MyTask[], items: TaskSubItem[], now: number, range: { from: number | null; to: number | null }): Stats {
  const dated = tasks.filter((t) => ms(t.dueAt) !== null);
  const inRange = dated.filter((t) => { const d = ms(t.dueAt) as number; return (range.from === null || d >= range.from) && (range.to === null || d <= range.to); });
  const c = (s: MyTask['status']): number => inRange.filter((t) => t.status === s).length;
  const doneOnTime = inRange.filter(wasOnTime).length;
  const doneLate = inRange.filter(wasLate).length;
  const done = c('done');
  const cancelled = c('cancelled');
  const valid = inRange.length - cancelled;
  const group = (key: (t: MyTask) => string | null, label: (rows: MyTask[]) => string): Row[] => {
    const m = new Map<string, MyTask[]>();
    for (const t of inRange) { const k = key(t); if (k) m.set(k, [...(m.get(k) ?? []), t]); }
    return [...m.values()].map((rows) => ({ label: label(rows), total: rows.length, done: rows.filter(isDone).length, late: rows.filter(wasLate).length, overdue: rows.filter((t) => t.status === 'overdue').length }))
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'vi'));
  };
  const ids = new Set(inRange.map((t) => t.taskId));
  const its = items.filter((i) => ids.has(i.taskId));
  const st = itemStats(its, now);
  return {
    total: inRange.length, noDue: tasks.length - dated.length, doneOnTime, doneLate, doneUnknown: done - doneOnTime - doneLate,
    doing: c('doing'), todo: c('todo'), waiting: c('waiting'), postponed: c('postponed'), cancelled, overdue: c('overdue'),
    completionPct: valid > 0 ? Math.round((done / valid) * 100) : 0,
    onTimePct: doneOnTime + doneLate > 0 ? Math.round((doneOnTime / (doneOnTime + doneLate)) * 100) : null,
    byCategory: group((t) => t.category ?? '_', (rows) => categoryOf(rows[0].category)?.label ?? 'Chưa phân nhóm'),
    series: group((t) => (t.repeat && t.repeat !== 'none') || t.seriesId ? (t.seriesId ?? t.taskId) : null, (rows) => rows[rows.length - 1].label),
    items: { all: st.all, done: st.done, overdue: st.overdue },
  };
}

const q = (v: string): string => `"${v.replace(/"/g, '""')}"`;
const STATUS_VI: Record<MyTask['status'], string> = { todo: 'Chưa thực hiện', doing: 'Đang thực hiện', waiting: 'Chờ bổ sung', postponed: 'Hoãn', cancelled: 'Đã hủy', done: 'Hoàn thành', overdue: 'Quá hạn' };

/** Bảng chi tiết từng việc dạng CSV (có dấu thứ tự byte để Excel đọc đúng tiếng Việt). */
export function buildCsv(tasks: MyTask[], items: TaskSubItem[], now: number): string {
  const head = ['Công việc', 'Nhóm', 'Trạng thái', 'Ngày bắt đầu', 'Hạn hoàn thành', 'Hạn báo cáo', 'Hoàn thành thực tế', 'Đúng hạn?', 'Lặp lại', 'Đầu việc xong/tổng', 'Đầu việc quá hạn'];
  const rows = tasks.map((t) => {
    const its = items.filter((i) => i.taskId === t.taskId);
    const s = itemStats(its, now);
    const fmt = (iso: string | null | undefined): string => (iso ? `${fmtDay(iso)} ${fmtTime(iso)}` : '');
    return [t.label, categoryOf(t.category)?.label ?? '', STATUS_VI[t.status], fmt(t.startAt), fmt(t.dueAt), fmt(t.reportDueAt), fmt(t.completedAt),
      isDone(t) ? (wasOnTime(t) ? 'Đúng hạn' : wasLate(t) ? 'Trễ hạn' : 'Chưa rõ') : '', repeatLabel(t.repeat), s.all > 0 ? `${s.done}/${s.valid}` : '', s.all > 0 ? String(s.overdue) : ''];
  });
  void ITEM_STATUS;
  return '﻿' + [head, ...rows].map((r) => r.map(q).join(',')).join('\r\n');
}
