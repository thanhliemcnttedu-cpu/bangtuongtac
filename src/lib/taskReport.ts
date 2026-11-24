import type { BoardData, RosterMember, SubmissionCard, TaskItem } from '../types/board';
import { rosterMatcher } from './boardLogic';
import { formatDateTime, targetsMember } from './lessons';

/** Một người đã nộp việc này: bài nộp mới nhất, nộp sớm hay muộn so với hạn. */
export interface DoneEntry { member: RosterMember; card: SubmissionCard; late: boolean; /** phút so với hạn: âm = sớm hơn hạn */ minutesFromDue: number | null }

export interface TaskReport {
  task: TaskItem;
  total: number;
  done: DoneEntry[];
  missing: RosterMember[];
  /** Số người nộp mà tên không có trong danh sách. */
  outside: number;
  pct: number;
  onTime: number;
  lateCount: number;
}

/** Tình hình nộp của một công việc: ai đã nộp (sớm / muộn), ai chưa, tỉ lệ. Chỉ tính người được giao việc này. */
export function buildTaskReport(board: BoardData, task: TaskItem): TaskReport {
  const match = rosterMatcher(board.roster);
  const latest = new Map<string, SubmissionCard>();
  const outside = new Set<string>();
  for (const c of board.cards) {
    if (c.taskId !== task.id) continue;
    const m = match(c);
    if (!m) { outside.add(c.authorName.trim().toLowerCase()); continue; }
    const old = latest.get(m.id);
    if (!old || c.submittedAt > old.submittedAt) latest.set(m.id, c);
  }
  const targeted = board.roster.filter((m) => targetsMember(task, m));
  const due = task.dueAt ? Date.parse(task.dueAt) : null;
  const done: DoneEntry[] = targeted.flatMap((member) => {
    const card = latest.get(member.id);
    if (!card) return [];
    const at = Date.parse(card.submittedAt);
    const minutes = due === null || Number.isNaN(at) ? null : Math.round((at - due) / 60000);
    return [{ member, card, late: !!card.late || (minutes !== null && minutes > 0), minutesFromDue: minutes }];
  });
  const doneIds = new Set(done.map((d) => d.member.id));
  const missing = targeted.filter((m) => !doneIds.has(m.id));
  const lateCount = done.filter((d) => d.late).length;
  return { task, total: targeted.length, done, missing, outside: outside.size, pct: targeted.length === 0 ? 0 : Math.round((done.length / targeted.length) * 100), onTime: done.length - lateCount, lateCount };
}

/** "sớm 3 giờ", "muộn 2 ngày"… so với hạn. Không có hạn thì trả chuỗi rỗng. */
export function dueDiffText(minutes: number | null): string {
  if (minutes === null) return '';
  const abs = Math.abs(minutes);
  const unit = abs >= 2880 ? `${Math.round(abs / 1440)} ngày` : abs >= 120 ? `${Math.round(abs / 60)} giờ` : `${Math.max(1, abs)} phút`;
  return minutes > 0 ? `muộn ${unit}` : `sớm ${unit}`;
}

/** Báo cáo ngắn để dán vào Zalo hoặc gửi lãnh đạo. */
export function reportText(board: BoardData, r: TaskReport): string {
  const lines = [
    `BÁO CÁO CÔNG VIỆC – ${board.title}`,
    `Nội dung: ${r.task.label}`,
    r.task.dueAt ? `Hạn: ${formatDateTime(r.task.dueAt)}` : '',
    `Tổng số: ${r.total} · Đã nộp: ${r.done.length} (${r.pct}%) · Chưa nộp: ${r.missing.length}`,
    r.task.dueAt ? `Đúng hạn / sớm: ${r.onTime} · Nộp muộn: ${r.lateCount}` : '',
    r.done.length > 0 ? `\nĐã nộp (${r.done.length}):\n${r.done.map((d) => `- ${d.member.name} – ${formatDateTime(d.card.submittedAt)}${d.minutesFromDue !== null ? ` (${dueDiffText(d.minutesFromDue)})` : ''}`).join('\n')}` : '',
    r.missing.length > 0 ? `\nChưa nộp (${r.missing.length}):\n${r.missing.map((m) => `- ${m.name}`).join('\n')}` : '\nTất cả đã nộp đủ.',
  ];
  return lines.filter((l) => l !== '').join('\n');
}

/** Bảng CSV: một dòng mỗi thành viên, đã nộp hay chưa, giờ nộp, sớm / muộn. */
export function reportRows(board: BoardData, r: TaskReport): string[][] {
  const doneBy = new Map(r.done.map((d) => [d.member.id, d]));
  const header = ['STT', 'Họ tên', 'Vai trò', 'Trạng thái', 'Thời gian nộp', 'So với hạn', 'Số tệp minh chứng'];
  const body = board.roster.filter((m) => r.done.some((d) => d.member.id === m.id) || r.missing.some((x) => x.id === m.id)).map((m, i) => {
    const d = doneBy.get(m.id);
    return [String(i + 1), m.name, m.role ?? '', d ? (d.late ? 'Nộp muộn' : 'Đã nộp') : 'Chưa nộp', d ? formatDateTime(d.card.submittedAt) : '', d ? dueDiffText(d.minutesFromDue) : '', d ? String(d.card.attachments.length) : ''];
  });
  return [[`Công việc: ${r.task.label}`], [`Đã nộp ${r.done.length}/${r.total} (${r.pct}%)`], [], header, ...body];
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Trang HTML một tờ để in hoặc lưu thành PDF. */
export function reportHtml(board: BoardData, r: TaskReport): string {
  const rows = board.roster.filter((m) => r.done.some((d) => d.member.id === m.id) || r.missing.some((x) => x.id === m.id)).map((m, i) => {
    const d = r.done.find((x) => x.member.id === m.id);
    return `<tr><td>${i + 1}</td><td>${esc(m.name)}${m.role ? ` <i>(${esc(m.role)})</i>` : ''}</td><td>${d ? (d.late ? 'Nộp muộn' : 'Đã nộp') : '<b>Chưa nộp</b>'}</td><td>${d ? esc(formatDateTime(d.card.submittedAt)) : ''}</td><td>${d ? esc(dueDiffText(d.minutesFromDue)) : ''}</td></tr>`;
  }).join('');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Báo cáo – ${esc(r.task.label)}</title>
<style>body{font:14px/1.45 'Be Vietnam Pro',system-ui,sans-serif;margin:24px;color:#0a1730}h1{font-size:20px;margin:0 0 4px}p{margin:2px 0}table{border-collapse:collapse;width:100%;margin-top:14px}td,th{border:1px solid #9fb4d6;padding:5px 8px;text-align:left}th{background:#e3eeff}.k{display:flex;gap:18px;margin-top:10px}.k div{border:1px solid #9fb4d6;border-radius:8px;padding:6px 14px}.k b{font-size:20px;display:block}@page{size:A4;margin:14mm}</style></head><body>
<h1>BÁO CÁO CÔNG VIỆC</h1><p><b>${esc(board.title)}</b></p><p>Nội dung: ${esc(r.task.label)}</p>${r.task.dueAt ? `<p>Hạn: ${esc(formatDateTime(r.task.dueAt))}</p>` : ''}
<div class="k"><div><b>${r.total}</b>Tổng số</div><div><b>${r.done.length} (${r.pct}%)</b>Đã nộp</div><div><b>${r.missing.length}</b>Chưa nộp</div><div><b>${r.lateCount}</b>Nộp muộn</div></div>
<table><thead><tr><th>STT</th><th>Họ tên</th><th>Trạng thái</th><th>Giờ nộp</th><th>So với hạn</th></tr></thead><tbody>${rows}</tbody></table>
<p style="margin-top:12px;color:#46556e">Xuất lúc ${esc(formatDateTime(new Date().toISOString()))}</p></body></html>`;
}

/** In (hoặc lưu PDF) bằng khung ẩn, không bị trình duyệt chặn cửa sổ bật lên. */
export function printHtml(html: string): void {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  const doc = f.contentDocument;
  if (!doc) { f.remove(); return; }
  doc.open(); doc.write(html); doc.close();
  window.setTimeout(() => { f.contentWindow?.focus(); f.contentWindow?.print(); window.setTimeout(() => f.remove(), 4000); }, 250);
}
