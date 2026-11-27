import type { MemberProgress } from '../types/board';

export const PROGRESS_LABEL: Record<MemberProgress, string> = {
  not_submitted: 'Chưa nộp',
  in_progress: 'Đang làm',
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  featured: 'Tiêu biểu',
  needs_edit: 'Cần sửa',
};

/** Lớp màu Tailwind cho nhãn trạng thái (nền nhạt + chữ đậm, tương phản ≥ 4.5:1). */
export const PROGRESS_STYLE: Record<MemberProgress, string> = {
  not_submitted: 'bg-slate-100 text-slate-700 ring-slate-200',
  in_progress: 'bg-sky-100 text-sky-800 ring-sky-200',
  pending: 'bg-amber-100 text-amber-900 ring-amber-200',
  approved: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  featured: 'bg-yellow-100 text-yellow-900 ring-yellow-300',
  needs_edit: 'bg-rose-100 text-rose-800 ring-rose-200',
};

const pad = (n: number): string => String(n).padStart(2, '0');

/** Dấu thời gian đầy đủ cho hồ sơ nộp: giờ:phút:giây ngày/tháng/năm. */
export function formatFull(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())} · ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

export function formatRelative(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'Vừa xong';
  if (min < 60) return `${min} phút trước`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.round(h / 24)} ngày trước`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1]?.[0] ?? '?').toUpperCase();
}
