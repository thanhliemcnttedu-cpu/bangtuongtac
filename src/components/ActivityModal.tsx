import { useEffect, useState } from 'react';
import type { ActivityEntry } from '../types/board';
import { ACTIVITY_LABEL, prettyDetail } from '../lib/activity';
import { formatDateTime, formatRelative } from '../lib/format';
import { ModalShell } from './ModalShell';

interface Props {
  load: () => Promise<ActivityEntry[]>;
  onClose: () => void;
}

/** Gom sự kiện theo ngày (mới nhất trước): "Hôm nay", "Hôm qua", hoặc ngày/tháng. */
function groupByDay(list: ActivityEntry[]): { day: string; label: string; items: ActivityEntry[] }[] {
  const key = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const today = new Date(); const yest = new Date(); yest.setDate(yest.getDate() - 1);
  const out: { day: string; label: string; items: ActivityEntry[] }[] = [];
  for (const e of list) {
    const d = new Date(e.at); const k = key(d);
    let g = out.find((x) => x.day === k);
    if (!g) { g = { day: k, label: k === key(today) ? 'Hôm nay' : k === key(yest) ? 'Hôm qua' : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`, items: [] }; out.push(g); }
    g.items.push(e);
  }
  return out;
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
        <div aria-label="Dòng thời gian hoạt động" className="space-y-4">
          {groupByDay(entries).map((g) => (
            <section key={g.day}>
              <h3 className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-ink-2">{g.label}</h3>
              <ol className="relative ml-2 space-y-2 border-l-2 border-brand-200 pl-4">
                {g.items.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[23px] top-2 h-3 w-3 rounded-full bg-brand-500 ring-4 ring-white" aria-hidden />
                    <div className="rounded-2xl bg-brand-50/60 px-3 py-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="text-sm font-extrabold">{ACTIVITY_LABEL[a.action] ?? a.action}</span>
                        <time dateTime={a.at} title={formatDateTime(a.at)} className="text-xs text-ink-2">{new Date(a.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} · {formatRelative(a.at)}</time>
                      </div>
                      {a.detail && <p className="text-sm text-ink">{prettyDetail(a.detail)}</p>}
                      <p className="truncate text-xs text-ink-3">{a.actor}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </ModalShell>
  );
}
