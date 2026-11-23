import type { BoardData, BoardRow } from '../types/board';
import { PROGRESS_LABEL, formatDateTime } from './format';

/** Bảng báo cáo đầy đủ: một dòng mỗi thành viên, có điểm và nhận xét. Dùng chung cho CSV, bảng danh sách và in. */
export function buildReport(board: BoardData, rows: BoardRow[]): string[][] {
  const unitLabel = board.mode === 'classroom' ? 'Tổ / Lớp' : 'Trường / Đơn vị';
  const header = ['STT', 'Họ tên', unitLabel, 'Trạng thái', 'Tên bài', 'Nhiệm vụ', 'Số đính kèm', 'Thời gian nộp', 'Điểm', 'Nhận xét'];
  const body = rows.map((r, i) => [
    String(i + 1),
    r.member.name,
    r.member.unit,
    PROGRESS_LABEL[r.progress],
    r.card?.title ?? '',
    board.tasks.find((t) => t.id === r.card?.taskId)?.label ?? '',
    r.card ? String(r.card.attachments.length) : '',
    r.card ? formatDateTime(r.card.submittedAt) : '',
    r.card?.grade !== undefined ? String(r.card.grade).replace('.', ',') : '',
    r.card?.teacherNote ?? '',
  ]);
  return [header, ...body];
}

export function reportFilename(board: BoardData, suffix = 'bao-cao'): string {
  const slug = board.title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `${suffix}-${slug || 'bang'}.csv`;
}
