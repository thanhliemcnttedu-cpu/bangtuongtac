import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { ViewMode } from '../types/board';
import { VIEW_META } from '../lib/boardSettings';

interface Props {
  view: ViewMode;
  allowed: ViewMode[];
  onChange: (v: ViewMode) => void;
}

/** Chọn bố cục: một nút hiển thị bố cục hiện tại, mở ra lưới các bố cục có mô tả ngắn (thay cho dãy nút dài). */
export function LayoutMenu({ view, allowed, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const Current = VIEW_META[view].Icon;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent): void => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu" aria-label={`Bố cục: ${VIEW_META[view].label}`}
        className="btn-ghost !min-h-[44px]">
        <Current className="h-4 w-4" aria-hidden />
        <span>{VIEW_META[view].label}</span>
        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div role="menu" aria-label="Chọn bố cục"
          className="pop-in fixed inset-x-3 bottom-3 z-40 grid max-h-[75vh] grid-cols-1 gap-1 overflow-y-auto rounded-3xl border border-brand-200 bg-white p-2 shadow-lift sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:mt-2 sm:w-[520px] sm:grid-cols-2">
          {(Object.keys(VIEW_META) as ViewMode[]).filter((k) => allowed.includes(k)).map((k) => {
            const { label, desc, Icon } = VIEW_META[k];
            const on = k === view;
            return (
              <button key={k} type="button" role="menuitemradio" aria-checked={on} onClick={() => { onChange(k); setOpen(false); }}
                className={`flex min-h-[56px] items-center gap-3 rounded-2xl px-3 py-2 text-left transition duration-150 ${on ? 'bg-brand-50 ring-2 ring-brand-600' : 'hover:bg-brand-50'}`}>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${on ? 'bg-brand-600 text-white' : 'bg-brand-100 text-brand-700'}`}><Icon className="h-5 w-5" aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold">{label}</span>
                  <span className="block text-xs text-ink-2">{desc}</span>
                </span>
                {on && <Check className="h-4 w-4 shrink-0 text-brand-700" aria-label="Đang dùng" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
