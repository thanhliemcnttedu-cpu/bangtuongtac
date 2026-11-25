import { useState } from 'react';
import { Archive, MoreHorizontal, Plus, BarChart3, CalendarDays, ClipboardList, FolderOpen, LayoutDashboard, LayoutGrid } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type NavPage = 'home' | 'board' | 'my' | 'schedule' | 'profile' | 'reports';

interface Props {
  active: NavPage;
  onGo: (p: NavPage) => void;
  onArchive: () => void;
  storedCount: number;
  /** Có bảng nào đang mở để quay lại không. */
  hasBoard: boolean;
  /** rail = cột dọc bên trái (máy tính); bar = thanh dưới cùng (điện thoại). */
  variant: 'rail' | 'bar';
  /** Tạo bảng mới (mục trong tấm "Thêm" của thanh dưới). */
  onCreate?: () => void;
}

const ITEMS: { id: NavPage; label: string; Icon: LucideIcon }[] = [
  { id: 'home', label: 'Tổng quan', Icon: LayoutDashboard },
  { id: 'board', label: 'Bảng', Icon: LayoutGrid },
  { id: 'my', label: 'Việc của tôi', Icon: ClipboardList },
  { id: 'schedule', label: 'Lịch', Icon: CalendarDays },
  { id: 'profile', label: 'Hồ sơ', Icon: FolderOpen },
  { id: 'reports', label: 'Báo cáo', Icon: BarChart3 },
];

/** Điều hướng chính của giáo viên: cột bên trái trên máy tính, thanh dưới cùng trên điện thoại. Học sinh và thành viên không thấy. */
export function NavRail({ active, onGo, onArchive, storedCount, hasBoard, variant, onCreate }: Props) {
  const [more, setMore] = useState(false);
  const rail = variant === 'rail';
  const item = (on: boolean): string => `relative flex items-center justify-center gap-1 rounded-2xl font-extrabold transition ${rail ? 'w-full flex-col px-1 py-2.5 text-[11px] leading-tight' : 'min-w-0 flex-1 flex-col py-1.5 text-[10px]'} ${on ? 'bg-brand-600 text-white shadow-glow' : 'text-ink-2 hover:bg-brand-50 hover:text-brand-700'}`;
  const nav = (
    <>
      {ITEMS.map(({ id, label, Icon }) => (
        <button key={id} type="button" aria-current={active === id ? 'page' : undefined} disabled={id === 'board' && !hasBoard} onClick={() => onGo(id)} className={`${item(active === id)} disabled:opacity-40`}>
          <Icon className={rail ? 'h-6 w-6' : 'h-5 w-5'} aria-hidden /><span className="text-center">{label}</span>
        </button>
      ))}
      <button type="button" onClick={onArchive} className={item(false)} aria-label="Bảng đã đóng và thùng rác">
        <Archive className={rail ? 'h-6 w-6' : 'h-5 w-5'} aria-hidden /><span className="text-center">Lưu trữ</span>
        {storedCount > 0 && <span className="absolute right-1.5 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-extrabold text-white ring-2 ring-white">{storedCount}</span>}
      </button>
    </>
  );
  if (rail) return <nav aria-label="Điều hướng chính" className="sticky top-28 hidden h-[calc(100vh-8rem)] w-[88px] shrink-0 flex-col gap-1.5 self-start px-2 py-3 lg:flex print:hidden">{nav}</nav>;

  // Điện thoại, máy tính bảng dọc: 4 mục hay dùng + "Thêm" (Tổng quan, Báo cáo, Lưu trữ, Tạo bảng).
  const main = (['board', 'my', 'schedule', 'profile'] as const).map((id) => ITEMS.find((x) => x.id === id) as (typeof ITEMS)[number]);
  const extra = ITEMS.filter((x) => x.id === 'home' || x.id === 'reports');
  const pick = (fn: () => void) => (): void => { setMore(false); fn(); };
  const row = 'flex min-h-[48px] w-full items-center gap-3 rounded-2xl px-3 text-left text-sm font-bold hover:bg-brand-50';
  return (
    <>
      {more && <button type="button" aria-label="Đóng mục Thêm" onClick={() => setMore(false)} className="fixed inset-0 z-[29] bg-ink/20 lg:hidden" />}
      <nav aria-label="Điều hướng chính" onKeyDown={(e) => { if (e.key === 'Escape') setMore(false); }} className="fixed inset-x-0 bottom-0 z-30 flex gap-1 border-t border-brand-200/70 bg-white/95 px-2 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-md lg:hidden print:hidden">
        {main.map(({ id, label, Icon }) => (
          <button key={id} type="button" aria-current={active === id ? 'page' : undefined} aria-label={label} disabled={id === 'board' && !hasBoard} onClick={pick(() => onGo(id))} className={`${item(active === id && !more)} disabled:opacity-40`}>
            <Icon className="h-5 w-5" aria-hidden /><span className="whitespace-nowrap text-[11px]">{id === 'my' ? 'Việc' : label}</span>
          </button>
        ))}
        <button type="button" aria-expanded={more} aria-haspopup="menu" onClick={() => setMore((v) => !v)} className={item(more || active === 'home' || active === 'reports')}>
          <MoreHorizontal className="h-5 w-5" aria-hidden /><span className="text-[11px]">Thêm</span>
        </button>
        {more && (
          <div role="menu" aria-label="Thêm" className="pop-in absolute bottom-full right-2 mb-2 w-[min(18rem,calc(100vw-1rem))] space-y-0.5 rounded-3xl border border-brand-200 bg-white p-2 shadow-lift">
            {extra.map(({ id, label, Icon }) => <button key={id} type="button" role="menuitem" onClick={pick(() => onGo(id))} className={`${row} ${active === id ? 'bg-brand-50 text-brand-700' : ''}`}><Icon className="h-5 w-5 text-brand-700" aria-hidden /> {label}</button>)}
            <button type="button" role="menuitem" onClick={pick(onArchive)} className={row}><Archive className="h-5 w-5 text-brand-700" aria-hidden /> Bảng đã đóng và thùng rác{storedCount > 0 && <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] text-white">{storedCount}</span>}</button>
            {onCreate && <button type="button" role="menuitem" onClick={pick(onCreate)} className={row}><Plus className="h-5 w-5 text-brand-700" aria-hidden /> Tạo bảng mới</button>}
          </div>
        )}
      </nav>
    </>
  );
}
