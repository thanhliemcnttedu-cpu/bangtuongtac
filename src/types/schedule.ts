import type { Attachment } from './board';

/** Thời khóa biểu của một học kỳ / năm học. */
export interface Timetable {
  id: string;
  boardId: string;
  name: string;
  schoolYear: string;
  term: string;
  active: boolean;
  createdAt: string;
}

/** Một tiết học (mẫu lặp hằng tuần). weekday: 1 = Thứ 2 ... 7 = Chủ nhật. */
export interface TimetableEntry {
  id: string;
  timetableId: string;
  boardId: string;
  weekday: number;
  period: number | null;
  startTime: string;
  endTime: string;
  subject: string;
  className: string;
  room: string;
  location: string;
  topic: string;
  note: string;
  attachments: Attachment[];
}

/** Ghi chú sau tiết dạy của một ngày cụ thể (day = YYYY-MM-DD). */
export interface TimetableNote { id: string; entryId: string; day: string; note: string }

export type EventKind = 'hop' | 'sinh_hoat_to' | 'du_gio' | 'kiem_tra' | 'tap_huan' | 'boi_duong' | 'hoi_thi' | 'nop_bao_cao' | 'nha_truong' | 'ca_nhan' | 'khac';

/** Sự kiện của lịch công tác. */
export interface CalEvent {
  id: string;
  boardId: string;
  title: string;
  kind: EventKind;
  startsAt: string;
  endsAt: string | null;
  location: string;
  description: string;
  attachments: Attachment[];
  taskId: string | null;
}
