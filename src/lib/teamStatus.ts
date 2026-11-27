import type { CardStatus, RosterMember, TaskItem } from '../types/board';
import { normalizeName } from './editCode';

/** Một lượt nộp trong bảng tổ: chỉ có ai, việc nào, lúc nào; không có nội dung hay tệp. */
export interface TeamStatusRow {
  id: string;
  taskId: string;
  author: string;
  unit: string;
  status: CardStatus;
  late: boolean;
  submittedAt: string;
  resubmittedAt?: string;
}

export interface MemberStatus {
  name: string;
  /** Lượt nộp mới nhất của người này cho việc đang xét; chưa nộp thì không có. */
  row?: TeamStatusRow;
  /** Mọi lượt nộp của người này cho việc đang xét (để nhận ra bài của máy này). */
  ids: string[];
}

const when = (r: TeamStatusRow): string => r.resubmittedAt ?? r.submittedAt;

/** Danh sách người phải nộp một việc kèm trạng thái; người ngoài danh sách đã nộp được xếp cuối. */
export function statusOfTask(task: TaskItem, roster: Pick<RosterMember, 'name' | 'unit'>[], rows: TeamStatusRow[]): MemberStatus[] {
  const targets = task.targetUnits ?? [];
  const expected = targets.length === 0 ? roster : roster.filter((m) => targets.includes(m.unit.trim()));
  const byName = new Map<string, MemberStatus>();
  for (const m of expected) byName.set(normalizeName(m.name), { name: m.name, ids: [] });
  for (const r of rows) {
    if (r.taskId !== task.id) continue;
    const key = normalizeName(r.author);
    const cur = byName.get(key) ?? { name: r.author, ids: [] };
    cur.ids.push(r.id);
    if (!cur.row || when(r) > when(cur.row)) cur.row = r;
    byName.set(key, cur);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }));
}
