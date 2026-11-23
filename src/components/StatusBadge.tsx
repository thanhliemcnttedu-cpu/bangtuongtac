import { Star } from 'lucide-react';
import type { MemberProgress } from '../types/board';
import { PROGRESS_LABEL, PROGRESS_STYLE } from '../lib/format';

export function StatusBadge({ progress }: { progress: MemberProgress }) {
  return (
    <span className={`chip ${PROGRESS_STYLE[progress]}`}>
      {progress === 'featured' && <Star className="h-3.5 w-3.5 fill-current" aria-hidden />}
      {PROGRESS_LABEL[progress]}
    </span>
  );
}
