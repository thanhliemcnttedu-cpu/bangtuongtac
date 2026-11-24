import { useMemo, useState } from 'react';
import { AlertTriangle, Archive, CalendarClock, CheckSquare, ClipboardCheck, GraduationCap, Inbox, Plus, School, Search, Share2, Trash2, Users, X } from 'lucide-react';
import type { BoardData } from '../types/board';
import { boardStats, overviewTotals } from '../lib/dashboard';
import type { BoardStats } from '../lib/dashboard';
import { countdown, formatDateTime } from '../lib/lessons';
import { ConfirmModal } from './ConfirmModal';

interface Props {
  boards: BoardData[];
  currentId?: string;
  canCreate: boolean;
  onOpen: (id: string) => void;
  onCreate: () => void;
  /** Đóng (lưu trữ) hoặc chuyển vào thùng rác nhiều bảng cùng lúc. */
  onArchive?: (ids: string[]) => Promise<void>;
  onTrash?: (ids: string[]) => Promise<void>;
}

type Filter = 'all' | 'todo' | 'due' | 'class' | 'training' | 'shared';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Tất cả' }, { id: 'todo', label: 'Cần duyệt / sửa' }, { id: 'due', label: 'Sắp đến hạn' },
  { id: 'class', label: 'Lớp học' }, { id: 'training', label: 'Tập huấn' }, { id: 'shared', label: 'Được chia sẻ' },
];


function Kpi({ icon: Icon, value, label, tone }: { icon: typeof Inbox; value: number; label: string; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-3xl border-[1.5px] border-brand-100 bg-white/90 p-4 shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-lift">
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tone}`}><Icon className="h-6 w-6" aria-hidden /></span>
      <span className="min-w-0">
        <span className="block text-2xl font-extrabold leading-none">{value}</span>
        <span className="mt-1 block text-xs font-bold text-ink-2">{label}</span>
      </span>
    </div>
  );
}

function BoardCard({ b, s, current, onOpen, now }: { b: BoardData; s: BoardStats; current: boolean; onOpen: () => void; now: number }) {
  const shared = (b.access ?? 'owner') !== 'owner';
  const Icon = shared ? Share2 : b.mode === 'classroom' ? School : Users;
  const pct = s.rosterSize > 0 ? Math.round((s.submitters / s.rosterSize) * 100) : 0;
  return (
    <button type="button" onClick={onOpen} aria-current={current ? 'true' : undefined}
      className={`group relative flex h-full flex-col gap-3 overflow-hidden rounded-3xl border-[1.5px] bg-white p-4 text-left shadow-soft transition duration-300 hover:-translate-y-1.5 hover:shadow-lift ${current ? 'border-brand-600 ring-2 ring-brand-200' : 'border-brand-100 hover:border-brand-300'}`}>
      <span className={`absolute inset-x-0 top-0 h-1.5 ${b.mode === 'classroom' ? 'bg-gradient-to-r from-brand-500 to-teal2-500' : 'bg-gradient-to-r from-violet-500 to-brand-500'}`} aria-hidden />
      <span className="flex items-start gap-3 pt-1">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition duration-300 group-hover:-rotate-6 group-hover:scale-110 ${b.mode === 'classroom' ? 'bg-brand-100 text-brand-700' : 'bg-violet-100 text-violet-700'}`}><Icon className="h-6 w-6" aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block text-base font-extrabold leading-snug">{b.title}</span>
          <span className="block truncate text-xs text-ink-2">{shared ? `Của ${b.ownerEmail ?? 'giáo viên khác'}` : b.mode === 'classroom' ? 'Lớp học' : 'Tập huấn'}{b.archivedAt ? ' · đã đóng' : ''}</span>
        </span>
      </span>

      <span className="flex flex-wrap gap-1.5">
        {s.pending > 0 && <span className="chip bg-amber-100 text-amber-900 ring-amber-200"><Inbox className="h-3.5 w-3.5" aria-hidden /> {s.pending} chờ duyệt</span>}
        {s.needsEdit > 0 && <span className="chip bg-rose-100 text-rose-800 ring-rose-200">{s.needsEdit} cần sửa</span>}
        {s.pending === 0 && s.needsEdit === 0 && <span className="chip bg-emerald-100 text-emerald-800 ring-emerald-200"><ClipboardCheck className="h-3.5 w-3.5" aria-hidden /> Không còn việc chờ</span>}
        {s.overdue > 0 && s.total === 0 && <span className="chip bg-slate-100 text-slate-700 ring-slate-200">Chưa có bài nộp</span>}
      </span>

      <span className="mt-auto block">
        <span className="mb-1 flex items-center justify-between text-xs font-bold text-ink-2">
          <span>{s.rosterSize > 0 ? `${s.submitters}/${s.rosterSize} đã nộp` : `${s.total} bài nộp`}</span>
          {s.rosterSize > 0 && <span>{pct}%</span>}
        </span>
        <span className="block h-2 overflow-hidden rounded-full bg-brand-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Tỉ lệ đã nộp">
          <span className="block h-full rounded-full bg-gradient-to-r from-brand-500 to-teal2-500 transition-all duration-700" style={{ width: `${s.rosterSize > 0 ? pct : Math.min(100, s.total * 5)}%` }} />
        </span>
        <span className="mt-2 flex items-center gap-1 text-xs text-ink-2">
          <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {s.nextDue ? <span className="truncate">Hạn gần nhất: <b>{formatDateTime(s.nextDue.at)}</b> ({countdown(s.nextDue.at, now)})</span> : <span>Chưa có hạn nộp sắp tới</span>}
        </span>
      </span>
    </button>
  );
}

/**
 * Trang Tổng quan cho giáo viên quản lý nhiều lớp và nhiều chương trình: số liệu chung, danh sách việc cần xử lý,
 * rồi các lớp và từng chương trình tập huấn dưới dạng thẻ có tiến độ. Bấm thẻ để vào bảng.
 */
export function Dashboard({ boards, currentId, canCreate, onOpen, onCreate, onArchive, onTrash }: Props) {
  const [q, setQ] = useState('');
  // Chế độ chọn bảng: tích nhiều bảng của mình để đóng hoặc chuyển vào thùng rác.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [confirm, setConfirm] = useState<'archive' | 'trash' | null>(null);
  const [toast, setToast] = useState('');
  const canBulk = !!(onArchive || onTrash);
  const toggle = (id: string): void => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const leave = (): void => { setSelecting(false); setPicked(new Set()); };
  const [filter, setFilter] = useState<Filter>('all');
  const now = Date.now();
  const rows = useMemo(() => boards.map((b) => ({ b, s: boardStats(b, now) })), [boards, now]);
  const totals = useMemo(() => overviewTotals(boards, now), [boards, now]);

  const visible = rows.filter(({ b, s }) => {
    const term = q.trim().toLowerCase();
    if (term && !b.title.toLowerCase().includes(term) && !(b.program ?? '').toLowerCase().includes(term)) return false;
    if (filter === 'todo') return s.pending + s.needsEdit > 0;
    if (filter === 'due') return s.dueSoon > 0;
    if (filter === 'class') return b.mode === 'classroom' && (b.access ?? 'owner') === 'owner';
    if (filter === 'training') return b.mode === 'training' && (b.access ?? 'owner') === 'owner';
    if (filter === 'shared') return (b.access ?? 'owner') !== 'owner';
    return true;
  });

  const own = visible.filter(({ b }) => (b.access ?? 'owner') === 'owner');
  const classes = own.filter(({ b }) => b.mode === 'classroom');
  const programMap = new Map<string, typeof own>();
  own.filter(({ b }) => b.mode === 'training').forEach((r) => { const k = r.b.program ?? 'Lớp tập huấn lẻ (chưa thuộc chương trình)'; programMap.set(k, [...(programMap.get(k) ?? []), r]); });
  const shared = visible.filter(({ b }) => (b.access ?? 'owner') !== 'owner');
  const urgent = [...rows].filter(({ b, s }) => (b.access ?? 'owner') !== 'viewer' && s.pending + s.needsEdit > 0).sort((x, y) => y.s.pending - x.s.pending).slice(0, 5);

  const grid = 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 min-[1700px]:grid-cols-4 min-[2300px]:grid-cols-5';
  const ownIds = own.map(({ b }) => b.id);
  const pickedIds = ownIds.length > 0 ? [...picked].filter((id) => boards.some((b) => b.id === id)) : [];
  const allOn = ownIds.length > 0 && ownIds.every((id) => picked.has(id));
  const cards = (list: typeof own) => (
    <div className={grid}>
      {list.map(({ b, s }) => {
        const mine = (b.access ?? 'owner') === 'owner';
        const on = picked.has(b.id);
        return (
          <div key={b.id} className={`relative h-full rounded-3xl transition ${selecting && on ? 'ring-4 ring-amber-300' : ''} ${selecting && !mine ? 'opacity-50' : ''}`}>
            <BoardCard b={b} s={s} now={now} current={b.id === currentId} onOpen={() => (selecting ? (mine ? toggle(b.id) : undefined) : onOpen(b.id))} />
            {selecting && mine && (
              <label className={`absolute right-3 top-4 z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full shadow-lift ring-2 ${on ? 'bg-amber-400 ring-white' : 'bg-white/95 ring-brand-200 hover:ring-brand-400'}`} title="Chọn bảng này">
                <input type="checkbox" className="h-5 w-5 cursor-pointer accent-amber-600" checked={on} onChange={() => toggle(b.id)} aria-label={`Chọn bảng ${b.title}`} />
              </label>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <main className="mx-auto w-full max-w-[min(100%,2800px)] space-y-6 px-4 py-5 pb-28 sm:px-6 2xl:px-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[clamp(1.5rem,3vw,2.2rem)] font-extrabold leading-tight tracking-tight">Tổng quan</h1>
          <p className="text-sm text-ink-2">{totals.classes} lớp · {totals.programs} chương trình tập huấn ({totals.trainings} lớp tập huấn){totals.shared > 0 ? ` · ${totals.shared} bảng được chia sẻ` : ''}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canBulk && own.length > 0 && <button type="button" aria-pressed={selecting} onClick={() => (selecting ? leave() : setSelecting(true))} className={`btn-ghost ${selecting ? '!border-amber-400 !bg-amber-50' : ''}`}><CheckSquare className="h-4 w-4" aria-hidden /> {selecting ? 'Thoát chọn bảng' : 'Chọn bảng'}</button>}
          {canCreate && <button type="button" onClick={onCreate} className="btn-primary"><Plus className="h-4 w-4" aria-hidden /> Tạo bảng mới</button>}
        </div>
      </header>

      <section aria-label="Số liệu chung" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={School} value={totals.classes} label="Lớp học" tone="bg-brand-100 text-brand-700" />
        <Kpi icon={GraduationCap} value={totals.programs} label="Chương trình tập huấn" tone="bg-violet-100 text-violet-700" />
        <Kpi icon={Inbox} value={totals.pending} label="Bài đang chờ duyệt" tone="bg-amber-100 text-amber-800" />
        <Kpi icon={CalendarClock} value={totals.dueSoon} label="Hạn nộp trong 3 ngày" tone="bg-rose-100 text-rose-700" />
      </section>

      {urgent.length > 0 && (
        <section aria-label="Việc cần xử lý" className="rounded-3xl border-[1.5px] border-amber-200 bg-amber-50/80 p-4 shadow-soft">
          <h2 className="mb-2 flex items-center gap-2 text-base font-extrabold text-amber-900"><AlertTriangle className="h-5 w-5" aria-hidden /> Cần xử lý trước</h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {urgent.map(({ b, s }) => (
              <li key={b.id} className="min-w-0">
                <button type="button" onClick={() => onOpen(b.id)} className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2.5 text-left shadow-soft transition duration-200 hover:-translate-y-0.5 hover:shadow-lift">
                  <span className="min-w-0 truncate text-sm font-bold">{b.title}</span>
                  <span className="shrink-0 text-xs font-extrabold text-amber-900">{s.pending} duyệt{s.needsEdit > 0 ? ` · ${s.needsEdit} sửa` : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Tìm kiếm và lọc bảng" className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm lớp, chương trình…" aria-label="Tìm bảng" className="input !pl-9" />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}
              className={`btn btn-sm !min-h-[40px] max-lg:!min-h-[44px] border-[1.5px] ${filter === f.id ? 'border-transparent bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-glow' : 'border-brand-200 bg-white text-ink hover:-translate-y-0.5 hover:bg-brand-50'}`}>{f.label}</button>
          ))}
        </div>
      </section>

      {visible.length === 0 && <p className="rounded-3xl bg-white/80 p-8 text-center text-ink-2 shadow-soft">Không có bảng nào khớp bộ lọc.</p>}

      {classes.length > 0 && (
        <section aria-label="Các lớp học">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold"><School className="h-5 w-5 text-brand-600" aria-hidden /> Lớp học <span className="chip bg-brand-100 text-brand-800 ring-brand-200">{classes.length}</span></h2>
          {cards(classes)}
        </section>
      )}

      {[...programMap.entries()].map(([name, list]) => {
        const pend = list.reduce((n, r) => n + r.s.pending, 0);
        return (
          <section key={name} aria-label={`Chương trình ${name}`}>
            <h2 className="mb-3 flex flex-wrap items-center gap-2 text-lg font-extrabold">
              <GraduationCap className="h-5 w-5 text-violet-600" aria-hidden /> {name}
              <span className="chip bg-violet-100 text-violet-800 ring-violet-200">{list.length} lớp tập huấn</span>
              {pend > 0 && <span className="chip bg-amber-100 text-amber-900 ring-amber-200">{pend} chờ duyệt</span>}
            </h2>
            {cards(list)}
          </section>
        );
      })}

      {shared.length > 0 && (
        <section aria-label="Bảng được chia sẻ">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold"><Share2 className="h-5 w-5 text-ink-2" aria-hidden /> Được chia sẻ với tôi <span className="chip bg-slate-100 text-slate-700 ring-slate-200">{shared.length}</span></h2>
          {cards(shared)}
        </section>
      )}

      {selecting && (
        <div className="fixed inset-x-3 bottom-4 z-30 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-3xl border-[1.5px] border-amber-300 bg-amber-50/95 px-4 py-3 shadow-lift backdrop-blur" role="toolbar" aria-label="Thao tác với các bảng đã chọn">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-ink">
            <input type="checkbox" className="h-5 w-5 cursor-pointer accent-amber-600" checked={allOn} onChange={() => setPicked(allOn ? new Set() : new Set(ownIds))} />
            Chọn tất cả ({ownIds.length})
          </label>
          <span className="text-sm font-extrabold text-amber-900" aria-live="polite">{pickedIds.length > 0 ? `Đã chọn ${pickedIds.length} bảng` : 'Bấm vào thẻ hoặc ô tích để chọn bảng'}</span>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {onArchive && <button type="button" disabled={pickedIds.length === 0} onClick={() => setConfirm('archive')} className="btn-ghost btn-sm"><Archive className="h-3.5 w-3.5" aria-hidden /> Đóng bảng</button>}
            {onTrash && <button type="button" disabled={pickedIds.length === 0} onClick={() => setConfirm('trash')} className="btn btn-sm border-[1.5px] border-rose-300 bg-white text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" aria-hidden /> Chuyển vào thùng rác</button>}
            <button type="button" onClick={leave} className="btn-ghost btn-sm"><X className="h-3.5 w-3.5" aria-hidden /> Thoát</button>
          </span>
        </div>
      )}
      {toast && <p role="status" className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white shadow-lift">{toast}</p>}

      {confirm === 'trash' && onTrash && (
        <ConfirmModal title={`Chuyển ${pickedIds.length} bảng vào thùng rác?`} confirmLabel={`Chuyển ${pickedIds.length} bảng`} danger onClose={() => setConfirm(null)}
          onConfirm={async () => { await onTrash(pickedIds); setConfirm(null); setToast(`Đã chuyển ${pickedIds.length} bảng vào thùng rác.`); window.setTimeout(() => setToast(''), 3500); leave(); }}>
          <p>Các bảng được chọn sẽ ẩn khỏi danh sách và <b className="text-ink">link chia sẻ ngừng hoạt động</b>. Bạn có thể khôi phục trong 30 ngày ở nút “Bảng đã đóng & thùng rác”; sau đó bảng tự xóa vĩnh viễn.</p>
          <ul className="mt-2 list-disc pl-5 text-sm">{pickedIds.slice(0, 6).map((id) => <li key={id}>{boards.find((b) => b.id === id)?.title}</li>)}{pickedIds.length > 6 && <li>… và {pickedIds.length - 6} bảng khác</li>}</ul>
        </ConfirmModal>
      )}
      {confirm === 'archive' && onArchive && (
        <ConfirmModal title={`Đóng ${pickedIds.length} bảng?`} confirmLabel={`Đóng ${pickedIds.length} bảng`} onClose={() => setConfirm(null)}
          onConfirm={async () => { await onArchive(pickedIds); setConfirm(null); setToast(`Đã đóng ${pickedIds.length} bảng.`); window.setTimeout(() => setToast(''), 3500); leave(); }}>
          <p>Các bảng được chọn ngừng nhận bài mới và bình chọn. Mọi bài, điểm và báo cáo vẫn giữ nguyên; mở lại được ở “Bảng đã đóng & thùng rác”.</p>
        </ConfirmModal>
      )}
    </main>
  );
}
