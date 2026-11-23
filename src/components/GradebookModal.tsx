import { useState } from 'react';
import { Check, Download } from 'lucide-react';
import type { BoardData, BoardRow } from '../types/board';
import { StatusBadge } from './StatusBadge';
import { StarsInput } from './StarRating';
import { parseGrade } from '../lib/grade';
import { formatStars, ratingAvg } from '../lib/peer';
import { ModalShell } from './ModalShell';

interface Props {
  board: BoardData;
  /** Chỉ các dòng đã có bài, đúng thứ tự sắp xếp của bảng. */
  rows: (BoardRow & { card: NonNullable<BoardRow['card']> })[];
  onSetGrade: (cardId: string, grade: number | null, note: string) => Promise<void>;
  onSetStars: (cardId: string, stars: number | null) => Promise<void>;
  onExport: () => void;
  onClose: () => void;
}

function GradeRow({ row, onSetGrade, onSetStars }: { row: Props['rows'][number]; onSetGrade: Props['onSetGrade']; onSetStars: Props['onSetStars'] }) {
  const { card, member } = row;
  const [grade, setGrade] = useState(card.grade !== undefined ? String(card.grade).replace('.', ',') : '');
  const [note, setNote] = useState(card.teacherNote ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const parsed = parseGrade(grade);

  // Nhận giá trị hiện tại từ chính ô vừa rời (không phụ thuộc state cũ), nên luôn lưu đúng điều vừa gõ.
  const commit = async (gradeText: string, noteText: string): Promise<void> => {
    const g = parseGrade(gradeText);
    if (!g.ok) { setState('error'); setMessage('Điểm từ 0 đến 10.'); return; }
    if (g.value === (card.grade ?? null) && noteText.trim() === (card.teacherNote ?? '')) return;
    setState('saving');
    try { await onSetGrade(card.id, g.value, noteText.trim()); setState('saved'); setMessage(''); } catch (e) { setState('error'); setMessage(e instanceof Error ? e.message : 'Không lưu được.'); }
  };

  return (
    <tr className="align-top">
      <td className="px-3 py-2">
        <p className="font-bold">{member.name}</p>
        <p className="text-xs text-ink-2">{member.unit || '—'}</p>
      </td>
      <td className="px-3 py-2">
        <p className="max-w-[220px] truncate text-sm">{card.title}</p>
        <StatusBadge progress={card.status} />
      </td>
      <td className="px-3 py-2">
        <input inputMode="decimal" aria-label={`Điểm của ${member.name}`} aria-invalid={!parsed.ok} value={grade}
          onChange={(e) => { setGrade(e.target.value); setState('idle'); }} onBlur={(e) => void commit(e.currentTarget.value, note)}
          className={`input !min-h-[40px] w-20 text-center font-extrabold ${parsed.ok ? '' : '!border-rose-500'}`} placeholder="—" />
      </td>
      <td className="px-3 py-2">
        <StarsInput size={20} label={`Số sao của ${member.name}`} value={card.teacherStars ?? 0} onChange={(n) => void onSetStars(card.id, n === card.teacherStars ? null : n)} />
        <p className="text-xs text-ink-2">Các bạn: {ratingAvg(card) !== null ? `★ ${formatStars(ratingAvg(card) ?? 0)} (${card.ratingCount})` : 'chưa chấm'} · {(card.comments ?? []).length} nhận xét</p>
      </td>
      <td className="px-3 py-2">
        <input aria-label={`Nhận xét cho ${member.name}`} value={note} onChange={(e) => { setNote(e.target.value); setState('idle'); }} onBlur={(e) => void commit(grade, e.currentTarget.value)}
          className="input !min-h-[40px] min-w-[200px]" placeholder="Nhận xét (người nộp bài thấy)" maxLength={300} />
        <p className="mt-0.5 h-4 text-xs" aria-live="polite">
          {state === 'saving' && <span className="text-ink-3">Đang lưu…</span>}
          {state === 'saved' && <span className="inline-flex items-center gap-1 text-emerald-700"><Check className="h-3 w-3" aria-hidden /> Đã lưu</span>}
          {state === 'error' && <span className="font-bold text-rose-700">{message}</span>}
        </p>
      </td>
    </tr>
  );
}

/** Sổ điểm: chấm điểm thang 10 và nhận xét từng bài, tự lưu khi rời ô. Điểm chỉ giáo viên thấy; nhận xét hiện trên thẻ. */
export function GradebookModal({ board, rows, onSetGrade, onSetStars, onExport, onClose }: Props) {
  const graded = rows.filter((r) => r.card.grade !== undefined).map((r) => r.card.grade as number);
  const avg = graded.length ? graded.reduce((a, b) => a + b, 0) / graded.length : null;
  const fmt = (n: number): string => (Math.round(n * 10) / 10).toString().replace('.', ',');

  return (
    <ModalShell title="Sổ điểm" onClose={onClose} maxWidth="max-w-4xl">
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Đã chấm', `${graded.length}/${rows.length}`],
          ['Điểm trung bình', avg === null ? '—' : fmt(avg)],
          ['Cao nhất', graded.length ? fmt(Math.max(...graded)) : '—'],
          ['Thấp nhất', graded.length ? fmt(Math.min(...graded)) : '—'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-brand-50 p-3 text-center">
            <p className="text-xl font-extrabold text-brand-800">{value}</p>
            <p className="text-xs text-ink-2">{label}</p>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-ink-2">Chưa có bài nào để chấm trong “{board.title}”.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-brand-100">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-brand-50 text-xs uppercase tracking-wide text-ink-2">
              <tr><th className="px-3 py-2">Họ tên</th><th className="px-3 py-2">Bài</th><th className="px-3 py-2">Điểm /10</th><th className="px-3 py-2">Sao</th><th className="px-3 py-2">Lời phê</th></tr>
            </thead>
            <tbody className="divide-y divide-brand-100">
              {rows.map((r) => <GradeRow key={r.card.id} row={r} onSetGrade={onSetGrade} onSetStars={onSetStars} />)}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex justify-between gap-2">
        <button type="button" onClick={onExport} className="btn-ghost"><Download className="h-4 w-4" aria-hidden /> Xuất báo cáo CSV</button>
        <button type="button" onClick={onClose} className="btn-primary">Xong</button>
      </div>
    </ModalShell>
  );
}
