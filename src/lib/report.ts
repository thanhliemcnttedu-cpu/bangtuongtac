import type { BoardData, BoardRow } from '../types/board';
import { PROGRESS_LABEL, formatDateTime } from './format';
import { taskProgress } from './lessons';

/** Bảng báo cáo đầy đủ: một dòng mỗi thành viên, có điểm và nhận xét. Dùng chung cho CSV, bảng danh sách và in. */
export function buildReport(board: BoardData, rows: BoardRow[]): string[][] {
  const unitLabel = board.mode === 'classroom' ? (board.settings.scope === 'grade' ? 'Lớp / Tổ' : 'Tổ / Lớp') : 'Trường / Đơn vị';
  const header = ['STT', 'Họ tên', unitLabel, 'Trạng thái', 'Tên bài', 'Nhiệm vụ', 'Số đính kèm', 'Thời gian nộp', 'Nộp lại lúc', 'Số lần nộp lại', 'Nộp muộn', 'Điểm', 'Nhận xét'];
  const body = rows.map((r, i) => [
    String(i + 1),
    r.member.name,
    r.member.unit,
    PROGRESS_LABEL[r.progress],
    r.card?.title ?? '',
    board.tasks.find((t) => t.id === r.card?.taskId)?.label ?? '',
    r.card ? String(r.card.attachments.length) : '',
    r.card ? formatDateTime(r.card.submittedAt) : '',
    r.card?.resubmittedAt ? formatDateTime(r.card.resubmittedAt) : '',
    r.card?.revisions ? String(r.card.revisions) : '',
    r.card?.late ? 'Có' : '',
    r.card?.grade !== undefined ? String(r.card.grade).replace('.', ',') : '',
    r.card?.teacherNote ?? '',
  ]);
  // Cuối báo cáo: mỗi nhiệm vụ đã có bao nhiêu thành viên trong danh sách nộp, ai chưa nộp.
  const summary: string[][] = board.roster.length === 0 ? [] : [[], ['Tiến độ theo nhiệm vụ'], ...board.tasks.map((t) => {
    const p = taskProgress(board, t);
    return [t.label, `${p.done.length}/${p.total} đã nộp`, p.missing.length > 0 ? `Chưa nộp: ${p.missing.map((m) => m.name).join(', ')}` : 'Đủ cả', t.dueAt ? `Hạn ${formatDateTime(t.dueAt)}` : ''];
  })];
  return [header, ...body, ...summary];
}

export function reportFilename(board: BoardData, suffix = 'bao-cao'): string {
  const slug = board.title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `${suffix}-${slug || 'bang'}.csv`;
}
