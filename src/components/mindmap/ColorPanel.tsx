import { useEffect, useState } from 'react';
import { Pipette } from 'lucide-react';

/** Màu mẫu xếp theo hàng: đỏ-cam-vàng-lục-lam-tím-hồng, rồi tới màu đậm nhạt và đen trắng xám. */
export const PRESET_COLORS = [
  '#e11d48', '#f97316', '#f59e0b', '#facc15', '#84cc16', '#16a34a',
  '#0d9488', '#06b6d4', '#1668f2', '#4f46e5', '#7c3aed', '#ec4899',
  '#fecdd3', '#fed7aa', '#fef3c7', '#d9f99d', '#bbf7d0', '#bae6fd',
  '#bfdbfe', '#ddd6fe', '#fbcfe8', '#ffffff', '#94a3b8', '#0a1730',
];

function hexToHsl(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [210, 80, 50];
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255; const g = ((n >> 8) & 255) / 255; const b = (n & 255) / 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, Math.round(l * 100)];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = Math.round(h * 60); if (h < 0) h += 360;
  return [h, Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h: number, s: number, l: number): string {
  const S = s / 100; const L = l / 100;
  const k = (n: number): number => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number): string => Math.round(255 * (L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))).toString(16).padStart(2, '0');
  return `#${f(0)}${f(8)}${f(4)}`;
}

declare global { interface Window { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } } }

interface Props {
  /** Việc đang tô: hiện trong tiêu đề. */
  title: string;
  value: string;
  recent: string[];
  /** Có thể hút màu từ một nhánh khác trong sơ đồ (dùng khi trình duyệt không hút được màu màn hình). */
  onPickFromMap: () => void;
  /** Cho phép chọn “không tô nền” (trong suốt). */
  allowNone?: boolean;
  onPick: (hex: string) => void;
  onClose: () => void;
}

/**
 * Bảng màu chung cho học sinh: bấm màu mẫu, hoặc pha màu bằng 3 thanh kéo (màu, đậm nhạt, sáng tối),
 * hoặc hút màu từ bất kỳ chỗ nào trên màn hình (nếu trình duyệt hỗ trợ) hoặc từ một nhánh khác trong sơ đồ.
 */
export function ColorPanel({ title, value, recent, onPickFromMap, onPick, onClose, allowNone = false }: Props) {
  const [hsl, setHsl] = useState<[number, number, number]>(() => hexToHsl(value));
  const [hex, setHex] = useState(value);
  const [note, setNote] = useState('');

  useEffect(() => { setHsl(hexToHsl(value)); setHex(value); }, [value]);

  const mix = (next: [number, number, number]): void => {
    setHsl(next);
    const c = hslToHex(...next);
    setHex(c);
    onPick(c);
  };

  const eyedrop = async (): Promise<void> => {
    if (!window.EyeDropper) { onPickFromMap(); return; }
    try {
      const r = await new window.EyeDropper().open();
      onPick(r.sRGBHex);
      setNote('');
    } catch { setNote('Chưa lấy được màu. Hãy thử lại.'); }
  };

  const track = 'h-4 w-full cursor-pointer appearance-none rounded-full';
  return (
    <div role="dialog" aria-label={`Bảng màu: ${title}`} className="pop-in fixed inset-x-3 top-28 z-40 max-h-[75vh] overflow-y-auto sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-2 sm:max-h-none sm:w-[340px] sm:overflow-visible rounded-3xl border border-brand-200 bg-white p-4 shadow-lift" onPointerDown={(e) => e.stopPropagation()}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-extrabold">Chọn màu cho: <span className="text-brand-700">{title}</span></p>
        <button type="button" onClick={onClose} className="btn-ghost btn-sm">Xong</button>
      </div>

      <div className="grid grid-cols-6 gap-2" role="group" aria-label="Màu mẫu">
        {PRESET_COLORS.map((c) => (
          <button key={c} type="button" aria-label={`Màu ${c}`} aria-pressed={value.toLowerCase() === c} onClick={() => onPick(c)}
            className={`h-10 w-full rounded-xl border-2 transition duration-150 hover:scale-110 ${value.toLowerCase() === c ? 'scale-110 border-ink ring-2 ring-brand-300' : 'border-black/10'}`} style={{ background: c }} />
        ))}
      </div>

      {allowNone && <button type="button" onClick={() => onPick('transparent')} aria-pressed={value === 'transparent'} className={`btn-ghost btn-sm mt-2 w-full ${value === 'transparent' ? '!border-brand-600 !bg-brand-50' : ''}`}>Không tô nền (trong suốt)</button>}

      {recent.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-bold text-ink-2">Màu em vừa dùng</p>
          <div className="flex flex-wrap gap-2">
            {recent.map((c) => <button key={c} type="button" aria-label={`Màu vừa dùng ${c}`} onClick={() => onPick(c)} className="h-8 w-8 rounded-full border-2 border-black/10 transition hover:scale-110" style={{ background: c }} />)}
          </div>
        </div>
      )}

      <div className="mt-3 space-y-2 rounded-2xl bg-brand-50/70 p-3">
        <p className="text-xs font-extrabold">Tự pha màu</p>
        <label className="block text-xs font-bold text-ink-2">Màu sắc
          <input type="range" min={0} max={359} value={hsl[0]} onChange={(e) => mix([Number(e.target.value), hsl[1] || 80, hsl[2]])} className={track}
            style={{ background: 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)' }} aria-label="Màu sắc" />
        </label>
        <label className="block text-xs font-bold text-ink-2">Đậm hay nhạt
          <input type="range" min={0} max={100} value={hsl[1]} onChange={(e) => mix([hsl[0], Number(e.target.value), hsl[2]])} className={track}
            style={{ background: `linear-gradient(90deg,${hslToHex(hsl[0], 0, hsl[2])},${hslToHex(hsl[0], 100, hsl[2])})` }} aria-label="Đậm nhạt" />
        </label>
        <label className="block text-xs font-bold text-ink-2">Sáng hay tối
          <input type="range" min={5} max={95} value={hsl[2]} onChange={(e) => mix([hsl[0], hsl[1], Number(e.target.value)])} className={track}
            style={{ background: `linear-gradient(90deg,#000,${hslToHex(hsl[0], hsl[1], 50)},#fff)` }} aria-label="Sáng tối" />
        </label>
        <div className="flex items-center gap-2">
          <span className="h-9 w-9 shrink-0 rounded-xl border-2 border-black/10" style={{ background: value }} aria-hidden />
          <input value={hex} aria-label="Mã màu" maxLength={7} onChange={(e) => { setHex(e.target.value); if (/^#[0-9a-f]{6}$/i.test(e.target.value)) { setHsl(hexToHsl(e.target.value)); onPick(e.target.value.toLowerCase()); } }} className="input !min-h-[40px] !w-28 font-mono text-sm" />
        </div>
      </div>

      <button type="button" onClick={() => void eyedrop()} className="btn-ghost mt-3 w-full">
        <Pipette className="h-4 w-4" aria-hidden /> {window.EyeDropper ? 'Hút màu từ bất kỳ đâu trên màn hình' : 'Hút màu từ một nhánh khác'}
      </button>
      {note && <p role="alert" className="mt-2 text-xs font-bold text-rose-700">{note}</p>}
    </div>
  );
}
