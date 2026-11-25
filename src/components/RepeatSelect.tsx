import type { RepeatRule } from '../types/board';
import { DAY_NAMES, daysOf } from '../lib/recurrence';

const OPTIONS: [string, string][] = [
  ['none', 'Không lặp'], ['daily', 'Hằng ngày (cùng giờ)'], ['weekdays', 'Các ngày thứ 2 – thứ 6 (cùng giờ)'], ['days', 'Chọn các thứ trong tuần… (cùng giờ)'],
  ['weekly', 'Hằng tuần (cùng giờ)'], ['monthly', 'Hằng tháng (cùng ngày, giờ)'], ['quarterly', 'Hằng quý (3 tháng)'], ['semester', 'Hằng học kỳ (6 tháng)'], ['yearly', 'Hằng năm'],
];

/** Ô chọn kiểu lặp; chọn "các thứ trong tuần" thì hiện nút bật / tắt từng thứ (ví dụ bán trú: Thứ 2 đến Thứ 5). */
export function RepeatSelect({ id, value, due, onChange }: { id: string; value: RepeatRule; /** Giá trị ô hạn (datetime-local); rỗng thì không lặp được. */ due: string; onChange: (v: RepeatRule) => void }) {
  const days = daysOf(value);
  const dueDay = due ? ((new Date(due).getDay() + 6) % 7) + 1 : 0;
  const toggle = (d: number): void => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b);
    if (next.length > 0) onChange(`days:${next.join('')}`);
  };
  return (
    <>
      <select id={id} className="input" value={!due ? 'none' : days.length > 0 ? 'days' : value} disabled={!due}
        onChange={(e) => onChange(e.target.value === 'days' ? 'days:1234' : (e.target.value as RepeatRule))}>
        {OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
      </select>
      {due && days.length > 0 && (
        <div className="mt-2">
          <div role="group" aria-label="Các thứ sẽ lặp" className="flex flex-wrap gap-1.5">
            {DAY_NAMES.map((name, i) => (
              <button key={name} type="button" aria-pressed={days.includes(i + 1)} onClick={() => toggle(i + 1)}
                className={`chip min-h-[36px] min-w-[44px] cursor-pointer justify-center text-sm max-lg:!min-h-[44px] ${days.includes(i + 1) ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-2 ring-brand-200 hover:bg-brand-50'}`}>{name}</button>
            ))}
          </div>
          {!days.includes(dueDay) && <p className="mt-1 text-xs font-bold text-amber-800">Hạn đang đặt không rơi vào thứ đã chọn: lượt đầu vẫn theo hạn này, các lượt sau mới theo thứ đã chọn.</p>}
        </div>
      )}
    </>
  );
}
