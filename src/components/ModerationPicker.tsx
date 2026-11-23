import { ShieldCheck, ShieldOff, UserCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ModerationMode } from '../types/board';
import { MODERATION_META } from '../lib/boardSettings';

const ICON: Record<ModerationMode, LucideIcon> = { off: ShieldOff, manual: UserCheck, auto: ShieldCheck };
const ORDER: ModerationMode[] = ['manual', 'auto', 'off'];

interface Props {
  value: ModerationMode;
  onChange: (m: ModerationMode) => void;
  disabled?: boolean;
  /** Id duy nhất cho nhóm nút radio (có thể có hai bộ chọn cùng lúc trên trang). */
  name: string;
}

/** Chọn chế độ kiểm duyệt bài nộp và nhận xét của học sinh: giáo viên duyệt / hệ thống tự duyệt / tắt. */
export function ModerationPicker({ value, onChange, disabled = false, name }: Props) {
  return (
    <fieldset disabled={disabled} className="space-y-2">
      <legend className="field-label">Kiểm duyệt bài và nhận xét của học sinh</legend>
      {ORDER.map((m) => {
        const Icon = ICON[m];
        const on = value === m;
        return (
          <label key={m} className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3 transition duration-200 ${on ? 'border-brand-600 bg-brand-50' : 'border-brand-100 hover:border-brand-300'}`}>
            <input type="radio" name={name} className="mt-1 h-4 w-4 accent-brand-600" checked={on} onChange={() => onChange(m)} />
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
            <span>
              <span className="block text-sm font-extrabold">{MODERATION_META[m].label}{m === 'off' && <span className="ml-2 chip bg-white text-ink-2 ring-brand-200">Mặc định</span>}</span>
              <span className="block text-xs text-ink-2">{MODERATION_META[m].desc}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
