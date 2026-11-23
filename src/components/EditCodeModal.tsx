import { useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';
import { formatEditCode } from '../lib/editCode';
import { ModalShell } from './ModalShell';

interface Props {
  code: string;
  /** Tên bài vừa nộp, để học sinh biết mã này của bài nào. */
  title: string;
  /** Lời báo về duyệt bài (nếu bài đang chờ giáo viên). */
  note?: string;
  onClose: () => void;
}

/** Hiện sau khi nộp bài: mã sửa bài để học sinh chép lại. Mã cũng được nhớ trên trình duyệt này. */
export function EditCodeModal({ code, title, note, onClose }: Props) {
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
          <p className="flex items-center justify-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-brand-700"><KeyRound className="h-4 w-4" aria-hidden /> Mã sửa bài của em</p>
          <p className="mt-2 select-all font-mono text-3xl font-extrabold tracking-[0.18em] text-ink" aria-label={`Mã sửa bài: ${shown}`}>{shown}</p>
        </div>
        <p className="text-sm text-ink-2">Hãy <b>chép hoặc chụp lại mã này</b>. Sau này muốn sửa hay nộp lại bài, em bấm nút <b>“Sửa bài đã nộp”</b> rồi nhập mã. Chỉ ai có mã mới sửa được bài này.</p>
        <div className="flex justify-center gap-2">
          <button type="button" onClick={() => void copy()} className="btn-ghost">
            {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} {copied ? 'Đã chép' : 'Chép mã'}
          </button>
          <button type="button" onClick={onClose} className="btn-primary">Em đã ghi lại mã</button>
        </div>
      </div>
    </ModalShell>
  );
}
