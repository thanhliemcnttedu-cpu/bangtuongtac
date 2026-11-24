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

/** Phần "lớp" của đơn vị: "Lớp 4A – Tổ 2" → "Lớp 4A". Đơn vị không có dấu ngăn thì giữ nguyên. */
export function classPart(unit: string): string {
  return unit.split(/\s[–-]\s/)[0].trim();
}

/**
 * Bài nộp này của thành viên nào trong danh sách? Tên khớp một người thì là người đó; tên trùng ở nhiều lớp thì xét thêm lớp / tổ.
 * Không rõ thì trả null (giáo viên có thể gán thủ công).
 */
export function rosterMatcher(roster: RosterMember[]): (card: { authorName: string; unit: string }) => RosterMember | null {
  const byName = new Map<string, RosterMember[]>();
  for (const m of roster) { const k = normalize(m.name); byName.set(k, [...(byName.get(k) ?? []), m]); }
  return (card) => {
    const list = byName.get(normalize(card.authorName));
    if (!list) return null;
    if (list.length === 1) return list[0];
    const u = normalize(card.unit);
    return list.find((m) => normalize(m.unit) === u) ?? list.find((m) => normalize(classPart(m.unit)) === normalize(classPart(card.unit)) && !!classPart(card.unit)) ?? null;
  };
}

/** Ghép mỗi thành viên với bài nộp mới nhất; người nộp ngoài danh sách được thêm thành dòng riêng. */
export function buildRows(board: BoardData): BoardRow[] {
  const match = rosterMatcher(board.roster);
  const byMember = new Map<string, SubmissionCard[]>();
  const outside = new Map<string, SubmissionCard[]>();
  for (const card of board.cards) {
    const m = match(card);
    const bucket = m ? byMember : outside;
    const key = m ? m.id : normalize(card.authorName);
    bucket.set(key, [...(bucket.get(key) ?? []), card]);
  }
  const latest = (list: SubmissionCard[]): SubmissionCard =>
    list.reduce((a, b) => (a.submittedAt >= b.submittedAt ? a : b));

  const rows: BoardRow[] = [];
  for (const member of board.roster) {
    const list = byMember.get(member.id);
    const card = list ? latest(list) : null;
    rows.push({
      member,
      card,
      progress: card ? card.status : member.startedWorking ? 'in_progress' : 'not_submitted',
      inRoster: true,
    });
  }
  for (const list of outside.values()) {
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

export function summarizeByUnit(rows: BoardRow[], byClass = false): UnitSummary[] {
  const map = new Map<string, BoardRow[]>();
  for (const r of rows) {
    const key = (byClass ? classPart(r.member.unit) : r.member.unit) || '(Chưa ghi đơn vị)';
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
/** Nhận ra một cột là vai trò trong tổ công tác (Tổ trưởng, Tổ phó, Bí thư, Phó bí thư, Thư ký, Ủy viên…). */
const ROLE_RE = /^(tổ trưởng|tổ phó|phó tổ|bí thư|phó bí thư|chi ủy|chi uỷ|thư ký|ủy viên|uỷ viên|trưởng ban|phó ban|thành viên|chủ tịch|phó chủ tịch)/i;
const EMAIL_RE = /^[^\s@,;|]+@[^\s@,;|]+\.[^\s@,;|]+$/;

export function parseRosterText(text: string, idPrefix = 'ds', team = false): RosterMember[] {
  const members: RosterMember[] = [];
  const seen = new Set<string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^\d+[.)]\s+/, ''); // bỏ số thứ tự đầu dòng
    if (!line) continue;
    // Chỉ tách ở dấu ngăn ĐẦU TIÊN: phần còn lại là lớp / tổ, giữ nguyên ("Lớp 4A – Tổ 1" không bị mất "Tổ 1").
    // Nhiều cột (Tên, Lớp, Tổ) thì ghép bằng " – ".
    const cut = /\t|\s\|\s|\||;|,|\s[-–]\s/.exec(line);
    const name = (cut ? line.slice(0, cut.index) : line).trim();
    if (!name) continue;
    const rest = cut ? line.slice(cut.index + cut[0].length).split(/\t|\s\|\s|\||;|,/).map((p) => p.trim()).filter(Boolean) : [];
    // Gmail nhận ra ở mọi bảng; vai trò (Tổ trưởng, Bí thư…) chỉ tách ra ở tổ công tác. Phần còn lại là lớp / tổ.
    const email = rest.find((p) => EMAIL_RE.test(p))?.toLowerCase() ?? '';
    const roles = team ? rest.filter((p) => ROLE_RE.test(p)) : [];
    const unit = rest.filter((p) => !EMAIL_RE.test(p) && !roles.includes(p)).join(' – ');
    // Khối có nhiều lớp: hai bạn cùng tên ở hai lớp khác nhau vẫn là hai người.
    const key = `${normalize(name)}|${normalize(unit)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    members.push({ id: `${idPrefix}-${members.length + 1}`, name, unit, ...(email ? { email } : {}), ...(roles.length ? { role: roles.join(', ') } : {}) });
  }
  return members;
}
