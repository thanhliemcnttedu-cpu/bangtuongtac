import { useState } from 'react';
import { Check } from 'lucide-react';
import type { PollOption } from '../types/board';
import { getMyVotes } from '../lib/boardApi';

interface Props {
  cardId: string;
  options: PollOption[];
  canVote: boolean;
  onVote: (cardId: string, optionId: string) => void;
  /** Gọn hơn khi nằm trong thẻ nhỏ. */
  compact?: boolean;
}

/** Thăm dò ý kiến: mỗi trình duyệt một phiếu cho mỗi bài, có thể đổi ý; kết quả hiện ngay dạng thanh phần trăm. */
export function PollView({ cardId, options, canVote, onVote, compact = false }: Props) {
  const [mine, setMine] = useState<string | undefined>(() => getMyVotes()[cardId]);
  const total = options.reduce((n, o) => n + o.votes, 0);

  return (
    <div className="space-y-1.5" role="group" aria-label="Thăm dò ý kiến">
      {options.map((o) => {
        const pct = total === 0 ? 0 : Math.round((o.votes / total) * 100);
        const picked = mine === o.id;
        return (
          <button key={o.id} type="button" disabled={!canVote} aria-pressed={picked}
            onClick={() => { setMine(o.id); onVote(cardId, o.id); }}
            className={`relative flex w-full items-center justify-between gap-2 overflow-hidden rounded-xl border-[1.5px] px-3 text-left transition duration-200 disabled:cursor-default ${compact ? 'min-h-[36px] text-xs' : 'min-h-[44px] text-sm'} ${picked ? 'border-brand-600' : 'border-brand-200 hover:border-brand-400'} bg-white`}>
            <span className="absolute inset-y-0 left-0 bg-brand-100 transition-all duration-500" style={{ width: `${pct}%` }} aria-hidden />
            <span className="relative flex min-w-0 items-center gap-1.5 font-bold">
              {picked && <Check className="h-4 w-4 shrink-0 text-brand-700" aria-label="Bạn đã chọn" />}
              <span className="truncate">{o.label}</span>
            </span>
            <span className="relative shrink-0 text-xs font-extrabold text-brand-800">{o.votes} · {pct}%</span>
          </button>
        );
      })}
      <p className="text-xs text-ink-2">{total} phiếu{canVote ? (mine ? ' · bấm lựa chọn khác để đổi ý' : ' · bấm để bình chọn') : ''}</p>
    </div>
  );
}
