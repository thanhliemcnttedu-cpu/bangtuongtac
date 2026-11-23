import { useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';
import { formatEditCode } from '../lib/editCode';
import { ModalShell } from './ModalShell';

interface Props {
  code: string;
  /** Tên em đã ghi: chính là chìa khóa để sửa bài. */
  name: string;
  /** Tên bài vừa nộp, để học sinh biết mã này của bài nào. */
  title: string;
  /** Lời báo về duyệt bài (nếu bài đang chờ giáo viên). */
  note?: string;
  onClose: () => void;
}

/** Hiện sau khi nộp bài: mã sửa bài để học sinh chép lại. Mã cũng được nhớ trên trình duyệt này. */
export function EditCodeModal({ code, name, title, note, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const shown = formatEditCode(code);
  const copy = async (): Promise<void> => {
    try { await navigator.clipboard.writeText(shown); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* không chép được: em tự ghi lại */ }
  };
  return (
    <ModalShell title="Em đã nộp bài rồi!" onClose={onClose} maxWidth="max-w-md">
      <div className="space-y-4 text-center">
        <p className="text-sm text-ink-2">Bài “<b className="text-ink">{title}</b>” đã được gửi. {note}</p>
        <div className="rounded-3xl border-2 border-dashed border-brand-300 bg-brand-50/70 p-4">
          <p className="flex items-center justify-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-brand-700"><KeyRound className="h-4 w-4" aria-hidden /> Muốn sửa bài, em gõ tên này</p>
          <p className="mt-2 break-words text-3xl font-extrabold text-ink">{name}</p>
        </div>
        <p className="text-sm text-ink-2">Sau này muốn sửa hoặc nộp lại bài, em bấm nút <b>“Sửa bài đã nộp”</b> rồi gõ <b>đúng tên em đã ghi</b> ở trên.</p>
        <p className="text-xs text-ink-2">Mã dự phòng (nếu cô cần): <span className="select-all font-mono font-bold" aria-label={`Mã sửa bài: ${shown}`}>{shown}</span></p>
        <div className="flex justify-center gap-2">
          <button type="button" onClick={() => void copy()} className="btn-ghost">
            {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} {copied ? 'Đã chép' : 'Chép mã dự phòng'}
          </button>
          <button type="button" onClick={onClose} className="btn-primary">Em nhớ rồi</button>
        </div>
      </div>
    </ModalShell>
  );
}
