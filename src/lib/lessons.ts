// Logic thuần cho Bài học / Bài tập / Yêu cầu: trạng thái giao–hạn, đối tượng được giao, định dạng thời gian.
// Quyết định cuối cùng nằm ở trigger `cards_guard` trong docs/schema.sql; các hàm này chỉ để giao diện báo trước cho học sinh.

import type { BoardData, Lesson, RosterMember, SubmissionCard, TaskItem } from '../types/board';
import { classPart, normalize, rosterMatcher } from './boardLogic';
import { isAssignee } from './teamRoster';

/** scheduled: chưa đến giờ giao · open: đang nhận bài · soon: sắp hết hạn (≤ 24 giờ) · overdue: quá hạn. */
export type TaskPhase = 'scheduled' | 'open' | 'soon' | 'overdue';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

export function taskPhase(t: TaskItem, now: number): TaskPhase {
  const from = ms(t.assignedAt);
  if (from !== null && from > now) return 'scheduled';
  const due = ms(t.dueAt);
  if (due !== null && due < now) return 'overdue';
  if (due !== null && due - now <= DAY) return 'soon';
  return 'open';
}

/** Đèn giao thông theo 3 ngưỡng của cả khoảng thời gian từ lúc giao đến hạn nộp: xanh (đầu) → vàng (giữa) → đỏ (cuối). */
export type Urgency = 'green' | 'amber' | 'red';

/**
 * Tỉ lệ thời gian đã trôi (0–1) từ lúc giao đến hạn nộp. Chưa đặt giờ giao thì lấy 72 giờ trước hạn làm mốc đầu.
 * Trả null khi bài không có hạn, chưa đến giờ giao hoặc đã quá hạn.
 */
export function timeElapsed(t: TaskItem, now: number): number | null {
  const due = ms(t.dueAt);
  if (due === null || due <= now) return null;
  const from = ms(t.assignedAt) ?? Math.min(now, due - 3 * DAY);
  if (from > now) return null;
  const span = due - from;
  return span <= 0 ? 1 : Math.min(1, Math.max(0, (now - from) / span));
}

export function urgencyOf(t: TaskItem, now: number): Urgency | null {
  const f = timeElapsed(t, now);
  if (f === null) return null;
  return f < 1 / 3 ? 'green' : f < 2 / 3 ? 'amber' : 'red';
}

export const URGENCY_TEXT: Record<Urgency, string> = { green: 'Còn nhiều thời gian', amber: 'Còn ít thời gian', red: 'Sắp hết giờ, cần nộp ngay' };

export interface TaskProgress {
  /** Thành viên trong danh sách được giao bài tập này. */
  total: number;
  done: RosterMember[];
  missing: RosterMember[];
  /** Số bài nộp từ người không có trong danh sách. */
  outside: number;
}

/** Ai trong danh sách đã nộp bài tập này, ai chưa (chỉ tính thành viên thuộc đối tượng được giao). */
export function taskProgress(board: BoardData, task: TaskItem): TaskProgress {
  const match = rosterMatcher(board.roster);
  const cards = board.cards.filter((c) => c.taskId === task.id);
  const doneIds = new Set<string>();
  let outside = 0;
  const outsideNames = new Set<string>();
  for (const c of cards) {
    const m = match(c);
    if (m) doneIds.add(m.id); else outsideNames.add(normalize(c.authorName));
  }
  outside = outsideNames.size;
  const targeted = board.roster.filter((m) => targetsMember(task, m));
  return { total: targeted.length, done: targeted.filter((m) => doneIds.has(m.id)), missing: targeted.filter((m) => !doneIds.has(m.id)), outside };
}

/** Giờ ghi trên bài: lần nộp lại mới nhất nếu có, kèm số lần nộp lại. */
export function stampOf(card: SubmissionCard): { at: string; revised: boolean; revisions: number } {
  return card.resubmittedAt ? { at: card.resubmittedAt, revised: true, revisions: card.revisions ?? 1 } : { at: card.submittedAt, revised: false, revisions: 0 };
}

/** Học sinh đã thấy bài tập này chưa (đã đến giờ giao). Giáo viên luôn thấy hết. */
export const isAssigned = (t: TaskItem, now: number): boolean => taskPhase(t, now) !== 'scheduled';

export type SubmitCheck = { ok: true; late: boolean } | { ok: false; reason: string };

/** Có nộp được bài tập này với tổ / nhóm / đơn vị đã nhập không (và nộp muộn hay không). */
export function checkSubmit(t: TaskItem, unit: string, now: number): SubmitCheck {
  const phase = taskPhase(t, now);
  if (phase === 'scheduled') return { ok: false, reason: `Bài tập này sẽ được giao lúc ${formatDateTime(t.assignedAt)}.` };
  if (phase === 'overdue' && !t.allowLate) return { ok: false, reason: `Bài tập đã hết hạn nộp từ ${formatDateTime(t.dueAt)}.` };
  const targets = t.targetUnits ?? [];
  if (targets.length > 0 && !targets.some((u) => unitMatches(u, unit))) {
    return { ok: false, reason: `Bài tập này chỉ giao cho: ${targets.join(', ')}.` };
  }
  return { ok: true, late: phase === 'overdue' };
}

/** Bài tập có giao cho tổ / nhóm này không (trống = cả lớp). */
export function targetsUnit(t: TaskItem, unit: string): boolean {
  const targets = t.targetUnits ?? [];
  return targets.length === 0 || targets.some((u) => unitMatches(u, unit));
}

/** Thành viên có thuộc đối tượng của việc không: có danh sách Gmail riêng thì theo Gmail, không thì theo tổ / đơn vị. */
export function targetsMember(t: TaskItem, m: { name?: string; unit: string; email?: string }): boolean {
  const keys = t.assigneeEmails ?? [];
  if (keys.length > 0) return isAssignee(keys, m);
  return targetsUnit(t, m.unit);
}

/** Đối tượng giao khớp đơn vị: đúng cả cụm, hoặc đúng phần lớp (giao cho "Lớp 4A" thì mọi tổ của 4A đều khớp). */
export function unitMatches(target: string, unit: string): boolean {
  const t = target.trim().toLowerCase();
  const u = unit.trim().toLowerCase();
  return t === u || t === classPart(unit).toLowerCase();
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** "dd/MM HH:mm" theo giờ máy. */
export function formatDateTime(iso: string | null | undefined): string {
  const t = ms(iso);
  if (t === null) return '';
  const d = new Date(t);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "còn 2 ngày", "còn 5 giờ", "quá hạn 3 giờ"… */
export function countdown(iso: string | null | undefined, now: number): string {
  const t = ms(iso);
  if (t === null) return '';
  const diff = t - now;
  const abs = Math.abs(diff);
  const text = abs >= DAY ? `${Math.round(abs / DAY)} ngày` : abs >= HOUR ? `${Math.round(abs / HOUR)} giờ` : `${Math.max(1, Math.round(abs / 60_000))} phút`;
  return diff >= 0 ? `còn ${text}` : `quá hạn ${text}`;
}

/** ISO → giá trị cho <input type="datetime-local"> (giờ máy). */
export function toLocalInput(iso: string | null | undefined): string {
  const t = ms(iso);
  if (t === null) return '';
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Giá trị <input type="datetime-local"> → ISO; rỗng → null. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** Các tổ / nhóm / đơn vị có trong bảng (từ sĩ số và bài đã nộp), để giáo viên chọn khi giao bài. */
export function unitsOf(board: BoardData): string[] {
  const set = new Set<string>();
  // Bảng cả khối: giao bài theo LỚP (mọi tổ của lớp đó đều nhận); bảng khác giao theo từng tổ / nhóm.
  const key = (u: string): string => (board.settings.scope === 'grade' ? classPart(u) : u.trim());
  for (const m of board.roster) if (m.unit.trim()) set.add(key(m.unit));
  for (const c of board.cards) if (c.unit.trim()) set.add(key(c.unit));
  for (const t of board.tasks) for (const u of t.targetUnits ?? []) if (u.trim()) set.add(u.trim());
  return [...set].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
}

/** Nhãn bài tập kèm tên bài học (dùng trong ô chọn và bảng). */
export function taskTitle(board: BoardData, t: TaskItem): string {
  const lesson = board.lessons.find((l) => l.id === t.lessonId);
  return lesson ? `${lesson.title} › ${t.label}` : t.label;
}

/** Nhóm bài tập theo bài học, giữ thứ tự bài học; bài tập không thuộc bài học nào ở cuối. */
export function groupTasks(lessons: Lesson[], tasks: TaskItem[]): { lesson: Lesson | null; tasks: TaskItem[] }[] {
  const groups = lessons.map((lesson) => ({ lesson: lesson as Lesson | null, tasks: tasks.filter((t) => t.lessonId === lesson.id) }));
  const known = new Set(lessons.map((l) => l.id));
  const loose = tasks.filter((t) => !t.lessonId || !known.has(t.lessonId));
  return loose.length > 0 ? [...groups, { lesson: null, tasks: loose }] : groups;
}

export const KIND_LABEL = { assignment: 'Bài tập', requirement: 'Yêu cầu' } as const;

/** Từ ngữ theo kiểu lớp: lớp học dùng "Bài học / Tổ, nhóm"; lớp tập huấn dùng "Buổi tập huấn / Đơn vị". */
export function wordsFor(mode: BoardData['mode'], scope?: 'class' | 'grade' | 'lesson' | 'team') {
  if (mode === 'training' && scope === 'team') {
    return { lesson: 'Nhóm công việc', lessonLower: 'nhóm công việc', unit: 'tổ / nhóm', panel: 'Công việc & tài liệu của tổ', learner: 'thành viên', everyone: 'Cả tổ', common: 'Tài liệu chung của tổ', group: 'tổ' };
  }
  return mode === 'classroom'
    ? { lesson: 'Bài học', lessonLower: 'bài học', unit: scope === 'grade' ? 'lớp / tổ' : 'tổ / nhóm', panel: scope === 'grade' ? 'Bài học & tài liệu của khối' : scope === 'lesson' ? 'Bài học & tài liệu' : 'Bài học & tài liệu của lớp', learner: 'học sinh', everyone: 'Cả lớp', common: 'Tài liệu chung của lớp', group: 'lớp' }
    : { lesson: 'Buổi tập huấn', lessonLower: 'buổi tập huấn', unit: 'đơn vị', panel: 'Buổi tập huấn & tài liệu của giảng viên', learner: 'học viên', everyone: 'Tất cả học viên', common: 'Tài liệu chung của lớp tập huấn', group: 'lớp tập huấn' };
}
