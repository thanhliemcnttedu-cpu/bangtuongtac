import type { TaskSubItem } from '../types/board';
import type { MyTask } from './myTasks';
import { countdown, formatDateTime } from './lessons';
import { itemOverdue } from './taskPlan';

/**
 * Thông báo nhắc việc trong phần mềm. Được TÍNH từ công việc hiện có (không lưu bản sao), nên công việc đã hoàn thành, hoãn hoặc hủy
 * tự hết thông báo, đổi hạn thì thông báo mới tự xuất hiện. Chỉ trạng thái "đã đọc" được ghi nhớ trên thiết bị này.
 * Lưu ý: đây là nhắc khi đang mở phần mềm; nhắc đẩy khi không mở trang cần máy chủ (Đợt nhắc việc đẩy).
 */
export type NotifKind = 'overdue' | 'today' | 'soon' | 'report' | 'items';

export interface NotifPrefs {
  /** Nhắc trước hạn bao nhiêu giờ (3, 24, 72, 168). */
  soonHours: number;
  /** Cảnh báo việc quá hạn. */
  overdue: boolean;
  /** Nhắc hạn báo cáo riêng. */
  report: boolean;
  /** Nhắc đầu việc thành phần quá hạn. */
  items: boolean;
  /** Hiện thông báo của trình duyệt (khi đang mở trang) nếu đã được cấp quyền. */
  browser: boolean;
}

export const DEFAULT_PREFS: NotifPrefs = { soonHours: 24, overdue: true, report: true, items: true, browser: false };
export const SOON_OPTIONS: [number, string][] = [[3, '3 giờ'], [24, '1 ngày'], [72, '3 ngày'], [168, '7 ngày']];

export interface Notif {
  id: string;
  kind: NotifKind;
  /** 3 = quá hạn, 2 = hôm nay, 1 = sắp đến hạn / nhắc. */
  severity: 1 | 2 | 3;
  title: string;
  detail: string;
  taskKey: string;
  at: string | null;
}

const PREFS_KEY = 'bt.notif.prefs';
const READ_KEY = 'bt.notif.read';
const SHOWN_KEY = 'bt.notif.shown';

function readJson<T>(key: string, fallback: T): T {
  try { const raw = window.localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}
function writeJson(key: string, v: unknown): void {
  try { window.localStorage.setItem(key, JSON.stringify(v)); } catch { /* bộ nhớ trình duyệt bị chặn: bỏ qua */ }
}

export function loadPrefs(): NotifPrefs {
  const p = readJson<Partial<NotifPrefs>>(PREFS_KEY, {});
  return { soonHours: SOON_OPTIONS.some(([h]) => h === p.soonHours) ? (p.soonHours as number) : DEFAULT_PREFS.soonHours, overdue: p.overdue !== false, report: p.report !== false, items: p.items !== false, browser: p.browser === true };
}
export const savePrefs = (p: NotifPrefs): void => writeJson(PREFS_KEY, p);
export const loadRead = (): Set<string> => new Set(readJson<string[]>(READ_KEY, []));
/** Chỉ giữ 400 mã gần nhất để bộ nhớ không phình ra. */
export const saveRead = (s: Set<string>): void => writeJson(READ_KEY, [...s].slice(-400));
export const loadShown = (): Set<string> => new Set(readJson<string[]>(SHOWN_KEY, []));
export const saveShown = (s: Set<string>): void => writeJson(SHOWN_KEY, [...s].slice(-400));

const ms = (iso: string | null | undefined): number | null => { const t = iso ? Date.parse(iso) : NaN; return Number.isNaN(t) ? null : t; };
const sameDay = (a: number, b: number): boolean => { const x = new Date(a); const y = new Date(b); return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate(); };

/** Tính danh sách thông báo hiện có, việc nghiêm trọng nhất lên đầu. */
export function buildNotifications(tasks: MyTask[], items: TaskSubItem[], now: number, prefs: NotifPrefs): Notif[] {
  const out: Notif[] = [];
  const horizon = now + prefs.soonHours * 3_600_000;
  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled' && t.status !== 'postponed');
  for (const t of open) {
    const due = ms(t.dueAt);
    if (due !== null) {
      if (due < now) {
        if (prefs.overdue) out.push({ id: `${t.taskId}:overdue:${t.dueAt}`, kind: 'overdue', severity: 3, title: `Quá hạn: ${t.label}`, detail: `Hạn ${formatDateTime(t.dueAt as string)} · ${countdown(t.dueAt as string, now)}`, taskKey: t.key, at: t.dueAt });
      } else if (sameDay(due, now)) {
        out.push({ id: `${t.taskId}:today:${t.dueAt}`, kind: 'today', severity: 2, title: `Đến hạn hôm nay: ${t.label}`, detail: `Hạn ${formatDateTime(t.dueAt as string)} · ${countdown(t.dueAt as string, now)}`, taskKey: t.key, at: t.dueAt });
      } else if (due <= horizon) {
        out.push({ id: `${t.taskId}:soon:${t.dueAt}`, kind: 'soon', severity: 1, title: `Sắp đến hạn: ${t.label}`, detail: `Hạn ${formatDateTime(t.dueAt as string)} · ${countdown(t.dueAt as string, now)}`, taskKey: t.key, at: t.dueAt });
      }
    }
    const rep = ms(t.reportDueAt);
    if (prefs.report && rep !== null && rep !== due && rep <= horizon) {
      out.push({ id: `${t.taskId}:report:${t.reportDueAt}`, kind: 'report', severity: rep < now ? 3 : 1, title: `${rep < now ? 'Quá hạn báo cáo' : 'Sắp đến hạn báo cáo'}: ${t.label}`, detail: `Hạn báo cáo ${formatDateTime(t.reportDueAt as string)} · ${countdown(t.reportDueAt as string, now)}`, taskKey: t.key, at: t.reportDueAt ?? null });
    }
  }
  if (prefs.items) {
    const byTask = new Map<string, TaskSubItem[]>();
    for (const it of items) if (itemOverdue(it, now)) byTask.set(it.taskId, [...(byTask.get(it.taskId) ?? []), it]);
    for (const t of open) {
      const late = byTask.get(t.taskId);
      if (!late || late.length === 0) continue;
      const newest = late.reduce((m, i) => (ms(i.plannedAt) ?? 0) > m ? (ms(i.plannedAt) ?? 0) : m, 0);
      out.push({ id: `${t.taskId}:items:${late.length}:${newest}`, kind: 'items', severity: 2, title: `${late.length} đầu việc quá hạn: ${t.label}`, detail: late.slice(0, 3).map((i) => i.subject || i.title).join(', ') + (late.length > 3 ? '…' : ''), taskKey: t.key, at: null });
    }
  }
  return out.sort((a, b) => b.severity - a.severity || (ms(a.at) ?? 0) - (ms(b.at) ?? 0));
}
