import type { TaskItem } from '../types/board';
import type { TaskInput } from './boardApi';

/** Cộng một kỳ (7 ngày hoặc 1 tháng) vào mốc giờ. Cuối tháng thì lùi về ngày cuối của tháng sau (31/1 → 28/2). */
export function addPeriod(iso: string, rule: 'weekly' | 'monthly'): string {
  const d = new Date(iso);
  if (rule === 'weekly') { d.setDate(d.getDate() + 7); return d.toISOString(); }
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
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
  };
}

/** Kỳ kế tiếp của một việc định kỳ đã hết hạn: dời hạn một kỳ, giao ngay từ hạn cũ, chưa ai nộp. */
export function nextInstance(t: TaskItem): TaskInput | null {
  if (!t.repeat || t.repeat === 'none' || !t.dueAt) return null;
  return { ...taskToInput(t), assignedAt: t.dueAt, dueAt: addPeriod(t.dueAt, t.repeat), progress: 'todo', seriesId: t.seriesId ?? t.id };
}
