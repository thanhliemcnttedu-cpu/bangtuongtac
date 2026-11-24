import { AlertTriangle, Check } from 'lucide-react';
import type { SubmissionCard } from '../types/board';
import { formatDateTime } from '../lib/lessons';

interface Props {
  cards: SubmissionCard[];
  /** Cách gọi người dạy: "cô" (học sinh) hoặc "giảng viên". */
  teacher: string;
  /** Mở hộp "Sửa bài đã nộp". */
  onEdit?: () => void;
  /** Tổ công tác: nói "Đã ghi nhận" thay cho "Đã được duyệt" (nộp báo cáo không cần duyệt). */
  team?: boolean;
}

/** Tình trạng một bài: các bước đã qua. Bước hiện tại được nhấn mạnh; bài cần sửa hiện lời nhắc rõ ràng. */
function stepsOf(c: SubmissionCard, teacher: string, team: boolean): { label: string; reached: boolean }[] {
  const approved = c.status === 'approved' || c.status === 'featured';
  // "Đã xem" chỉ bật khi giáo viên thật sự có phản hồi (nhận xét, sao, điểm hoặc chọn tiêu biểu); được duyệt tự động thì chưa tính.
  const feedback = !!c.teacherNote || c.teacherStars !== undefined || c.grade !== undefined || c.status === 'featured';
  const scored = c.status === 'featured' || c.teacherStars !== undefined || c.grade !== undefined;
  return [
    { label: 'Đã nộp', reached: true },
    { label: approved ? (team ? 'Đã ghi nhận' : 'Đã được duyệt') : c.status === 'needs_edit' ? 'Cần sửa' : `Chờ ${teacher} duyệt`, reached: approved },
    { label: `${teacher[0].toUpperCase()}${teacher.slice(1)} đã xem`, reached: feedback },
    { label: 'Có sao / điểm', reached: scored },
  ];
}

/** "Bài của tôi": học sinh thấy ngay bài mình đã nộp tới bước nào, không phải đi tìm giữa bài của cả lớp. */
export function MyWorkStepper({ cards, teacher, onEdit, team = false }: Props) {
  if (cards.length === 0) return null;
  return (
    <section aria-label="Bài của tôi" className="rounded-3xl border-[1.5px] border-brand-200 bg-white/90 p-3 shadow-soft sm:p-4">
      <h2 className="mb-2 text-base font-extrabold">Bài của tôi ({cards.length})</h2>
      <ul className="space-y-3">
        {cards.slice(0, 6).map((c) => {
          const steps = stepsOf(c, teacher, team);
          const current = steps.filter((s) => s.reached).length - 1;
          const needEdit = c.status === 'needs_edit';
          return (
            <li key={c.id} className="rounded-2xl bg-brand-50/60 p-3">
              <p className="flex flex-wrap items-baseline justify-between gap-2"><b className="text-sm">{c.title}</b><time dateTime={c.submittedAt} className="text-xs text-ink-2">{formatDateTime(c.submittedAt)}</time></p>
              <ol className="mt-2 grid grid-cols-4 gap-1" aria-label="Các bước của bài">
                {steps.map((s, i) => (
                  <li key={s.label} aria-current={i === current ? 'step' : undefined} className="flex flex-col items-center gap-1 text-center">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold text-white ${needEdit && i === 1 ? 'bg-amber-500' : s.reached ? 'bg-[color:var(--st-done)]' : 'bg-slate-300'} ${i === current && !needEdit ? 'ring-4 ring-emerald-200' : ''}`}>
                      {needEdit && i === 1 ? <AlertTriangle className="h-4 w-4" aria-hidden /> : s.reached ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : i + 1}
                    </span>
                    <span className={`text-[11px] leading-tight ${s.reached || (needEdit && i === 1) ? 'font-extrabold text-ink' : 'text-ink-3'}`}>{s.label}</span>
                  </li>
                ))}
              </ol>
              {needEdit && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-900">{c.teacherNote ? `${c.teacherNote} ` : ''}Bấm “Sửa bài đã nộp” để nộp lại.{onEdit && <button type="button" onClick={onEdit} className="btn-ghost btn-sm ml-2">Sửa bài đã nộp</button>}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
