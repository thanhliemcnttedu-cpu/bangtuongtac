import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AlarmClock, AlertTriangle, Bell, BellRing, CalendarClock, CheckCheck, ListChecks, Settings2 } from 'lucide-react';
import type { TaskSubItem } from '../types/board';
import type { BoardStore } from '../hooks/useBoardStore';
import { buildMyTasks } from '../lib/myTasks';
import { SOON_OPTIONS, buildNotifications, loadPrefs, loadRead, loadShown, saveRead, savePrefs, saveShown } from '../lib/notifications';
import type { Notif, NotifKind, NotifPrefs } from '../lib/notifications';

const KIND_ICON: Record<NotifKind, typeof Bell> = { overdue: AlertTriangle, today: AlarmClock, soon: CalendarClock, report: CalendarClock, items: ListChecks };
const SEVERITY_TONE: Record<number, string> = { 3: 'bg-rose-50 text-rose-700', 2: 'bg-amber-50 text-amber-700', 1: 'bg-sky-50 text-sky-700' };

/**
 * Chuông thông báo trên thanh đầu trang: việc quá hạn, đến hạn hôm nay, sắp đến hạn, hạn báo cáo, đầu việc quá hạn.
 * Thông báo được tính từ công việc hiện có nên việc hoàn thành là tự hết; nhắc khi đang mở trang (nhắc đẩy khi đóng trang cần máy chủ riêng).
 */
export function NotificationBell({ store, myEmail, onOpen }: { store: BoardStore; myEmail: string; onOpen: (taskKey: string) => void }) {
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [prefs, setPrefs] = useState<NotifPrefs>(() => loadPrefs());
  const [read, setRead] = useState<Set<string>>(() => loadRead());
  const [now, setNow] = useState(() => Date.now());
  const [items, setItems] = useState<TaskSubItem[]>([]);
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission));
  const box = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>({});

  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(t); }, []);

  const tasks = useMemo(() => buildMyTasks(store.boards, myEmail, [], now), [store.boards, myEmail, now]);
  const itemTaskIds = useMemo(() => tasks.filter((t) => t.kind === 'personal' || t.kind === 'created').map((t) => t.taskId), [tasks]);
  const idsKey = itemTaskIds.join(',');

  /** Đầu việc thành phần quá hạn cũng nhắc: đọc lại mỗi 5 phút, lỗi (máy chủ chưa có bảng) thì bỏ qua. */
  const refreshItems = useCallback(async (): Promise<void> => {
    if (itemTaskIds.length === 0) { setItems([]); return; }
    try { setItems(await store.loadItemSummaries(itemTaskIds)); } catch { setItems([]); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, store.loadItemSummaries]);
  useEffect(() => { void refreshItems(); const t = window.setInterval(() => void refreshItems(), 300_000); return () => window.clearInterval(t); }, [refreshItems]);

  const notifs = useMemo(() => buildNotifications(tasks, items, now, prefs), [tasks, items, now, prefs]);
  const unread = notifs.filter((n) => !read.has(n.id));

  // Thông báo của trình duyệt: chỉ khi đang mở trang, mỗi thông báo hiện một lần.
  useEffect(() => {
    if (!prefs.browser || perm !== 'granted') return;
    const shown = loadShown();
    let n = 0;
    for (const x of unread) {
      if (shown.has(x.id) || n >= 3) continue;
      try { new Notification(x.title, { body: x.detail, tag: x.id }); } catch { /* trình duyệt không cho tạo thông báo */ }
      shown.add(x.id); n += 1;
    }
    if (n > 0) saveShown(shown);
  }, [unread, prefs.browser, perm]);

  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent): void => { const t = e.target as Node; if (box.current && !box.current.contains(t) && !panelRef.current?.contains(t)) setOpen(false); };
    const esc = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); window.removeEventListener('keydown', esc); };
  }, [open]);

  const markRead = (ids: string[]): void => { const next = new Set(read); ids.forEach((i) => next.add(i)); setRead(next); saveRead(next); };
  const updatePrefs = (p: Partial<NotifPrefs>): void => { const next = { ...prefs, ...p }; setPrefs(next); savePrefs(next); };
  const enableBrowser = async (): Promise<void> => {
    if (typeof Notification === 'undefined') return;
    const r = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    setPerm(r);
    updatePrefs({ browser: r === 'granted' });
  };
  const click = (n: Notif): void => { markRead([n.id]); setOpen(false); onOpen(n.taskKey); };

  const Icon = unread.length > 0 ? BellRing : Bell;
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => { if (!open && box.current) { const r = box.current.getBoundingClientRect(); setPos(window.innerWidth < 640 ? { left: 8, right: 8, bottom: 84 } : { top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right), width: 384 }); } setOpen(!open); }} aria-haspopup="dialog" aria-expanded={open} aria-label={unread.length > 0 ? `Thông báo, ${unread.length} chưa đọc` : 'Thông báo'} className="btn-ghost relative">
        <Icon className="h-4 w-4" aria-hidden />
        {unread.length > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-extrabold text-white">{unread.length > 99 ? '99+' : unread.length}</span>}
      </button>
      {open && createPortal(
        <div ref={panelRef} role="dialog" aria-label="Thông báo nhắc việc" style={pos} className="fixed z-[60] overflow-hidden rounded-2xl border-[1.5px] border-brand-200 bg-white shadow-lift">
          <div className="flex items-center justify-between gap-2 border-b border-brand-100 px-3 py-2">
            <p className="text-sm font-extrabold">Thông báo {notifs.length > 0 && <span className="font-semibold text-ink-2">({unread.length} chưa đọc)</span>}</p>
            <span className="flex gap-1">
              {unread.length > 0 && <button type="button" onClick={() => markRead(notifs.map((n) => n.id))} className="btn-ghost btn-sm max-lg:!min-h-[44px]"><CheckCheck className="h-3.5 w-3.5" aria-hidden /> Đã đọc hết</button>}
              <button type="button" onClick={() => setShowSettings(!showSettings)} aria-pressed={showSettings} aria-label="Cài đặt nhắc việc" className="btn-ghost btn-sm !px-2 max-lg:!min-h-[44px] max-lg:!min-w-[44px]"><Settings2 className="h-3.5 w-3.5" aria-hidden /></button>
            </span>
          </div>
          {showSettings && (
            <div className="space-y-2.5 border-b border-brand-100 bg-brand-50/50 px-3 py-3 text-sm">
              <div>
                <label htmlFor="nf-soon" className="field-label">Nhắc trước hạn</label>
                <select id="nf-soon" className="input !min-h-[40px]" value={prefs.soonHours} onChange={(e) => updatePrefs({ soonHours: Number(e.target.value) })}>{SOON_OPTIONS.map(([h, l]) => <option key={h} value={h}>{l}</option>)}</select>
              </div>
              {([['overdue', 'Cảnh báo việc quá hạn'], ['report', 'Nhắc hạn báo cáo / nộp'], ['items', 'Nhắc đầu việc quá hạn']] as const).map(([k, l]) => (
                <label key={k} className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={prefs[k]} onChange={(e) => updatePrefs({ [k]: e.target.checked })} /> {l}</label>
              ))}
              <div>
                <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={prefs.browser && perm === 'granted'} disabled={perm === 'unsupported' || perm === 'denied'}
                  onChange={(e) => { if (e.target.checked) void enableBrowser(); else updatePrefs({ browser: false }); }} /> Hiện thông báo của trình duyệt</label>
                <p className="mt-1 text-xs text-ink-2">{perm === 'unsupported' ? 'Trình duyệt này không hỗ trợ thông báo.' : perm === 'denied' ? 'Bạn đã chặn thông báo cho trang này. Mở biểu tượng khóa cạnh địa chỉ trang để cho phép.' : 'Chỉ hiện khi đang mở phần mềm. Cài đặt này chỉ áp dụng cho thiết bị đang dùng.'}</p>
              </div>
            </div>
          )}
          <ul className="max-h-[60vh] divide-y divide-brand-100 overflow-y-auto" aria-label="Danh sách thông báo">
            {notifs.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-2">Không có việc nào quá hạn hay sắp đến hạn.</li>}
            {notifs.map((n) => {
              const I = KIND_ICON[n.kind];
              const isRead = read.has(n.id);
              return (
                <li key={n.id}>
                  <button type="button" onClick={() => click(n)} className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-brand-50 max-lg:min-h-[56px] ${isRead ? 'opacity-70' : ''}`}>
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${SEVERITY_TONE[n.severity]}`}><I className="h-4 w-4" aria-hidden /></span>
                    <span className="min-w-0 flex-1"><span className={`block text-sm ${isRead ? 'font-semibold' : 'font-extrabold'}`}>{n.title}</span><span className="block text-xs text-ink-2">{n.detail}</span></span>
                    {!isRead && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" aria-label="Chưa đọc" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}
