import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import type { SubmissionCard } from '../types/board';
import { downloadFiles, downloadable } from '../lib/downloadAll';

interface Props {
  card: Pick<SubmissionCard, 'attachments' | 'authorName' | 'title'>;
  className?: string;
}

/** Nút tải mọi tệp đính kèm của một bài; bài không có tệp thì không hiện. */
export function DownloadFiles({ card, className = 'btn-ghost btn-sm' }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const files = card.attachments.filter(downloadable);
  if (files.length === 0) return null;
  const run = async (): Promise<void> => {
    setBusy(true); setError('');
    try { await downloadFiles(files, `${card.authorName} - ${card.title}`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không tải được.'); }
    finally { setBusy(false); }
  };
  return (
    <>
      <button type="button" onClick={() => void run()} disabled={busy} className={className} title={files.map((f) => f.name).join(', ')}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Download className="h-3.5 w-3.5" aria-hidden />}
        {files.length > 1 ? `Tải ${files.length} tệp` : 'Tải tệp'}
      </button>
      {error && <span role="alert" className="text-xs font-bold text-rose-700">{error}</span>}
    </>
  );
}
