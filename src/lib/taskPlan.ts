import { BookOpen, ClipboardCheck, ClipboardList, Ellipsis, Eye, FileText, GraduationCap, Lightbulb, Presentation, School, UserRound, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Attachment, ItemStatus, TaskProgress, TaskSubItem } from '../types/board';

/** Nhóm công việc mặc định (mã lưu trong cột category). Mỗi nhóm có màu riêng để nhận biết nhanh. */
export interface TaskCategory { id: string; label: string; Icon: LucideIcon; text: string; soft: string; bar: string }
export const CATEGORIES: TaskCategory[] = [
  { id: 'giang_day', label: 'Giảng dạy', Icon: Presentation, text: '#1d4ed8', soft: '#dbeafe', bar: '#3b82f6' },
  { id: 'chuyen_mon', label: 'Chuyên môn', Icon: BookOpen, text: '#0f766e', soft: '#ccfbf1', bar: '#14b8a6' },
  { id: 'bao_cao', label: 'Báo cáo', Icon: FileText, text: '#b45309', soft: '#fef3c7', bar: '#f59e0b' },
  { id: 'ke_hoach', label: 'Kế hoạch', Icon: ClipboardList, text: '#6d28d9', soft: '#ede9fe', bar: '#8b5cf6' },
  { id: 'tap_huan', label: 'Tập huấn', Icon: GraduationCap, text: '#0e7490', soft: '#cffafe', bar: '#06b6d4' },
  { id: 'du_gio', label: 'Dự giờ', Icon: Eye, text: '#be185d', soft: '#fce7f3', bar: '#ec4899' },
  { id: 'kiem_tra', label: 'Kiểm tra', Icon: ClipboardCheck, text: '#b91c1c', soft: '#fee2e2', bar: '#ef4444' },
  { id: 'hoi_hop', label: 'Hội họp', Icon: Users, text: '#a16207', soft: '#fef9c3', bar: '#eab308' },
  { id: 'sang_kien', label: 'Sáng kiến kinh nghiệm', Icon: Lightbulb, text: '#15803d', soft: '#dcfce7', bar: '#22c55e' },
  { id: 'nha_truong', label: 'Công tác nhà trường', Icon: School, text: '#4338ca', soft: '#e0e7ff', bar: '#6366f1' },
  { id: 'ca_nhan', label: 'Công việc cá nhân', Icon: UserRound, text: '#475569', soft: '#e2e8f0', bar: '#64748b' },
  { id: 'khac', label: 'Khác', Icon: Ellipsis, text: '#52525b', soft: '#f4f4f5', bar: '#a1a1aa' },
];
export const categoryOf = (id?: string | null): TaskCategory | undefined => CATEGORIES.find((c) => c.id === id);

/** Trạng thái việc riêng / việc tổng: nhãn và màu chip. */
export const PROGRESS_META: Record<TaskProgress, { label: string; chip: string }> = {
  todo: { label: 'Chưa thực hiện', chip: 'bg-slate-100 text-slate-800 ring-slate-300' },
  doing: { label: 'Đang thực hiện', chip: 'bg-sky-100 text-sky-900 ring-sky-300' },
  waiting: { label: 'Chờ bổ sung', chip: 'bg-amber-100 text-amber-900 ring-amber-300' },
  postponed: { label: 'Tạm hoãn', chip: 'bg-violet-100 text-violet-900 ring-violet-300' },
  cancelled: { label: 'Đã hủy', chip: 'bg-zinc-100 text-zinc-600 ring-zinc-300' },
  done: { label: 'Đã hoàn thành', chip: 'bg-emerald-100 text-emerald-900 ring-emerald-300' },
};
export const PROGRESS_ORDER: TaskProgress[] = ['todo', 'doing', 'waiting', 'postponed', 'cancelled', 'done'];

/** Trạng thái đầu việc thành phần. Hoãn và Đã hủy không bao giờ được tính là Hoàn thành. */
export const ITEM_STATUS: Record<ItemStatus, { label: string; chip: string }> = {
  todo: { label: 'Chưa thực hiện', chip: 'bg-slate-100 text-slate-800 ring-slate-300' },
  scheduled: { label: 'Đã lên lịch', chip: 'bg-indigo-100 text-indigo-900 ring-indigo-300' },
  doing: { label: 'Đang thực hiện', chip: 'bg-sky-100 text-sky-900 ring-sky-300' },
  waiting: { label: 'Chờ bổ sung', chip: 'bg-amber-100 text-amber-900 ring-amber-300' },
  done: { label: 'Hoàn thành', chip: 'bg-emerald-100 text-emerald-900 ring-emerald-300' },
  postponed: { label: 'Hoãn', chip: 'bg-violet-100 text-violet-900 ring-violet-300' },
  cancelled: { label: 'Đã hủy', chip: 'bg-zinc-100 text-zinc-600 ring-zinc-300' },
};
export const ITEM_STATUS_ORDER: ItemStatus[] = ['todo', 'scheduled', 'doing', 'waiting', 'done', 'postponed', 'cancelled'];

/** Phân loại minh chứng của đầu việc. */
export const EVIDENCE_GROUPS = ['Tài liệu trước thực hiện', 'Biên bản', 'Minh chứng thực hiện', 'Kết quả sau thực hiện', 'Tài liệu bổ sung'];

const OPEN: ItemStatus[] = ['todo', 'scheduled', 'doing', 'waiting'];
const ms = (iso: string | null | undefined): number | null => { const t = iso ? Date.parse(iso) : NaN; return Number.isNaN(t) ? null : t; };

export interface ItemStats {
  /** Số đầu việc còn hiệu lực (không tính đã xóa). */
  all: number;
  /** Mẫu số của tiến độ: không tính đầu việc đã hủy. */
  valid: number;
  done: number; doing: number; todo: number; waiting: number; postponed: number; cancelled: number; overdue: number;
  /** Tiến độ = hoàn thành / (tổng − đã hủy), làm tròn; 0 khi chưa có đầu việc hợp lệ. */
  pct: number;
}

/** Đầu việc quá hạn: còn dang dở mà ngày dự kiến đã qua. */
export const itemOverdue = (it: TaskSubItem, now: number): boolean => { const p = ms(it.plannedAt); return !it.deletedAt && OPEN.includes(it.status) && p !== null && p < now; };

/** Thống kê tiến độ của công việc tổng từ các đầu việc. Mặc định tính theo số lượng đầu việc. */
export function itemStats(items: TaskSubItem[], now: number): ItemStats {
  const live = items.filter((i) => !i.deletedAt);
  const c = (s: ItemStatus): number => live.filter((i) => i.status === s).length;
  const cancelled = c('cancelled');
  const valid = live.length - cancelled;
  const done = c('done');
  return {
    all: live.length, valid, done, doing: c('doing'), todo: c('todo') + c('scheduled'), waiting: c('waiting'), postponed: c('postponed'), cancelled,
    overdue: live.filter((i) => itemOverdue(i, now)).length,
    pct: valid > 0 ? Math.round((done / valid) * 100) : 0,
  };
}

/** Các trường được theo dõi để ghi nhật ký. */
const WATCHED = ['title', 'subject', 'plannedAt', 'status', 'result', 'note', 'startedAt', 'doneAt'] as const;
export const FIELD_LABEL: Record<string, string> = {
  title: 'Tên đầu việc', subject: 'Đối tượng', plannedAt: 'Ngày dự kiến', status: 'Trạng thái', result: 'Kết quả', note: 'Ghi chú', startedAt: 'Bắt đầu thực tế', doneAt: 'Hoàn thành thực tế', attachments: 'Minh chứng',
};

const attKey = (a: Attachment): string => `${a.url ?? ''}|${a.name}`;

/** So hai phiên bản đầu việc: trả về phần trước / sau của các trường đã đổi (để ghi nhật ký) và danh sách trường đổi. */
export function diffItem(before: TaskSubItem | null, after: TaskSubItem): { before: Record<string, unknown>; after: Record<string, unknown>; changed: string[] } {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  const changed: string[] = [];
  for (const k of WATCHED) {
    if (!before || before[k] !== after[k]) { changed.push(k); if (before) b[k] = before[k]; a[k] = after[k]; }
  }
  const bk = (before?.attachments ?? []).map(attKey).sort().join(';');
  const ak = after.attachments.map(attKey).sort().join(';');
  if (before && bk !== ak) { changed.push('attachments'); b.attachments = (before.attachments ?? []).map((x) => x.label || x.name); a.attachments = after.attachments.map((x) => x.label || x.name); }
  return { before: b, after: a, changed };
}

/** Mã hành động ghi nhật ký, suy ra từ những gì đã đổi. */
export function actionOf(before: TaskSubItem | null, after: TaskSubItem, changed: string[]): string {
  if (!before) return 'tao_dau_viec';
  if (changed.includes('status')) {
    if (after.status === 'done') return 'hoan_thanh';
    if (before.status === 'done') return 'mo_lai';
    if (after.status === 'postponed') return 'hoan';
    if (after.status === 'cancelled') return 'huy';
    return 'doi_trang_thai';
  }
  if (changed.includes('plannedAt')) return 'doi_lich';
  if (changed.includes('result')) return 'cap_nhat_ket_qua';
  if (changed.includes('attachments')) return 'dinh_kem';
  return 'cap_nhat';
}

export const ACTION_LABEL: Record<string, string> = {
  tao_dau_viec: 'Tạo đầu việc', hoan_thanh: 'Hoàn thành', mo_lai: 'Mở lại', hoan: 'Hoãn', huy: 'Hủy', doi_trang_thai: 'Đổi trạng thái', doi_lich: 'Đổi lịch',
  cap_nhat_ket_qua: 'Cập nhật kết quả', dinh_kem: 'Đính kèm minh chứng', cap_nhat: 'Cập nhật', xoa: 'Xóa đầu việc', khoi_phuc: 'Khôi phục đầu việc', ghi_chu: 'Ghi chú', tao_cong_viec: 'Tạo công việc', doi_trang_thai_tong: 'Đổi trạng thái công việc',
};

const pad = (n: number): string => String(n).padStart(2, '0');
export const fmtDay = (iso: string | null | undefined): string => { const t = ms(iso); if (t === null) return ''; const d = new Date(t); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
export const fmtTime = (iso: string | null | undefined): string => { const t = ms(iso); if (t === null) return ''; const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

const nameOf = (i: TaskSubItem): string => (i.subject.trim() ? i.subject.trim() : i.title.trim());

/**
 * Báo cáo tiến độ tự tổng hợp từ dữ liệu đã lưu (không bịa số liệu). Có thể giới hạn khoảng thời gian cho phần "đã thực hiện".
 */
export function buildPlanReport(opts: { title: string; items: TaskSubItem[]; from?: number | null; to?: number | null; now: number }): string {
  const { title, items, now } = opts;
  const live = items.filter((i) => !i.deletedAt);
  const st = itemStats(live, now);
  const inRange = (i: TaskSubItem): boolean => { const d = ms(i.doneAt); return d !== null && (opts.from == null || d >= opts.from) && (opts.to == null || d <= opts.to); };
  const doneAll = live.filter((i) => i.status === 'done');
  const doneShown = (opts.from != null || opts.to != null ? doneAll.filter(inRange) : doneAll).sort((a, b) => (ms(a.doneAt) ?? 0) - (ms(b.doneAt) ?? 0));
  const rest = live.filter((i) => i.status !== 'done' && i.status !== 'cancelled').sort((a, b) => (ms(a.plannedAt) ?? Infinity) - (ms(b.plannedAt) ?? Infinity));
  const range = opts.from != null || opts.to != null ? ` (từ ${opts.from != null ? fmtDay(new Date(opts.from).toISOString()) : '…'} đến ${opts.to != null ? fmtDay(new Date(opts.to).toISOString()) : '…'})` : '';
  const L: string[] = [];
  L.push(`BÁO CÁO TIẾN ĐỘ: ${title.toUpperCase()}${range}`, '');
  L.push('1. Kết quả thực hiện');
  if (st.all === 0) {
    L.push('Công việc chưa có đầu việc nào.');
  } else {
    let s = `Trong tổng số ${st.valid} đầu việc thuộc kế hoạch, đã hoàn thành ${st.done}, đạt tỷ lệ ${st.pct}%. Còn ${st.valid - st.done} đầu việc chưa hoàn thành`;
    const extra: string[] = [];
    if (st.postponed > 0) extra.push(`${st.postponed} đầu việc hoãn`);
    if (st.overdue > 0) extra.push(`${st.overdue} đầu việc quá hạn`);
    if (st.cancelled > 0) extra.push(`${st.cancelled} đầu việc đã hủy không tính vào tỷ lệ`);
    s += extra.length > 0 ? ` (trong đó có ${extra.join(', ')}).` : '.';
    L.push(s);
  }
  L.push('', '2. Danh sách đã thực hiện');
  if (doneShown.length === 0) L.push(opts.from != null || opts.to != null ? '- Chưa có đầu việc hoàn thành trong khoảng thời gian này.' : '- Chưa có đầu việc nào hoàn thành.');
  for (const i of doneShown) {
    L.push(`- ${nameOf(i)}: Đã hoàn thành${i.doneAt ? ` ngày ${fmtDay(i.doneAt)}` : ''}.${i.result.trim() ? ` Kết quả: ${i.result.trim().replace(/\s*\n\s*/g, ' ')}` : ''}${i.attachments.length > 0 ? ` (${i.attachments.length} minh chứng)` : ''}`);
  }
  L.push('', '3. Nội dung còn lại');
  if (rest.length === 0) L.push('- Không còn đầu việc nào chưa hoàn thành.');
  for (const i of rest) {
    L.push(`- ${nameOf(i)}: ${ITEM_STATUS[i.status].label}${i.plannedAt ? `, dự kiến ${fmtDay(i.plannedAt)}` : ''}${itemOverdue(i, now) ? ' (quá hạn)' : ''}.`);
  }
  return L.join('\n');
}
