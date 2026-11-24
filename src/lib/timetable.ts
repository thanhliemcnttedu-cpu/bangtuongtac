import type { Attachment } from '../types/board';
import type { CalEvent, EventKind, TimetableEntry } from '../types/schedule';
import { buildXlsx } from './xlsxWrite';

export const WEEKDAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
export const HEADERS = ['Thứ', 'Tiết', 'Giờ bắt đầu', 'Giờ kết thúc', 'Môn học', 'Lớp', 'Phòng học', 'Địa điểm', 'Nội dung bài dạy', 'Ghi chú'];

/** Nhóm sự kiện của lịch công tác: nhãn, màu, và nhóm công việc tương ứng khi chuyển thành việc. */
export const EVENT_KINDS: { id: EventKind; label: string; text: string; soft: string; bar: string; category: string }[] = [
  { id: 'hop', label: 'Họp', text: '#a16207', soft: '#fef9c3', bar: '#eab308', category: 'hoi_hop' },
  { id: 'sinh_hoat_to', label: 'Sinh hoạt tổ', text: '#0f766e', soft: '#ccfbf1', bar: '#14b8a6', category: 'chuyen_mon' },
  { id: 'du_gio', label: 'Dự giờ', text: '#be185d', soft: '#fce7f3', bar: '#ec4899', category: 'du_gio' },
  { id: 'kiem_tra', label: 'Kiểm tra', text: '#b91c1c', soft: '#fee2e2', bar: '#ef4444', category: 'kiem_tra' },
  { id: 'tap_huan', label: 'Tập huấn', text: '#0e7490', soft: '#cffafe', bar: '#06b6d4', category: 'tap_huan' },
  { id: 'boi_duong', label: 'Bồi dưỡng', text: '#4338ca', soft: '#e0e7ff', bar: '#6366f1', category: 'tap_huan' },
  { id: 'hoi_thi', label: 'Hội thi', text: '#6d28d9', soft: '#ede9fe', bar: '#8b5cf6', category: 'chuyen_mon' },
  { id: 'nop_bao_cao', label: 'Nộp báo cáo', text: '#b45309', soft: '#fef3c7', bar: '#f59e0b', category: 'bao_cao' },
  { id: 'nha_truong', label: 'Hoạt động nhà trường', text: '#15803d', soft: '#dcfce7', bar: '#22c55e', category: 'nha_truong' },
  { id: 'ca_nhan', label: 'Lịch cá nhân', text: '#475569', soft: '#e2e8f0', bar: '#64748b', category: 'ca_nhan' },
  { id: 'khac', label: 'Khác', text: '#52525b', soft: '#f4f4f5', bar: '#a1a1aa', category: 'khac' },
];
export const kindOf = (id: string): (typeof EVENT_KINDS)[number] => EVENT_KINDS.find((k) => k.id === id) ?? EVENT_KINDS[EVENT_KINDS.length - 1];

/** Dòng tiết học đang soạn (trước khi lưu): thứ có thể chưa hợp lệ để người dùng sửa ngay trên bản xem trước. */
export interface DraftRow {
  weekday: number | null;
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
  /** Số dòng trong tệp Excel (để báo lỗi đúng chỗ); 0 = dòng thêm tay. */
  src: number;
  /** Giá trị gốc của ô "Thứ" khi không hiểu được. */
  rawWeekday?: string;
}

export interface Issue { index: number; level: 'error' | 'warn'; message: string }

const pad = (n: number): string => String(n).padStart(2, '0');
const text = (v: unknown): string => (v === null || v === undefined ? '' : v instanceof Date ? '' : String(v).trim());
const strip = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();

/** "Thứ Hai", "Thứ 2", "2", "T2", "Hai", "CN", "Chủ nhật", 8 (kiểu Việt Nam: 2–7 là thứ 2–7, 8 là Chủ nhật) → 1..7 (1 = Thứ 2). */
export function normalizeWeekday(v: unknown): number | null {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 2 && v <= 8 ? v - 1 : null;
  const s = strip(text(v)).replace(/^thu\s*/, '').replace(/^t\s*/, '');
  if (!s) return null;
  if (/^\d+$/.test(s)) { const n = Number(s); return n >= 2 && n <= 8 ? n - 1 : null; }
  const words: Record<string, number> = { hai: 1, ba: 2, tu: 3, nam: 4, sau: 5, bay: 6, cn: 7, 'chu nhat': 7, cnhat: 7 };
  return words[s] ?? null;
}

/** "7:30", "07:30", "7h30", "7g30", 0.3125 (Excel), Date (ô giờ của Excel) → "07:30"; không hiểu thì null. */
export function normalizeTime(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) { if (Number.isNaN(v.getTime())) return null; return `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}`; }
  if (typeof v === 'number') {
    if (v < 0 || v >= 1.0000001) { const frac = v - Math.floor(v); return v >= 1 && frac > 0 ? mins(Math.round(frac * 1440)) : null; }
    return mins(Math.round(v * 1440));
  }
  const m = /^(\d{1,2})\s*(?:[:hHgG]\s*(\d{1,2})?)?\s*(?:p|ph)?$/.exec(String(v).trim());
  if (!m) return null;
  const h = Number(m[1]); const mi = m[2] === undefined ? 0 : Number(m[2]);
  return h <= 23 && mi <= 59 ? `${pad(h)}:${pad(mi)}` : null;
}
const mins = (total: number): string | null => (total >= 0 && total < 1440 ? `${pad(Math.floor(total / 60))}:${pad(total % 60)}` : null);
const toMin = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Đọc một trang tính: tự tìm dòng tiêu đề (có cột "Thứ" và "Tiết"), rồi đọc từng dòng dữ liệu. */
export function parseSheet(rows: unknown[][]): { drafts: DraftRow[]; headerFound: boolean; skipped: number } {
  const norm = (c: unknown): string => strip(text(c));
  let h = rows.findIndex((r) => r.some((c) => norm(c) === 'thu') && r.some((c) => norm(c) === 'tiet'));
  const headerFound = h >= 0;
  if (h < 0) h = -1;
  const header = headerFound ? rows[h].map(norm) : [];
  const col = (...names: string[]): number => { const i = header.findIndex((x) => names.some((n) => x === n || x.startsWith(n))); return i; };
  const idx = headerFound
    ? { wd: col('thu'), pd: col('tiet'), st: col('gio bat dau', 'bat dau'), en: col('gio ket thuc', 'ket thuc'), sb: col('mon'), cl: col('lop'), rm: col('phong'), lc: col('dia diem'), tp: col('noi dung'), nt: col('ghi chu') }
    : { wd: 0, pd: 1, st: 2, en: 3, sb: 4, cl: 5, rm: 6, lc: 7, tp: 8, nt: 9 };
  const get = (r: unknown[], i: number): unknown => (i >= 0 ? r[i] : undefined);
  const drafts: DraftRow[] = [];
  let skipped = 0;
  rows.slice(h + 1).forEach((r, k) => {
    if (r.every((c) => c === null || c === undefined || String(c).trim() === '')) { skipped += 1; return; }
    const wdRaw = get(r, idx.wd);
    const wd = normalizeWeekday(wdRaw);
    const pRaw = get(r, idx.pd);
    const period = typeof pRaw === 'number' ? (Number.isFinite(pRaw) ? Math.round(pRaw) : null) : /^\d+$/.test(text(pRaw)) ? Number(text(pRaw)) : null;
    const stRaw = get(r, idx.st); const enRaw = get(r, idx.en);
    drafts.push({
      weekday: wd, period, startTime: normalizeTime(stRaw) ?? (text(stRaw) ? text(stRaw) : ''), endTime: normalizeTime(enRaw) ?? (text(enRaw) ? text(enRaw) : ''),
      subject: text(get(r, idx.sb)), className: text(get(r, idx.cl)), room: text(get(r, idx.rm)), location: text(get(r, idx.lc)), topic: text(get(r, idx.tp)), note: text(get(r, idx.nt)),
      attachments: [], src: h + 2 + k, rawWeekday: wd === null ? text(wdRaw) : undefined,
    });
  });
  return { drafts, headerFound, skipped };
}

const validTime = (t: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

/** Kiểm tra dữ liệu: lỗi (chặn nhập) và cảnh báo (cho phép nhập sau khi xác nhận). Phát hiện tiết trùng nhau trong cùng một thứ. */
export function validateDrafts(rows: DraftRow[]): Issue[] {
  const out: Issue[] = [];
  const label = (i: number): string => (rows[i].src > 0 ? `dòng ${rows[i].src}` : `dòng thêm tay ${i + 1}`);
  rows.forEach((r, i) => {
    if (r.weekday === null) out.push({ index: i, level: 'error', message: r.rawWeekday ? `Không hiểu ô “Thứ”: “${r.rawWeekday}”. Dùng Thứ 2 … Thứ 7, Chủ nhật.` : 'Thiếu thứ trong tuần.' });
    if (!r.subject.trim()) out.push({ index: i, level: 'error', message: 'Thiếu môn học.' });
    if (r.period === null && !r.startTime) out.push({ index: i, level: 'error', message: 'Cần có số tiết hoặc giờ bắt đầu.' });
    if (r.startTime && !validTime(r.startTime)) out.push({ index: i, level: 'error', message: `Giờ bắt đầu “${r.startTime}” không hợp lệ (ví dụ 07:30).` });
    if (r.endTime && !validTime(r.endTime)) out.push({ index: i, level: 'error', message: `Giờ kết thúc “${r.endTime}” không hợp lệ (ví dụ 08:15).` });
    if (validTime(r.startTime) && validTime(r.endTime) && toMin(r.endTime) <= toMin(r.startTime)) out.push({ index: i, level: 'error', message: 'Giờ kết thúc phải sau giờ bắt đầu.' });
    if (!r.className.trim() && r.subject.trim()) out.push({ index: i, level: 'warn', message: 'Thiếu lớp.' });
  });
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i]; const b = rows[j];
      if (a.weekday === null || a.weekday !== b.weekday) continue;
      const samePeriod = a.period !== null && a.period === b.period;
      const overlap = validTime(a.startTime) && validTime(a.endTime) && validTime(b.startTime) && validTime(b.endTime) && toMin(a.startTime) < toMin(b.endTime) && toMin(b.startTime) < toMin(a.endTime);
      if (!samePeriod && !overlap) continue;
      const same = a.subject.trim() === b.subject.trim() && a.className.trim() === b.className.trim();
      const why = same ? 'Trùng hoàn toàn' : samePeriod ? 'Trùng tiết' : 'Trùng giờ';
      out.push({ index: i, level: 'warn', message: `${why} với ${label(j)}.` });
      out.push({ index: j, level: 'warn', message: `${why} với ${label(i)}.` });
    }
  }
  return out;
}

export const draftToEntry = (d: DraftRow): Omit<TimetableEntry, 'id' | 'timetableId' | 'boardId'> => ({
  weekday: d.weekday as number, period: d.period, startTime: validTime(d.startTime) ? d.startTime : '', endTime: validTime(d.endTime) ? d.endTime : '', subject: d.subject.trim(), className: d.className.trim(),
  room: d.room.trim(), location: d.location.trim(), topic: d.topic.trim(), note: d.note.trim(), attachments: d.attachments,
});

export const emptyDraft = (): DraftRow => ({ weekday: 1, period: null, startTime: '', endTime: '', subject: '', className: '', room: '', location: '', topic: '', note: '', attachments: [], src: 0 });

/* ---------- Xem lịch ---------- */

export const dayKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** 1 = Thứ 2 ... 7 = Chủ nhật. */
export const weekdayOf = (d: Date): number => ((d.getDay() + 6) % 7) + 1;
export const startOfWeekMon = (d: Date): Date => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - (weekdayOf(x) - 1)); return x; };
const orderKey = (e: { period: number | null; startTime: string }): number => (e.startTime ? toMin(e.startTime) : (e.period ?? 99) * 1000);
export const sortEntries = <T extends { weekday: number; period: number | null; startTime: string }>(list: T[]): T[] => [...list].sort((a, b) => a.weekday - b.weekday || (a.period ?? 99) - (b.period ?? 99) || orderKey(a) - orderKey(b));
export const entriesOnDate = (entries: TimetableEntry[], d: Date): TimetableEntry[] => sortEntries(entries.filter((e) => e.weekday === weekdayOf(d)));
export const timeLabel = (e: { period: number | null; startTime: string; endTime: string }): string => `${e.period !== null ? `Tiết ${e.period}` : ''}${e.period !== null && e.startTime ? ' · ' : ''}${e.startTime ? `${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : ''}`;

/** Sự kiện rơi vào một ngày (kể cả sự kiện kéo dài nhiều ngày). */
export function eventsOnDate(events: CalEvent[], d: Date): CalEvent[] {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const end = start + 86_400_000;
  return events.filter((e) => { const s = Date.parse(e.startsAt); const f = e.endsAt ? Date.parse(e.endsAt) : s; return s < end && Math.max(f, s) >= start; }).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

/* ---------- Tệp Excel ---------- */

/** Tệp mẫu: trang "Thời khóa biểu" chỉ có hàng tiêu đề (không có dữ liệu giả), trang "Hướng dẫn" có ví dụ và quy tắc. */
export function buildTemplate(): Blob {
  return buildXlsx([
    { name: 'Thời khóa biểu', rows: [HEADERS], widths: [10, 8, 14, 14, 20, 10, 14, 18, 36, 24] },
    { name: 'Hướng dẫn', widths: [26, 70], rows: [
      ['Cột', 'Cách điền'],
      ['Thứ', 'Thứ 2, Thứ 3 … Thứ 7, Chủ nhật (hoặc chỉ số 2–7, CN). Bắt buộc.'],
      ['Tiết', 'Số tiết trong ngày (1, 2, 3…). Cần có Tiết hoặc Giờ bắt đầu.'],
      ['Giờ bắt đầu / Giờ kết thúc', 'Dạng 07:30 hoặc 7h30. Không bắt buộc nhưng nên điền để phát hiện trùng giờ.'],
      ['Môn học', 'Bắt buộc. Ví dụ: Tin học.'],
      ['Lớp', 'Ví dụ: 4A. Nên điền để xem lịch theo lớp.'],
      ['Phòng học / Địa điểm / Nội dung bài dạy / Ghi chú', 'Không bắt buộc.'],
      ['Ví dụ một dòng', 'Thứ 2 | 1 | 07:30 | 08:05 | Tin học | 4A | Phòng máy | Sân trường A | Bài 5: Soạn thảo văn bản | Mang bài thực hành'],
      ['Lưu ý', 'Chỉ điền vào trang “Thời khóa biểu”, giữ nguyên hàng tiêu đề. Phần mềm kiểm tra và cho bạn xem trước, sửa lỗi trước khi nhập.'],
    ] },
  ]);
}

/** Xuất thời khóa biểu đang xem ra Excel theo đúng cột của tệp mẫu (có thể nhập lại). */
export function buildExport(entries: TimetableEntry[]): Blob {
  const rows: (string | number | null)[][] = [HEADERS, ...sortEntries(entries).map((e) => [`Thứ ${e.weekday === 7 ? 'CN' : e.weekday + 1}`.replace('Thứ CN', 'Chủ nhật'), e.period, e.startTime, e.endTime, e.subject, e.className, e.room, e.location, e.topic, e.note])];
  return buildXlsx([{ name: 'Thời khóa biểu', rows, widths: [10, 8, 14, 14, 20, 10, 14, 18, 36, 24] }]);
}
