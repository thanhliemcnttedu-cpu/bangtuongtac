import type { RepeatRule, TaskItem } from '../types/board';
import { resetChecklist } from './checklist';
import type { TaskInput } from './boardApi';

/** Cộng một kỳ (7 ngày hoặc 1 tháng) vào mốc giờ. Cuối tháng thì lùi về ngày cuối của tháng sau (31/1 → 28/2). */
export function addPeriod(iso: string, rule: Exclude<RepeatRule, 'none'>): string {
  const d = new Date(iso);
  if (rule === 'daily') { d.setDate(d.getDate() + 1); return d.toISOString(); }
  if (rule === 'weekdays') { do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6); return d.toISOString(); }
  if (rule === 'weekly') { d.setDate(d.getDate() + 7); return d.toISOString(); }
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + (rule === 'monthly' ? 1 : rule === 'quarterly' ? 3 : rule === 'semester' ? 6 : 12));
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return d.toISOString();
}

/** Việc → dữ liệu nhập (để lưu lại kèm thay đổi). */
export function taskToInput(t: TaskItem): TaskInput {
  return {
    label: t.label, lessonId: t.lessonId ?? null, kind: t.kind ?? 'requirement', instructions: t.instructions ?? '',
    assignedAt: t.assignedAt ?? null, dueAt: t.dueAt ?? null, allowLate: !!t.allowLate, targetUnits: t.targetUnits ?? [],
    attachments: t.attachments ?? [], needsEvidence: t.needsEvidence, ackOnly: t.ackOnly, progress: t.progress, priority: t.priority,
    assigneeEmails: t.assigneeEmails, repeat: t.repeat, seriesId: t.seriesId,
    category: t.category, startAt: t.startAt ?? null, reportDueAt: t.reportDueAt ?? null, completedAt: t.completedAt ?? null, repeatUntil: t.repeatUntil ?? null,
  };
}

/** Kỳ kế tiếp của một việc định kỳ đã hết hạn: dời hạn một kỳ, giao ngay từ hạn cũ, chưa ai nộp. */
export function nextInstance(t: TaskItem): TaskInput | null {
  if (!t.repeat || t.repeat === 'none' || !t.dueAt) return null;
  const due = addPeriod(t.dueAt, t.repeat);
  // Hết ngày kết thúc lặp thì không sinh kỳ mới.
  if (t.repeatUntil && Date.parse(due) > Date.parse(t.repeatUntil)) return null;
  // Các mốc khác (ngày bắt đầu, hạn báo cáo) dời cùng một khoảng với hạn hoàn thành; ngày hoàn thành thực tế của kỳ trước không mang sang.
  const shift = Date.parse(due) - Date.parse(t.dueAt);
  const move = (iso: string | null | undefined): string | null => (iso && !Number.isNaN(Date.parse(iso)) ? new Date(Date.parse(iso) + shift).toISOString() : null);
  return { ...taskToInput(t), assignedAt: t.dueAt, dueAt: due, startAt: move(t.startAt), reportDueAt: move(t.reportDueAt), completedAt: null, progress: 'todo', seriesId: t.seriesId ?? t.id, instructions: resetChecklist(t.instructions ?? '') };
}
