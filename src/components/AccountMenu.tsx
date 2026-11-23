import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, LogOut, UserPlus } from 'lucide-react';
import type { GmailAccount, ViewerRole } from '../types/board';
import { initials } from '../lib/format';

interface Props {
  accounts: GmailAccount[];
  current: GmailAccount | null;
  isReal: boolean;
  error: string;
  role: ViewerRole;
  onSwitch: (a: GmailAccount) => void;
  onAddAnother: () => void;
  onLogout: () => void;
  onRoleChange: (r: ViewerRole) => void;
}

export function Avatar({ account, size = 36 }: { account: GmailAccount; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-extrabold text-white"
      style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${account.hue} 75% 55%), hsl(${(account.hue + 35) % 360} 70% 42%))` }}
      aria-hidden
    >
      {initials(account.name)}
    </span>
  );
}

const ROLES: { id: ViewerRole; label: string }[] = [
  { id: 'owner', label: 'Giáo viên (chủ bảng)' },
  { id: 'guest', label: 'Học sinh / học viên (link nộp bài)' },
  { id: 'viewonly', label: 'Phụ huynh / dự giờ (chỉ xem)' },
];

export function AccountMenu({ accounts, current, isReal, error, role, onSwitch, onAddAnother, onLogout, onRoleChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu"
        className="flex min-h-[44px] items-center gap-2 rounded-full border-[1.5px] border-brand-200 bg-white py-1 pl-1 pr-3 transition duration-200 hover:border-brand-400">
        {current ? <Avatar account={current} /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-700"><UserPlus className="h-4 w-4" aria-hidden /></span>}
        <span className="hidden max-w-[160px] truncate text-sm font-bold sm:block">{current ? current.name : 'Đăng nhập'}</span>
        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <div role="menu" className="pop-in absolute right-0 z-40 mt-2 w-[min(340px,92vw)] overflow-hidden rounded-3xl border border-brand-200 bg-white shadow-lift">
          <div className="border-b border-brand-100 px-4 py-2.5 text-xs font-bold text-ink-2">
            Tài khoản Google {isReal ? '' : '(bản mẫu, chưa nối Supabase)'}
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {accounts.length === 0 && <li className="px-4 py-3 text-sm text-ink-2">Chưa có tài khoản nào. Bấm “Thêm tài khoản Google”.</li>}
            {accounts.map((a) => (
              <li key={a.email}>
                <button type="button" role="menuitem" onClick={() => { onSwitch(a); setOpen(false); }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-brand-50">
                  <Avatar account={a} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{a.name}</span>
                    <span className="block truncate text-xs text-ink-2">{a.email}</span>
                  </span>
                  {current?.email === a.email && <Check className="h-4 w-4 text-brand-700" aria-label="Đang dùng" />}
                </button>
              </li>
            ))}
          </ul>
          <div className="space-y-1 border-t border-brand-100 p-2">
            <button type="button" role="menuitem" onClick={() => { onAddAnother(); setOpen(false); }} className="btn-ghost w-full justify-start">
              <UserPlus className="h-4 w-4" aria-hidden /> Thêm / chuyển tài khoản Google khác
            </button>
            {current && (
              <button type="button" role="menuitem" onClick={() => { onLogout(); setOpen(false); }} className="btn w-full justify-start text-rose-700 hover:bg-rose-50">
                <LogOut className="h-4 w-4" aria-hidden /> Đăng xuất
              </button>
            )}
          </div>
          {error && <p className="px-4 pb-2 text-xs font-bold text-rose-700" role="alert">{error}</p>}

          <div className="border-t border-brand-100 bg-brand-50/60 p-3">
            <label htmlFor="role-select" className="mb-1 block text-xs font-extrabold text-ink-2">Xem bảng với vai trò (để thử quyền)</label>
            <select id="role-select" value={role} onChange={(e) => onRoleChange(e.target.value as ViewerRole)} className="input !min-h-[40px]">
              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
