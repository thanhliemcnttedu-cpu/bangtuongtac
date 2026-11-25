import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, School, Share2, Users } from 'lucide-react';
import type { BoardData } from '../types/board';

interface Props { boards: BoardData[]; currentId?: string; onSelect: (id: string) => void }

const isShared = (b: BoardData): boolean => (b.access ?? 'owner') !== 'owner';

/**
 * Chọn bảng bằng một nút duy nhất hiện tên bảng đang xem; bấm mở danh sách có nhóm (lớp / chương trình tập huấn / được chia sẻ)
 * và ô tìm kiếm. Thay cho dải nút cuộn ngang vì tên bị cắt, khó thấy bảng nào đang mở và phải kéo thanh cuộn.
 */
export function BoardSwitcher({ boards, currentId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const current = boards.find((b) => b.id === currentId);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent): void => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); window.removeEventListener('keydown', onKey); };
  }, [open]);

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = boards.filter((b) => !term || b.title.toLowerCase().includes(term) || (b.program ?? '').toLowerCase().includes(term));
    const map = new Map<string, BoardData[]>();
    const add = (name: string, b: BoardData): void => { map.set(name, [...(map.get(name) ?? []), b]); };
    list.filter((b) => !isShared(b) && !b.program).forEach((b) => add('Bảng của tôi', b));
    list.filter((b) => !isShared(b) && b.program).forEach((b) => add(`Chương trình: ${b.program}`, b));
    list.filter(isShared).forEach((b) => add('Được chia sẻ với tôi', b));
    return [...map.entries()];
  }, [boards, q]);

  if (boards.length === 0) return null;
  const CurIcon = current ? (isShared(current) ? Share2 : current.mode === 'classroom' ? School : Users) : School;

  return (
    <div ref={box} className="relative min-w-0 flex-1 sm:w-auto sm:flex-none sm:min-w-[300px] sm:max-w-[min(46vw,560px)]">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => { setOpen(!open); setQ(''); }}
        className="btn-ghost !min-h-[52px] w-full !justify-start !gap-3 !rounded-2xl !px-4 text-left max-sm:!min-h-[44px] max-sm:!gap-1.5 max-sm:!px-3">
        <CurIcon className="h-5 w-5 shrink-0 text-brand-600 max-sm:hidden" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold uppercase leading-none tracking-wide text-ink-3 max-sm:hidden">Đang xem · {boards.length} bảng</span>
          <span className="mt-0.5 block truncate text-base font-extrabold leading-tight text-ink max-sm:mt-0 max-sm:text-sm">{current?.title ?? 'Chọn bảng'}</span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <div role="listbox" aria-label="Danh sách bảng"
          className="pop-in fixed inset-x-3 top-24 z-40 max-sm:top-16 max-h-[70vh] overflow-y-auto rounded-3xl border border-brand-200 bg-white p-3 shadow-lift sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-2 sm:w-[min(92vw,520px)]">
          {boards.length > 5 && (
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm bảng theo tên…" className="input !pl-9" aria-label="Tìm bảng" />
            </div>
          )}
          {groups.length === 0 && <p className="p-4 text-center text-sm text-ink-2">Không có bảng nào khớp.</p>}
          {groups.map(([name, list]) => (
            <div key={name} className="mb-2 last:mb-0">
              <p className="px-2 pb-1 pt-1 text-xs font-extrabold uppercase tracking-wide text-violet-700">{name}</p>
              {list.map((b) => {
                const on = b.id === currentId;
                const Icon = isShared(b) ? Share2 : b.mode === 'classroom' ? School : Users;
                return (
                  <button key={b.id} type="button" role="option" aria-selected={on} onClick={() => { onSelect(b.id); setOpen(false); }}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition duration-200 ${on ? 'bg-brand-50 ring-2 ring-brand-500' : 'hover:bg-brand-50/70'}`}>
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${on ? 'bg-brand-600 text-white' : 'bg-brand-100 text-brand-700'}`}><Icon className="h-5 w-5" aria-hidden /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-extrabold leading-snug text-ink">{b.title}</span>
                      <span className="block text-xs text-ink-2">
                        {b.mode === 'classroom' ? 'Lớp học' : 'Tập huấn'}{isShared(b) ? ` · của ${b.ownerEmail ?? 'giáo viên khác'}` : ''}{b.archivedAt ? ' · đã đóng' : ''}
                      </span>
                    </span>
                    {on && <Check className="h-5 w-5 shrink-0 text-brand-600" aria-label="Đang xem" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
