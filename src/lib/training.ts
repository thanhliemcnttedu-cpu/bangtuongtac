import type { BoardData, RosterMember, SubmissionCard } from '../types/board';
import { normalize } from './boardLogic';
import { formatDateTime } from './lessons';
import { buildTaskReport } from './taskReport';

export interface MemberStatus {
  member: RosterMember;
  /** Số việc được giao / đã nộp (bài đã nộp, kể cả chờ duyệt). */
  tasks: number;
  done: number;
  /** Số buổi có mặt / tổng số buổi; null = lớp chưa có buổi điểm danh nào. */
  present: number;
  sessions: number;
  attendancePct: number | null;
  completed: boolean;
}

/** Tình hình hoàn thành của từng học viên: nộp đủ các việc được giao và (nếu có điểm danh) tỉ lệ có mặt. */
export function memberStatuses(board: BoardData): MemberStatus[] {
  const reports = board.tasks.map((t) => buildTaskReport(board, t));
  const sessions = board.attendance ?? [];
  return board.roster.map((member) => {
    const mine = reports.filter((r) => r.done.some((d) => d.member.id === member.id) || r.missing.some((m) => m.id === member.id));
    const done = mine.filter((r) => r.done.some((d) => d.member.id === member.id)).length;
    const key = normalize(member.name);
    const present = sessions.filter((s) => s.present.includes(key)).length;
    return { member, tasks: mine.length, done, present, sessions: sessions.length, attendancePct: sessions.length === 0 ? null : Math.round((present / sessions.length) * 100), completed: mine.length > 0 && done === mine.length };
  });
}

/** Đủ điều kiện nhận giấy chứng nhận: hoàn thành mọi việc và có mặt từ ngưỡng % trở lên (bỏ qua điều kiện này nếu chưa điểm danh). */
export function eligible(list: MemberStatus[], minAttendancePct: number): MemberStatus[] {
  return list.filter((m) => m.completed && (m.attendancePct === null || m.attendancePct >= minAttendancePct));
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface CertOptions { course: string; issuer: string; signerTitle: string; signerName: string; place: string }

/** Mỗi học viên một trang A4 ngang: in hoặc lưu thành PDF. */
export function certificatesHtml(people: string[], o: CertOptions, when: Date): string {
  const date = `${o.place ? `${o.place}, ` : ''}ngày ${when.getDate()} tháng ${when.getMonth() + 1} năm ${when.getFullYear()}`;
  const pages = people.map((name) => `<section class="p"><div class="b">
<p class="is">${esc(o.issuer)}</p><h1>GIẤY CHỨNG NHẬN</h1><p class="s">Chứng nhận</p><p class="n">${esc(name)}</p>
<p class="t">đã hoàn thành các nội dung và yêu cầu của lớp tập huấn</p><p class="c">“${esc(o.course)}”</p>
<div class="f"><p>${esc(date)}</p><p><b>${esc(o.signerTitle)}</b></p><p class="sg">${esc(o.signerName)}</p></div></div></section>`).join('');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Giấy chứng nhận</title><style>
@page{size:A4 landscape;margin:0}body{margin:0;font-family:'Be Vietnam Pro',Georgia,serif;color:#0a1730}
.p{width:297mm;height:210mm;box-sizing:border-box;padding:12mm;page-break-after:always;display:flex}.p:last-child{page-break-after:auto}
.b{flex:1;border:3px double #1668f2;padding:14mm 18mm;text-align:center;display:flex;flex-direction:column;justify-content:center}
.is{margin:0 0 6mm;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#46556e}h1{margin:0;font-size:40pt;letter-spacing:.08em;color:#0b4fd0}
.s{margin:8mm 0 2mm;font-size:14pt}.n{margin:0;font-size:32pt;font-weight:800}.t{margin:6mm 0 2mm;font-size:14pt}.c{margin:0;font-size:20pt;font-weight:700}
.f{margin-top:12mm;align-self:flex-end;text-align:center;font-size:12pt}.f p{margin:1mm 0}.sg{margin-top:16mm!important;font-weight:700}</style></head><body>${pages}</body></html>`;
}

export interface Ranked { card: SubmissionCard; avg: number; votes: number }

/** Xếp hạng sản phẩm đã duyệt theo điểm trung bình của các bạn (đồng điểm thì nhiều lượt hơn, rồi sao của giáo viên). */
export function rankShowcase(board: BoardData): Ranked[] {
  return board.cards
    .filter((c) => c.status === 'approved' || c.status === 'featured')
    .map((card) => ({ card, votes: card.ratingCount ?? 0, avg: card.ratingCount ? (card.ratingSum ?? 0) / card.ratingCount : 0 }))
    .sort((a, b) => b.avg - a.avg || b.votes - a.votes || (b.card.teacherStars ?? 0) - (a.card.teacherStars ?? 0) || (a.card.status === 'featured' ? -1 : 1));
}

/** Số liệu tổng kết khóa. */
export function courseSummary(board: BoardData, minPct: number) {
  const list = memberStatuses(board);
  const ok = eligible(list, minPct);
  const att = list.filter((m) => m.attendancePct !== null);
  const avgAtt = att.length === 0 ? null : Math.round(att.reduce((n, m) => n + (m.attendancePct ?? 0), 0) / att.length);
  const units = new Map<string, { total: number; completed: number }>();
  for (const m of list) { const u = m.member.unit || '(Chưa ghi đơn vị)'; const x = units.get(u) ?? { total: 0, completed: 0 }; x.total += 1; if (m.completed) x.completed += 1; units.set(u, x); }
  return { list, ok, avgAtt, units: [...units.entries()].sort((a, b) => a[0].localeCompare(b[0], 'vi')), ranked: rankShowcase(board).slice(0, 5), sessions: board.attendance ?? [] };
}

export function summaryRows(board: BoardData, minPct: number): string[][] {
  const s = courseSummary(board, minPct);
  return [
    [`Tổng kết khóa tập huấn – ${board.title}`], [`Học viên: ${s.list.length} · Hoàn thành: ${s.list.filter((m) => m.completed).length} · Đủ điều kiện chứng nhận (có mặt ≥ ${minPct}%): ${s.ok.length}`], [],
    ['STT', 'Họ tên', 'Đơn vị', 'Việc đã nộp', 'Việc được giao', 'Buổi có mặt', 'Tổng số buổi', 'Tỉ lệ có mặt', 'Hoàn thành', 'Đủ điều kiện chứng nhận'],
    ...s.list.map((m, i) => [String(i + 1), m.member.name, m.member.unit, String(m.done), String(m.tasks), String(m.present), String(m.sessions), m.attendancePct === null ? '' : `${m.attendancePct}%`, m.completed ? 'Có' : 'Chưa', s.ok.includes(m) ? 'Có' : 'Không']),
  ];
}

/** Báo cáo tổng kết một trang. */
export function summaryHtml(board: BoardData, minPct: number): string {
  const s = courseSummary(board, minPct);
  const rows = s.list.map((m, i) => `<tr><td>${i + 1}</td><td>${esc(m.member.name)}</td><td>${esc(m.member.unit)}</td><td>${m.done}/${m.tasks}</td><td>${m.attendancePct === null ? '—' : `${m.present}/${m.sessions} (${m.attendancePct}%)`}</td><td>${s.ok.includes(m) ? 'Đủ điều kiện' : m.completed ? 'Thiếu buổi' : 'Chưa hoàn thành'}</td></tr>`).join('');
  const units = s.units.map(([u, x]) => `<tr><td>${esc(u)}</td><td>${x.completed}/${x.total}</td><td>${Math.round((x.completed / x.total) * 100)}%</td></tr>`).join('');
  const top = s.ranked.map((r, i) => `<li>${i + 1}. ${esc(r.card.title)} – ${esc(r.card.authorName)}${r.votes ? ` (${r.avg.toFixed(1)}★, ${r.votes} lượt)` : ''}</li>`).join('');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Tổng kết – ${esc(board.title)}</title><style>body{font:12px/1.4 'Be Vietnam Pro',system-ui,sans-serif;margin:18px;color:#0a1730}h1{font-size:18px;margin:0}h2{font-size:13px;margin:12px 0 3px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #9fb4d6;padding:3px 6px;text-align:left}th{background:#e3eeff}.k{display:flex;gap:12px;margin:8px 0}.k div{border:1px solid #9fb4d6;border-radius:8px;padding:4px 12px}.k b{font-size:17px;display:block}@page{size:A4;margin:12mm}</style></head><body>
<h1>TỔNG KẾT KHÓA TẬP HUẤN</h1><p><b>${esc(board.title)}</b>${board.program ? ` · ${esc(board.program)}` : ''}</p>
<div class="k"><div><b>${s.list.length}</b>Học viên</div><div><b>${s.list.filter((m) => m.completed).length}</b>Hoàn thành việc</div><div><b>${s.ok.length}</b>Đủ điều kiện chứng nhận</div><div><b>${s.sessions.length}</b>Buổi điểm danh</div><div><b>${s.avgAtt === null ? '—' : `${s.avgAtt}%`}</b>Có mặt trung bình</div></div>
<h2>Theo đơn vị</h2><table><thead><tr><th>Đơn vị</th><th>Hoàn thành</th><th>Tỉ lệ</th></tr></thead><tbody>${units}</tbody></table>
${top ? `<h2>Sản phẩm được bình chọn cao</h2><ul style="margin:0;padding-left:16px">${top}</ul>` : ''}
<h2>Danh sách học viên</h2><table><thead><tr><th>STT</th><th>Họ tên</th><th>Đơn vị</th><th>Việc nộp</th><th>Có mặt</th><th>Kết quả</th></tr></thead><tbody>${rows}</tbody></table>
<p style="margin-top:8px;color:#46556e">Xuất lúc ${esc(formatDateTime(new Date().toISOString()))}</p></body></html>`;
}
