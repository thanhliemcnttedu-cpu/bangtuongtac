// Logic thuần cho Bài học / Bài tập / Yêu cầu: trạng thái giao–hạn, đối tượng được giao, định dạng thời gian.
// Quyết định cuối cùng nằm ở trigger `cards_guard` trong docs/schema.sql; các hàm này chỉ để giao diện báo trước cho học sinh.

import type { BoardData, Lesson, TaskItem } from '../types/board';

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

/** Học sinh đã thấy bài tập này chưa (đã đến giờ giao). Giáo viên luôn thấy hết. */
export const isAssigned = (t: TaskItem, now: number): boolean => taskPhase(t, now) !== 'scheduled';

export type SubmitCheck = { ok: true; late: boolean } | { ok: false; reason: string };

/** Có nộp được bài tập này với tổ / nhóm / đơn vị đã nhập không (và nộp muộn hay không). */
export function checkSubmit(t: TaskItem, unit: string, now: number): SubmitCheck {
  const phase = taskPhase(t, now);
  if (phase === 'scheduled') return { ok: false, reason: `Bài tập này sẽ được giao lúc ${formatDateTime(t.assignedAt)}.` };
  if (phase === 'overdue' && !t.allowLate) return { ok: false, reason: `Bài tập đã hết hạn nộp từ ${formatDateTime(t.dueAt)}.` };
  const targets = t.targetUnits ?? [];
  if (targets.length > 0 && !targets.some((u) => u.trim().toLowerCase() === unit.trim().toLowerCase())) {
    return { ok: false, reason: `Bài tập này chỉ giao cho: ${targets.join(', ')}.` };
  }
  return { ok: true, late: phase === 'overdue' };
}

/** Bài tập có giao cho tổ / nhóm này không (trống = cả lớp). */
export function targetsUnit(t: TaskItem, unit: string): boolean {
  const targets = t.targetUnits ?? [];
  return targets.length === 0 || targets.some((u) => u.trim().toLowerCase() === unit.trim().toLowerCase());
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
  for (const m of board.roster) if (m.unit.trim()) set.add(m.unit.trim());
  for (const c of board.cards) if (c.unit.trim()) set.add(c.unit.trim());
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
export function wordsFor(mode: BoardData['mode']) {
  return mode === 'classroom'
    ? { lesson: 'Bài học', lessonLower: 'bài học', unit: 'tổ / nhóm', panel: 'Bài học & tài liệu của lớp', learner: 'học sinh' }
    : { lesson: 'Buổi tập huấn', lessonLower: 'buổi tập huấn', unit: 'đơn vị', panel: 'Buổi tập huấn & tài liệu của giảng viên', learner: 'học viên' };
}
