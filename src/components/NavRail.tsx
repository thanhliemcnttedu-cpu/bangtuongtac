import { Archive, BarChart3, ClipboardList, LayoutDashboard, LayoutGrid } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type NavPage = 'home' | 'board' | 'my' | 'reports';

interface Props {
  active: NavPage;
  onGo: (p: NavPage) => void;
  onArchive: () => void;
  storedCount: number;
  /** Có bảng nào đang mở để quay lại không. */
  hasBoard: boolean;
  /** rail = cột dọc bên trái (máy tính); bar = thanh dưới cùng (điện thoại). */
  variant: 'rail' | 'bar';
}

const ITEMS: { id: NavPage; label: string; Icon: LucideIcon }[] = [
  { id: 'home', label: 'Tổng quan', Icon: LayoutDashboard },
  { id: 'board', label: 'Bảng', Icon: LayoutGrid },
  { id: 'my', label: 'Việc của tôi', Icon: ClipboardList },
  { id: 'reports', label: 'Báo cáo', Icon: BarChart3 },
];

/** Điều hướng chính của giáo viên: cột bên trái trên máy tính, thanh dưới cùng trên điện thoại. Học sinh và thành viên không thấy. */
export function NavRail({ active, onGo, onArchive, storedCount, hasBoard, variant }: Props) {
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
  return rail
    ? <nav aria-label="Điều hướng chính" className="sticky top-28 hidden h-[calc(100vh-8rem)] w-[88px] shrink-0 flex-col gap-1.5 self-start px-2 py-3 lg:flex print:hidden">{nav}</nav>
    : <nav aria-label="Điều hướng chính" className="fixed inset-x-0 bottom-0 z-30 flex gap-1 border-t border-brand-200/70 bg-white/95 px-2 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-md lg:hidden print:hidden">{nav}</nav>;
}
