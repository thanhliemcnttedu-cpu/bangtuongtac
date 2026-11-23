import type { BoardData } from '../types/board';

/** Số liệu tóm tắt của một bảng để hiện trên trang Tổng quan. */
export interface BoardStats {
  total: number;
  pending: number;
  needsEdit: number;
  approved: number;
  /** Số thành viên danh sách đã có ít nhất một bài. */
  submitters: number;
  rosterSize: number;
  /** Hạn nộp gần nhất sắp tới (ISO) và nhãn bài tập đó. */
  nextDue?: { at: string; label: string };
  /** Số bài tập / yêu cầu đã giao đang còn hạn trong 3 ngày tới. */
  dueSoon: number;
  /** Số bài tập đã quá hạn. */
  overdue: number;
  late: number;
}

const DAY = 86_400_000;

export function boardStats(b: BoardData, now = Date.now()): BoardStats {
  const cards = b.cards;
  const pending = cards.filter((c) => c.status === 'pending').length;
  const needsEdit = cards.filter((c) => c.status === 'needs_edit').length;
  const approved = cards.filter((c) => c.status === 'approved' || c.status === 'featured').length;
  const names = new Set(cards.map((c) => c.authorName.trim().toLowerCase()));
  const submitters = b.roster.length > 0 ? b.roster.filter((m) => names.has(m.name.trim().toLowerCase())).length : names.size;
  const assigned = b.tasks.filter((t) => !t.assignedAt || new Date(t.assignedAt).getTime() <= now);
  const dues = assigned.filter((t) => t.dueAt).map((t) => ({ at: t.dueAt as string, label: t.label, ms: new Date(t.dueAt as string).getTime() }));
  const upcoming = dues.filter((d) => d.ms > now).sort((x, y) => x.ms - y.ms);
  return {
    total: cards.length, pending, needsEdit, approved, submitters, rosterSize: b.roster.length,
    nextDue: upcoming[0] ? { at: upcoming[0].at, label: upcoming[0].label } : undefined,
    dueSoon: upcoming.filter((d) => d.ms - now <= 3 * DAY).length,
    overdue: dues.filter((d) => d.ms <= now).length,
    late: cards.filter((c) => c.late).length,
  };
}

export interface OverviewTotals {
  classes: number;
  programs: number;
  trainings: number;
  shared: number;
  pending: number;
  needsEdit: number;
  submissions: number;
  dueSoon: number;
}

export function overviewTotals(boards: BoardData[], now = Date.now()): OverviewTotals {
  const own = boards.filter((b) => (b.access ?? 'owner') === 'owner');
  const t: OverviewTotals = { classes: 0, programs: 0, trainings: 0, shared: boards.filter((b) => (b.access ?? 'owner') !== 'owner').length, pending: 0, needsEdit: 0, submissions: 0, dueSoon: 0 };
  const programs = new Set<string>();
  for (const b of own) {
    const s = boardStats(b, now);
    if (b.mode === 'classroom') t.classes += 1; else t.trainings += 1;
    if (b.program) programs.add(b.program);
    t.pending += s.pending; t.needsEdit += s.needsEdit; t.submissions += s.total; t.dueSoon += s.dueSoon;
  }
  t.programs = programs.size;
  return t;
}
