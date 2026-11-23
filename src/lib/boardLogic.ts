// Logic thuần (không phụ thuộc giao diện): ghép sĩ số với bài nộp, lọc, tính KPI, đọc danh sách dán.

import type {
  BoardData,
  BoardRow,
  FilterState,
  Kpis,
  MemberProgress,
  ProgressFilter,
  RosterMember,
  SortBy,
  SubmissionCard,
} from '../types/board';

export const EMPTY_FILTERS: FilterState = {
  search: '',
  title: '',
  taskId: '',
  progress: 'all',
  time: 'all',
  sessionId: '',
};

/** Bỏ dấu + hạ chữ thường để so khớp tên ("Nguyễn Văn A" = "nguyen van a"). */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ghép mỗi thành viên với bài nộp mới nhất; người nộp ngoài danh sách được thêm thành dòng riêng. */
export function buildRows(board: BoardData): BoardRow[] {
  const byName = new Map<string, SubmissionCard[]>();
  for (const card of board.cards) {
    const key = normalize(card.authorName);
    const list = byName.get(key) ?? [];
    list.push(card);
    byName.set(key, list);
  }
  const latest = (list: SubmissionCard[]): SubmissionCard =>
    list.reduce((a, b) => (a.submittedAt >= b.submittedAt ? a : b));

  const rows: BoardRow[] = [];
  const used = new Set<string>();
  for (const member of board.roster) {
    const key = normalize(member.name);
    const list = byName.get(key);
    if (list) used.add(key);
    const card = list ? latest(list) : null;
    rows.push({
      member,
      card,
      progress: card ? card.status : member.startedWorking ? 'in_progress' : 'not_submitted',
      inRoster: true,
    });
  }
  for (const [key, list] of byName) {
    if (used.has(key)) continue;
    const card = latest(list);
    rows.push({
      member: { id: `guest-${card.id}`, name: card.authorName, unit: card.unit },
      card,
      progress: card.status,
      inRoster: false,
    });
  }
  return rows;
}

export function matchesProgress(progress: MemberProgress, filter: ProgressFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'submitted':
      return progress !== 'not_submitted' && progress !== 'in_progress';
    case 'waiting':
      return progress === 'pending' || progress === 'in_progress';
    case 'done':
      return progress === 'approved' || progress === 'featured';
    default:
      return progress === filter;
  }
}

function matchesTime(card: SubmissionCard | null, f: FilterState, board: BoardData, now: number): boolean {
  if (f.time === 'all' || !card) return true; // chưa có bài thì không có mốc thời gian để lọc
  const t = new Date(card.submittedAt).getTime();
  if (f.time === '24h') return now - t <= 24 * 3_600_000;
  if (f.time === '7d') return now - t <= 7 * 24 * 3_600_000;
  if (f.time === 'today') return new Date(t).toDateString() === new Date(now).toDateString();
  const slot = board.sessions.find((s) => s.id === f.sessionId);
  if (!slot) return true;
  return t >= new Date(slot.fromIso).getTime() && t <= new Date(slot.toIso).getTime();
}

export function applyFilters(rows: BoardRow[], f: FilterState, board: BoardData, now = Date.now()): BoardRow[] {
  const q = normalize(f.search);
  return rows.filter((r) => {
    if (q && !normalize(r.member.name).includes(q) && !normalize(r.member.unit).includes(q)) return false;
    if (f.title && r.card?.title !== f.title) return false;
    if (f.taskId && r.card?.taskId !== f.taskId) return false;
    if (!matchesProgress(r.progress, f.progress)) return false;
    return matchesTime(r.card, f, board, now);
  });
}

/** Sắp xếp dòng theo cài đặt của bảng; dòng chưa có bài luôn xếp cuối khi sắp theo thời gian. */
export function sortRows(rows: BoardRow[], sortBy: SortBy): BoardRow[] {
  const time = (r: BoardRow): number => (r.card ? new Date(r.card.submittedAt).getTime() : Number.NaN);
  const byName = (a: BoardRow, b: BoardRow): number => a.member.name.localeCompare(b.member.name, 'vi');
  const copy = [...rows];
  copy.sort((a, b) => {
    if (sortBy === 'name') return byName(a, b);
    if (sortBy === 'unit') return a.member.unit.localeCompare(b.member.unit, 'vi') || byName(a, b);
    const ta = time(a);
    const tb = time(b);
    if (Number.isNaN(ta) && Number.isNaN(tb)) return byName(a, b);
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return sortBy === 'newest' ? tb - ta : ta - tb;
  });
  return copy;
}

export function computeKpis(rows: BoardRow[]): Kpis {
  const total = rows.length;
  const count = (f: ProgressFilter): number => rows.filter((r) => matchesProgress(r.progress, f)).length;
  const done = count('done');
  return {
    total,
    submitted: count('submitted'),
    waiting: count('waiting'),
    notSubmitted: count('not_submitted'),
    done,
    completionPct: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

export function isFiltered(f: FilterState): boolean {
  return (
    f.search !== '' || f.title !== '' || f.taskId !== '' || f.progress !== 'all' || f.time !== 'all'
  );
}

export interface UnitSummary {
  unit: string;
  total: number;
  submitted: number;
  waiting: number;
  notSubmitted: number;
  done: number;
  pct: number;
}

export function summarizeByUnit(rows: BoardRow[]): UnitSummary[] {
  const map = new Map<string, BoardRow[]>();
  for (const r of rows) {
    const key = r.member.unit || '(Chưa ghi đơn vị)';
    map.set(key, [...(map.get(key) ?? []), r]);
  }
  return [...map.entries()]
    .map(([unit, list]) => {
      const k = computeKpis(list);
      return {
        unit,
        total: k.total,
        submitted: k.submitted,
        waiting: k.waiting,
        notSubmitted: k.notSubmitted,
        done: k.done,
        pct: k.completionPct,
      };
    })
    .sort((a, b) => a.unit.localeCompare(b.unit, 'vi'));
}

/** Đọc danh sách dán vào: mỗi dòng 1 người; "Tên", "Tên, Lớp", "Tên<Tab>Lớp", "Tên | Lớp", "Tên - Lớp". */
export function parseRosterText(text: string, idPrefix = 'ds'): RosterMember[] {
  const members: RosterMember[] = [];
  const seen = new Set<string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^\d+[.)]\s+/, ''); // bỏ số thứ tự đầu dòng
    if (!line) continue;
    const parts = line.split(/\t|\s\|\s|\||;|,|\s[-–]\s/).map((p) => p.trim()).filter(Boolean);
    const name = parts[0];
    if (!name) continue;
    const key = normalize(name);
    if (seen.has(key)) continue;
    seen.add(key);
    members.push({ id: `${idPrefix}-${members.length + 1}`, name, unit: parts[1] ?? '' });
  }
  return members;
}
