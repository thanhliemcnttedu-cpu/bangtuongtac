import { useState } from 'react';
import { Star } from 'lucide-react';

/** Hiển thị điểm sao (có thể lẻ, ví dụ 4,3): lớp sao vàng phủ lên lớp sao xám theo tỉ lệ. */
export function StarsDisplay({ value, size = 16, label }: { value: number; size?: number; label?: string }) {
  const pct = Math.max(0, Math.min(5, value)) / 5 * 100;
  return (
    <span className="relative inline-flex shrink-0" role="img" aria-label={label ?? `${value} trên 5 sao`}>
      <span className="flex text-slate-300">{[0, 1, 2, 3, 4].map((i) => <Star key={i} style={{ width: size, height: size }} className="fill-current" aria-hidden />)}</span>
      <span className="absolute inset-y-0 left-0 flex overflow-hidden text-amber-400" style={{ width: `${pct}%` }}>
        {[0, 1, 2, 3, 4].map((i) => <Star key={i} style={{ width: size, height: size }} className="shrink-0 fill-current" aria-hidden />)}
      </span>
    </span>
  );
}

interface InputProps {
  value: number;
  onChange: (stars: number) => void;
  disabled?: boolean;
  /** Nhãn đọc cho trình đọc màn hình, ví dụ "Chấm sao cho bài này". */
  label: string;
  size?: number;
}

/** Chọn 1–5 sao: bấm sao thứ n để chấm n sao; rê chuột để xem trước. Bàn phím: Tab tới từng sao, Enter/Space để chọn. */
export function StarsInput({ value, onChange, disabled = false, label, size = 28 }: InputProps) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div role="group" aria-label={label} className="inline-flex gap-0.5" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={disabled} aria-label={`${n} sao`} aria-pressed={value === n}
          onMouseEnter={() => !disabled && setHover(n)} onFocus={() => !disabled && setHover(n)} onBlur={() => setHover(0)}
          onClick={() => onChange(n)}
          className="flex h-11 w-9 items-center justify-center rounded-lg transition duration-150 enabled:hover:scale-110 disabled:cursor-default">
          <Star style={{ width: size, height: size }} className={`${n <= shown ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-slate-300'} transition-colors duration-150`} aria-hidden />
        </button>
      ))}
    </div>
  );
}
