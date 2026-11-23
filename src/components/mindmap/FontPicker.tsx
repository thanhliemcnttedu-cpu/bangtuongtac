import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, Type } from 'lucide-react';
import { cssFamily } from './mindmapCore';

/** Font đi kèm phần mềm (đã nạp từ Google Fonts, có đủ dấu tiếng Việt). */
const APP_FONTS: Array<{ id: string; label: string }> = [
  { id: 'sans', label: 'Be Vietnam Pro' }, { id: 'serif', label: 'Lora' }, { id: 'hand', label: 'Patrick Hand' },
  { id: 'Roboto', label: 'Roboto' }, { id: 'Open Sans', label: 'Open Sans' }, { id: 'Montserrat', label: 'Montserrat' },
  { id: 'Quicksand', label: 'Quicksand' }, { id: 'Playfair Display', label: 'Playfair Display' },
  { id: 'Dancing Script', label: 'Dancing Script' }, { id: 'Lobster', label: 'Lobster' }, { id: 'Pacifico', label: 'Pacifico' },
  { id: 'Sriracha', label: 'Sriracha' }, { id: 'Charm', label: 'Charm' },
];

/** Font thường có sẵn trên Windows / macOS: chỉ hiện những font máy này thật sự có. */
const COMMON = [
  'Arial', 'Times New Roman', 'Calibri', 'Cambria', 'Tahoma', 'Verdana', 'Segoe UI', 'Comic Sans MS', 'Trebuchet MS', 'Georgia',
  'Courier New', 'Consolas', 'Impact', 'Century Gothic', 'Garamond', 'Palatino Linotype', 'Candara', 'Constantia', 'Corbel',
  'Bookman Old Style', 'Book Antiqua', 'Lucida Sans', 'Franklin Gothic Medium', 'Gill Sans MT', 'Helvetica', 'Helvetica Neue',
  'Avenir', 'Optima', 'Futura', 'Baskerville', 'Didot', 'Chalkboard', 'Marker Felt', 'Noteworthy', 'Papyrus', 'Brush Script MT', 'Segoe Script', 'Ink Free',
];

let probe: CanvasRenderingContext2D | null = null;
/** Máy có font này không: so độ rộng chữ với hai font dự phòng. */
function installed(name: string): boolean {
  if (!probe) probe = document.createElement('canvas').getContext('2d');
  if (!probe) return false;
  const text = 'mmmmmmmmmmlli Ắ Ệ 0123';
  const w = (f: string): number => { probe!.font = `72px ${f}`; return probe!.measureText(text).width; };
  return ['monospace', 'serif', 'sans-serif'].some((base) => w(`"${name}", ${base}`) !== w(base));
}

interface Props { value: string; onChange: (family: string) => void }

/**
 * Chọn phông chữ: mỗi tên hiện đúng bằng kiểu chữ của nó. Gồm font của phần mềm, font có sẵn trên máy
 * (tự dò) và nút “Thêm font trong máy” để xin trình duyệt liệt kê toàn bộ font đã cài (Chrome / Edge).
 */
export function FontPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [local, setLocal] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const box = useRef<HTMLDivElement>(null);

  const system = useMemo(() => COMMON.filter(installed), []);
  const appIds = new Set(APP_FONTS.map((f) => f.label));
  const extra = local.filter((f) => !system.includes(f) && !appIds.has(f));

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent): void => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const label = APP_FONTS.find((f) => f.id === value)?.label ?? value;
  const term = q.trim().toLowerCase();
  const match = (s: string): boolean => !term || s.toLowerCase().includes(term);

  const loadLocal = async (): Promise<void> => {
    const fn = (window as unknown as { queryLocalFonts?: () => Promise<Array<{ family: string }>> }).queryLocalFonts;
    if (!fn) { setMsg('Trình duyệt này chưa cho đọc danh sách font trong máy. Hãy dùng Chrome hoặc Edge, hoặc chọn font có sẵn ở trên.'); return; }
    try {
      const list = await fn.call(window);
      setLocal([...new Set(list.map((f) => f.family))].sort((a, b) => a.localeCompare(b, 'vi')));
      setMsg(list.length ? '' : 'Không tìm thấy font nào.');
    } catch { setMsg('Chưa được phép đọc font trong máy. Hãy bấm “Cho phép” khi trình duyệt hỏi.'); }
  };

  const item = (id: string, name: string) => (
    <button key={`${id}-${name}`} type="button" role="option" aria-selected={value === id} onClick={() => { onChange(id); setOpen(false); }}
      className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-lg transition duration-150 ${value === id ? 'bg-brand-50 ring-2 ring-brand-500' : 'hover:bg-brand-50/70'}`}
      style={{ fontFamily: cssFamily(id) }}>
      <span className="truncate">{name}</span>
      <span className="shrink-0 text-xs text-ink-3" style={{ fontFamily: 'inherit' }}>Aa ắ ệ</span>
    </button>
  );

  const group = (title: string, children: React.ReactNode[]) => (children.length > 0 ? (
    <div key={title} className="mb-2">
      <p className="px-2 pb-1 pt-1 text-xs font-extrabold uppercase tracking-wide text-violet-700">{title}</p>
      {children}
    </div>
  ) : null);

  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label="Phông chữ" onClick={() => { setOpen(!open); setQ(''); }}
        className="btn-ghost !min-h-[44px] !justify-between !gap-2 !px-3 text-sm" style={{ minWidth: 190 }}>
        <Type className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left" style={{ fontFamily: cssFamily(value) }}>{label}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div role="listbox" aria-label="Danh sách phông chữ" onPointerDown={(e) => e.stopPropagation()}
          className="pop-in fixed inset-x-3 top-28 z-40 max-h-[70vh] overflow-y-auto rounded-3xl border border-brand-200 bg-white p-3 shadow-lift sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-2 sm:w-[340px]">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tên font…" aria-label="Tìm font" className="input !pl-9" />
          </div>
          {group('Font của phần mềm', APP_FONTS.filter((f) => match(f.label)).map((f) => item(f.id, f.label)))}
          {group('Font có sẵn trên máy', system.filter(match).map((f) => item(f, f)))}
          {group('Font khác trong máy', extra.filter(match).slice(0, 300).map((f) => item(f, f)))}
          {local.length === 0 && (
            <button type="button" onClick={() => void loadLocal()} className="btn-ghost mt-1 w-full">Thêm font trong máy của em</button>
          )}
          {msg && <p role="alert" className="mt-2 text-xs font-bold text-rose-700">{msg}</p>}
        </div>
      )}
    </div>
  );
}
