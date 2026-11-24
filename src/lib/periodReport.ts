import type { BoardData, RosterMember, TaskItem } from '../types/board';
import { formatDateTime, targetsMember } from './lessons';
import { buildTaskReport } from './taskReport';
import type { TaskReport } from './taskReport';
import { startOfWeek } from './myTasks';

export type PeriodKind = 'week' | 'month';

export interface PeriodRange { from: Date; to: Date; label: string }

const pad = (n: number): string => String(n).padStart(2, '0');
const dm = (d: Date): string => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;

/** Khoảng thời gian của tuần (thứ Hai → Chủ nhật) hoặc tháng, lệch `offset` kỳ so với kỳ chứa `now`. */
export function periodRange(kind: PeriodKind, offset: number, now: number): PeriodRange {
  const base = new Date(now);
  if (kind === 'week') {
    const from = startOfWeek(base);
    from.setDate(from.getDate() + offset * 7);
    const to = new Date(from); to.setDate(to.getDate() + 7);
    const last = new Date(to); last.setDate(last.getDate() - 1);
    return { from, to, label: `Tuần ${dm(from)} – ${dm(last)}/${last.getFullYear()}` };
  }
  const from = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
  return { from, to, label: `Tháng ${from.getMonth() + 1}/${from.getFullYear()}` };
}

export interface PeriodTaskRow { task: TaskItem; report: TaskReport }
export interface PeriodMemberRow { member: RosterMember; assigned: number; done: number; late: number; missing: string[] }
export interface PeriodReport {
  range: PeriodRange;
  tasks: PeriodTaskRow[];
  members: PeriodMemberRow[];
  /** Tổng lượt giao, lượt đã nộp, lượt nộp muộn, tỉ lệ hoàn thành (%). */
  slots: number; done: number; late: number; pct: number;
}

/** Tổng hợp tuần / tháng: các việc có hạn rơi vào kỳ; mỗi thành viên làm được bao nhiêu, muộn bao nhiêu, còn thiếu việc nào. */
export function buildPeriodReport(board: BoardData, kind: PeriodKind, offset: number, now: number): PeriodReport {
  const range = periodRange(kind, offset, now);
  const inRange = board.tasks.filter((t) => { const d = t.dueAt ? Date.parse(t.dueAt) : NaN; return !Number.isNaN(d) && d >= range.from.getTime() && d < range.to.getTime(); });
  const tasks = inRange.map((task) => ({ task, report: buildTaskReport(board, task) }));
  const members: PeriodMemberRow[] = board.roster.map((member) => {
    const mine = tasks.filter((t) => targetsMember(t.task, member));
    const doneRows = mine.flatMap((t) => { const d = t.report.done.find((x) => x.member.id === member.id); return d ? [d] : []; });
    return {
      member, assigned: mine.length, done: doneRows.length, late: doneRows.filter((d) => d.late).length,
      missing: mine.filter((t) => !t.report.done.some((x) => x.member.id === member.id)).map((t) => t.task.label),
    };
  });
  const slots = members.reduce((n, m) => n + m.assigned, 0);
  const done = members.reduce((n, m) => n + m.done, 0);
  return { range, tasks, members, slots, done, late: members.reduce((n, m) => n + m.late, 0), pct: slots === 0 ? 0 : Math.round((done / slots) * 100) };
}

export function periodRows(board: BoardData, r: PeriodReport): string[][] {
  return [
    [`Tổng hợp công việc – ${board.title}`], [r.range.label], [`Hoàn thành ${r.done}/${r.slots} lượt (${r.pct}%), nộp muộn ${r.late}`], [],
    ['Theo thành viên'], ['STT', 'Họ tên', 'Vai trò', 'Được giao', 'Đã nộp', 'Nộp muộn', 'Tỉ lệ', 'Còn thiếu'],
    ...r.members.map((m, i) => [String(i + 1), m.member.name, m.member.role ?? '', String(m.assigned), String(m.done), String(m.late), m.assigned ? `${Math.round((m.done / m.assigned) * 100)}%` : '', m.missing.join('; ')]),
    [], ['Theo công việc'], ['Công việc', 'Hạn', 'Đã nộp', 'Tổng', 'Tỉ lệ', 'Nộp muộn'],
    ...r.tasks.map((t) => [t.task.label, formatDateTime(t.task.dueAt), String(t.report.done.length), String(t.report.total), `${t.report.pct}%`, String(t.report.lateCount)]),
  ];
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function periodHtml(board: BoardData, r: PeriodReport): string {
  const mrows = r.members.map((m, i) => `<tr><td>${i + 1}</td><td>${esc(m.member.name)}${m.member.role ? ` <i>(${esc(m.member.role)})</i>` : ''}</td><td>${m.assigned}</td><td>${m.done}</td><td>${m.late}</td><td>${m.assigned ? Math.round((m.done / m.assigned) * 100) : 0}%</td><td>${esc(m.missing.join('; '))}</td></tr>`).join('');
  const trows = r.tasks.map((t) => `<tr><td>${esc(t.task.label)}</td><td>${esc(formatDateTime(t.task.dueAt))}</td><td>${t.report.done.length}/${t.report.total}</td><td>${t.report.pct}%</td><td>${t.report.lateCount}</td></tr>`).join('');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Tổng hợp – ${esc(r.range.label)}</title>
<style>body{font:13px/1.45 'Be Vietnam Pro',system-ui,sans-serif;margin:22px;color:#0a1730}h1{font-size:19px;margin:0 0 2px}h2{font-size:14px;margin:16px 0 4px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #9fb4d6;padding:4px 7px;text-align:left}th{background:#e3eeff}.k{display:flex;gap:14px;margin:8px 0}.k div{border:1px solid #9fb4d6;border-radius:8px;padding:5px 12px}.k b{font-size:18px;display:block}@page{size:A4;margin:12mm}</style></head><body>
<h1>TỔNG HỢP CÔNG VIỆC</h1><p><b>${esc(board.title)}</b> · ${esc(r.range.label)}</p>
<div class="k"><div><b>${r.tasks.length}</b>Việc</div><div><b>${r.done}/${r.slots} (${r.pct}%)</b>Đã nộp</div><div><b>${r.late}</b>Nộp muộn</div></div>
<h2>Theo thành viên</h2><table><thead><tr><th>STT</th><th>Họ tên</th><th>Giao</th><th>Nộp</th><th>Muộn</th><th>Tỉ lệ</th><th>Còn thiếu</th></tr></thead><tbody>${mrows}</tbody></table>
<h2>Theo công việc</h2><table><thead><tr><th>Công việc</th><th>Hạn</th><th>Đã nộp</th><th>Tỉ lệ</th><th>Muộn</th></tr></thead><tbody>${trows}</tbody></table>
<p style="margin-top:10px;color:#46556e">Xuất lúc ${esc(formatDateTime(new Date().toISOString()))}</p></body></html>`;
}

export function periodText(board: BoardData, r: PeriodReport): string {
  const behind = r.members.filter((m) => m.missing.length > 0);
  return [
    `TỔNG HỢP ${r.range.label.toUpperCase()} – ${board.title}`,
    `Việc đến hạn: ${r.tasks.length} · Đã nộp: ${r.done}/${r.slots} lượt (${r.pct}%) · Nộp muộn: ${r.late}`,
    behind.length > 0 ? `\nCòn thiếu:\n${behind.map((m) => `- ${m.member.name}: ${m.missing.join('; ')}`).join('\n')}` : '\nKhông ai còn thiếu việc.',
  ].join('\n');
}
