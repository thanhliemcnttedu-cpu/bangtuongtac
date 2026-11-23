import { useMemo, useState } from 'react';
import { ListChecks } from 'lucide-react';
import type { BoardData, RosterMember } from '../types/board';
import { normalize, parseRosterText } from '../lib/boardLogic';
import { ModalShell } from './ModalShell';

interface Props {
  board: BoardData;
  onApply: (roster: RosterMember[]) => void;
  onClose: () => void;
}

/** Dán danh sách lớp / học viên: mỗi dòng 1 người, có thể kèm Lớp hoặc Đơn vị sau dấu phẩy, Tab hoặc dấu |. */
export function RosterImportModal({ board, onApply, onClose }: Props) {
  const [text, setText] = useState(() => board.roster.map((m) => (m.unit ? `${m.name}, ${m.unit}` : m.name)).join('\n'));
  const parsed = useMemo(() => parseRosterText(text, `${board.id}-ds`), [text, board.id]);
  const matched = useMemo(() => {
    const names = new Set(board.cards.map((c) => normalize(c.authorName)));
    return parsed.filter((m) => names.has(normalize(m.name))).length;
  }, [parsed, board.cards]);

  return (
    <ModalShell title="Danh sách sĩ số / học viên" onClose={onClose} maxWidth="max-w-xl">
      <p className="mb-2 text-sm text-ink-2">
        Dán từ Excel hoặc Word, mỗi dòng 1 người. Thêm {board.mode === 'classroom' ? 'tổ/lớp' : 'trường/đơn vị'} sau dấu phẩy hoặc Tab. Hệ thống tự đối chiếu với bài đã nộp (không phân biệt hoa thường, bỏ dấu).
      </p>
      <label htmlFor="roster-text" className="field-label">Danh sách</label>
      <textarea id="roster-text" value={text} onChange={(e) => setText(e.target.value)} rows={10} spellCheck={false}
        className="input min-h-[200px] py-2 font-mono text-[13px]" placeholder={'Nguyễn Văn A, Tổ 1\nTrần Thị B, Tổ 2'} />
      <p className="mt-2 text-sm" aria-live="polite">
        Đọc được <b>{parsed.length}</b> người · khớp với bài đã nộp: <b className="text-emerald-700">{matched}</b> · chưa nộp: <b className="text-rose-700">{parsed.length - matched}</b>
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-ghost">Hủy</button>
        <button type="button" disabled={parsed.length === 0} onClick={() => onApply(parsed)} className="btn-primary">
          <ListChecks className="h-4 w-4" aria-hidden /> Áp dụng danh sách
        </button>
      </div>
    </ModalShell>
  );
}
