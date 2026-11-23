import { useEffect, useState } from 'react';
import type { ActivityEntry } from '../types/board';
import { ACTIVITY_LABEL, prettyDetail } from '../lib/activity';
import { formatDateTime, formatRelative } from '../lib/format';
import { ModalShell } from './ModalShell';

interface Props {
  load: () => Promise<ActivityEntry[]>;
  onClose: () => void;
}

/** Nhật ký hoạt động: ai làm gì, lúc nào (150 sự kiện gần nhất). Chỉ giáo viên thấy. */
export function ActivityModal({ load, onClose }: Props) {
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    load().then((e) => { if (alive) setEntries(e); }).catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'Không tải được nhật ký.'); });
    return () => { alive = false; };
    // chỉ tải một lần khi mở hộp thoại
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ModalShell title="Nhật ký hoạt động" onClose={onClose} maxWidth="max-w-xl">
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}
      {!error && entries === null && <p role="status" className="py-8 text-center text-ink-2">Đang tải…</p>}
      {entries && entries.length === 0 && <p className="py-8 text-center text-ink-2">Chưa có hoạt động nào.</p>}
      {entries && entries.length > 0 && (
        <ol className="space-y-2" aria-label="Danh sách hoạt động">
          {entries.map((a) => (
            <li key={a.id} className="rounded-2xl bg-brand-50/60 px-3 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-extrabold">{ACTIVITY_LABEL[a.action] ?? a.action}</span>
                <time dateTime={a.at} title={formatDateTime(a.at)} className="text-xs text-ink-2">{formatRelative(a.at)}</time>
              </div>
              {a.detail && <p className="text-sm text-ink">{prettyDetail(a.detail)}</p>}
              <p className="truncate text-xs text-ink-3">{a.actor}</p>
            </li>
          ))}
        </ol>
      )}
    </ModalShell>
  );
}
