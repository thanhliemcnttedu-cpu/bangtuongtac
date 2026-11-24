import { useMemo, useState } from 'react';
import { Eraser, ListChecks } from 'lucide-react';
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
  const team = board.settings.scope === 'team';
  const [text, setText] = useState(() => board.roster.map((m) => [m.name, m.role, m.unit, m.email].filter(Boolean).join(', ')).join('\n'));
  const parsed = useMemo(() => parseRosterText(text, `${board.id}-ds`, team), [text, board.id, team]);
  const withEmail = parsed.filter((m) => m.email).length;
  const empty = parsed.length === 0;
  // Bảng tổ đang chỉ cho người có tên trong danh sách nộp: để trống thì phải mở cho mọi người, nếu không sẽ không ai nộp được.
  const opensTeam = team && !!board.settings.rosterOnly && empty;
  const unitWord = board.mode === 'classroom' ? 'tổ / lớp' : 'trường / đơn vị';
  const matched = useMemo(() => {
    const names = new Set(board.cards.map((c) => normalize(c.authorName)));
    return parsed.filter((m) => names.has(normalize(m.name))).length;
  }, [parsed, board.cards]);

  return (
    <ModalShell title={team ? 'Danh sách thành viên của tổ' : 'Danh sách sĩ số / học viên'} onClose={onClose} maxWidth="max-w-xl">
      <p className="mb-2 text-sm text-ink-2">
        {team
          ? <>Dán từ Excel hoặc Word, mỗi dòng 1 người: <b>Họ tên, Vai trò, Gmail</b> (vai trò và Gmail có hay không đều được; một người có thể giữ nhiều vai: “Tổ trưởng, Bí thư”). Chỉ những người có tên ở đây mới nộp được bài.</>
          : <>Dán từ Excel hoặc Word, mỗi dòng 1 người. Thêm {board.mode === 'classroom' ? 'tổ/lớp' : 'trường/đơn vị'} sau dấu phẩy hoặc Tab. Hệ thống tự đối chiếu với bài đã nộp (không phân biệt hoa thường, bỏ dấu).</>}
      </p>
      <label htmlFor="roster-text" className="field-label">Danh sách</label>
      <textarea id="roster-text" value={text} onChange={(e) => setText(e.target.value)} rows={10} spellCheck={false}
        className="input min-h-[200px] py-2 font-mono text-[13px]" placeholder={team ? 'Nguyễn Văn A, Tổ trưởng, Bí thư, a@gmail.com\nTrần Thị B, Tổ phó, Phó bí thư\nLê Văn C' : 'Nguyễn Văn A, Tổ 1\nTrần Thị B, Tổ 2'} />
      {empty ? (
        <div className="mt-2 rounded-2xl bg-brand-50 p-3 text-sm" aria-live="polite">
          <p className="font-extrabold text-ink">Không dùng danh sách</p>
          <p className="mt-1 text-ink-2">Người nộp tự gõ họ tên và {team ? 'đơn vị' : unitWord}. Hệ thống vẫn nhận bài bình thường, chỉ không có cột “chưa nộp” vì không biết ai cần nộp.</p>
          {opensTeam && <p className="mt-1 font-bold text-amber-800">Bảng tổ đang bật “Chỉ người có tên trong danh sách mới nộp được”: bấm lưu sẽ tự tắt tùy chọn này để mọi người có link đều nộp được.</p>}
        </div>
      ) : (
        <p className="mt-2 text-sm" aria-live="polite">
          Đọc được <b>{parsed.length}</b> người{team ? <> · có Gmail: <b>{withEmail}</b></> : null} · khớp với bài đã nộp: <b className="text-emerald-700">{matched}</b> · chưa nộp: <b className="text-rose-700">{parsed.length - matched}</b>
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        {!empty ? <button type="button" onClick={() => setText('')} className="btn-ghost"><Eraser className="h-4 w-4" aria-hidden /> Không cần danh sách (xóa hết)</button> : <span />}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Hủy</button>
          <button type="button" onClick={() => onApply(parsed)} className="btn-primary">
            <ListChecks className="h-4 w-4" aria-hidden /> {empty ? (board.roster.length > 0 ? 'Lưu: bỏ danh sách' : 'Lưu, không dùng danh sách') : 'Áp dụng danh sách'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
