import type { Attachment, BoardData, RepeatRule, TaskItem, TaskProgress } from '../types/board';
import type { AssignedTask } from './boardApi';
import { rosterMatcher } from './boardLogic';
import { targetsMember } from './lessons';
import { buildTaskReport } from './taskReport';

/** Việc của tôi chia theo nguồn: giao cho tôi, tôi giao, của nhóm (bảng tôi được mời), việc riêng. */
export type MyKind = 'assigned' | 'created' | 'group' | 'personal';
export type MyStatus = 'todo' | 'doing' | 'waiting' | 'postponed' | 'cancelled' | 'done' | 'overdue';

export interface MyTask {
  key: string;
  kind: MyKind;
  boardId: string;
  boardTitle: string;
  shareToken: string;
  taskId: string;
  label: string;
  instructions: string;
  dueAt: string | null;
  priority: 'high' | 'normal' | 'low';
  status: MyStatus;
  /** Bảng nằm ngoài danh sách bảng của tôi (việc người khác giao): nộp qua link công khai. */
  external: boolean;
  /** Việc tôi giao / của nhóm: đã nộp bao nhiêu trên tổng. */
  count?: { done: number; total: number };
  doneAt?: string | null;
  needsEvidence?: boolean;
  ackOnly?: boolean;
  /** Việc riêng: cột Kanban hiện tại. */
  progress?: TaskProgress;
  /** Nhóm công việc và các mốc thời gian. */
  category?: string;
  startAt?: string | null;
  reportDueAt?: string | null;
  completedAt?: string | null;
  /** Tài liệu, liên kết đính kèm và kiểu lặp của việc. */
  attachments?: Attachment[];
  repeat?: RepeatRule;
}

const dueMs = (iso: string | null): number | null => { const t = iso ? Date.parse(iso) : NaN; return Number.isNaN(t) ? null : t; };

function statusOf(done: boolean, doing: boolean, due: string | null, now: number): MyStatus {
  if (done) return 'done';
  const d = dueMs(due);
  if (d !== null && d < now) return 'overdue';
  return doing ? 'doing' : 'todo';
}

/** Trạng thái của việc riêng: hoàn thành, hủy, hoãn giữ nguyên; việc còn dang dở mà quá hạn thì là quá hạn. */
export function personalStatus(p: TaskProgress, due: string | null, now: number): MyStatus {
  if (p === 'done' || p === 'cancelled' || p === 'postponed') return p;
  const d = dueMs(due);
  if (d !== null && d < now) return 'overdue';
  return p;
}

/**
 * Gom mọi việc liên quan đến tôi từ các bảng đã tải (và danh sách việc người khác giao, nếu có).
 * Chỉ là cách nhìn gộp: dữ liệu vẫn nằm ở từng bảng, không có kho riêng.
 */
export function buildMyTasks(boards: BoardData[], myEmail: string, assigned: AssignedTask[], now: number): MyTask[] {
  const me = myEmail.trim().toLowerCase();
  const out: MyTask[] = [];
  const seenBoards = new Set<string>();
  for (const b of boards) {
    if (b.deletedAt || b.archivedAt) continue;
    seenBoards.add(b.id);
    const mine = (b.access ?? 'owner') === 'owner';
    const base = (t: TaskItem) => ({ boardId: b.id, boardTitle: b.title, shareToken: b.shareToken, taskId: t.id, label: t.label, instructions: t.instructions ?? '', dueAt: t.dueAt ?? null, priority: t.priority ?? 'normal', external: false, needsEvidence: t.needsEvidence, ackOnly: t.ackOnly, attachments: t.attachments ?? [], repeat: t.repeat ?? 'none', category: t.category, startAt: t.startAt ?? null, reportDueAt: t.reportDueAt ?? null, completedAt: t.completedAt ?? null });
    if (b.settings.personal && mine) {
      for (const t of b.tasks) out.push({ ...base(t), key: `p-${t.id}`, kind: 'personal', progress: t.progress ?? 'todo', status: personalStatus(t.progress ?? 'todo', t.dueAt ?? null, now) });
      continue;
    }
    if (b.settings.scope !== 'team') continue;
    const member = me ? b.roster.find((m) => (m.email ?? '').toLowerCase() === me) : undefined;
    const match = rosterMatcher(b.roster);
    for (const t of b.tasks) {
      // Việc hẹn giờ giao: người nhận chưa thấy, nhưng chủ bảng (người giao) luôn thấy việc mình vừa giao.
      const scheduled = !!t.assignedAt && Date.parse(t.assignedAt) > now;
      if (scheduled && !mine) continue;
      if (!scheduled && member && targetsMember(t, member)) {
        const mine2 = b.cards.filter((c) => c.taskId === t.id && match(c)?.id === member.id);
        const first = mine2.reduce<string | null>((a, c) => (a === null || c.submittedAt < a ? c.submittedAt : a), null);
        out.push({ ...base(t), key: `a-${b.id}-${t.id}`, kind: 'assigned', status: statusOf(mine2.length > 0, !!member.startedWorking, t.dueAt ?? null, now), doneAt: first });
        // Việc giao riêng cho đúng mình thì không cần thêm dòng "tôi giao".
        if ((t.assigneeEmails ?? []).length === 1) continue;
      }
      if (b.roster.length === 0 && !mine) continue;
      const r = buildTaskReport(b, t);
      const all = r.total > 0 && r.done.length === r.total;
      out.push({ ...base(t), key: `${mine ? 'c' : 'g'}-${b.id}-${t.id}`, kind: mine ? 'created' : 'group', count: { done: r.done.length, total: r.total }, status: statusOf(all, r.done.length > 0, t.dueAt ?? null, now) });
    }
  }
  // Việc người khác giao cho tôi ở bảng ngoài danh sách bảng của tôi (hàm my_tasks của máy chủ).
  for (const a of assigned) {
    if (seenBoards.has(a.boardId)) continue;
    out.push({
      key: `x-${a.boardId}-${a.taskId}`, kind: 'assigned', boardId: a.boardId, boardTitle: a.boardTitle, shareToken: a.shareToken, taskId: a.taskId, label: a.label,
      instructions: a.instructions, dueAt: a.dueAt, priority: 'normal', external: true, needsEvidence: a.needsEvidence, ackOnly: a.ackOnly,
      status: statusOf(!!a.doneAt, false, a.dueAt, now), doneAt: a.doneAt,
    });
  }
  return out;
}

/** Thứ tự xem: quá hạn trước, rồi theo hạn gần nhất, việc không hạn cuối, việc xong dưới cùng. */
export function sortMyTasks(list: MyTask[]): MyTask[] {
  const rank = (t: MyTask): number => (t.status === 'done' ? 3 : t.status === 'overdue' ? 0 : 1);
  const pr = { high: 0, normal: 1, low: 2 } as const;
  return [...list].sort((a, b) => rank(a) - rank(b) || (dueMs(a.dueAt) ?? Infinity) - (dueMs(b.dueAt) ?? Infinity) || pr[a.priority] - pr[b.priority] || a.label.localeCompare(b.label, 'vi'));
}

/** Thứ Hai của tuần chứa ngày d (giờ 0:00). */
export function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
