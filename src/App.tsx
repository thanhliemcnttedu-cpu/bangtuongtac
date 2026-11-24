import { Suspense, lazy, useEffect, useState } from 'react';
import { AlertTriangle, Archive, HelpCircle, Phone, Plus } from 'lucide-react';
import { Logo } from './components/Logo';
import { BoardSwitcher } from './components/BoardSwitcher';
import { NavRail } from './components/NavRail';
import type { NavPage } from './components/NavRail';
import { Dashboard } from './components/Dashboard';
import type { BoardData, ViewerRole } from './types/board';
import type { BoardTemplate } from './data/boardTemplates';
import { useAccounts } from './hooks/useAccounts';
import { useBoardStore } from './hooks/useBoardStore';
import { AccountMenu } from './components/AccountMenu';
import { BoardWorkspace } from './components/BoardWorkspace';
import { LoginScreen } from './components/LoginScreen';

// Nạp khi cần (chia nhỏ gói mã để trang mở nhanh).
const ReportsPage = lazy(() => import('./components/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const MyTasksPage = lazy(() => import('./components/MyTasksPage').then((m) => ({ default: m.MyTasksPage })));
const SystemHelpModal = lazy(() => import('./components/SystemHelpModal').then((m) => ({ default: m.SystemHelpModal })));
const CreateBoardModal = lazy(() => import('./components/CreateBoardModal').then((m) => ({ default: m.CreateBoardModal })));
const ArchiveManagerModal = lazy(() => import('./components/ArchiveManagerModal').then((m) => ({ default: m.ArchiveManagerModal })));

/** Giờ cập nhật bản này, đổi sang giờ máy của người xem: "23/11/2026 23:40". */
function buildStamp(): string {
  const d = new Date(__BUILD_TIME__);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function App() {
  const accounts = useAccounts();
  const store = useBoardStore(accounts.isReal ? accounts.current?.id ?? null : null, accounts.current?.email ?? 'Giáo viên');
  const [activeId, setActiveId] = useState('');
  const [role, setRole] = useState<ViewerRole>('owner');
  const [creating, setCreating] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  // Trang Tổng quan: bật sẵn khi giáo viên có nhiều bảng (từ 4 bảng của mình trở lên) để không phải chọn từng bảng.
  const [home, setHome] = useState<boolean | null>(null);
  // Trang "Công việc của tôi" (gom việc từ mọi bảng).
  const [myTasks, setMyTasks] = useState(false);
  const [reports, setReports] = useState(false);
  // Hỗ trợ: kiểm tra hệ thống + hướng dẫn nhanh; biểu ngữ hiện khi máy chủ còn thiếu phần cập nhật.
  const [help, setHelp] = useState<null | 'check' | 'guide' | 'drive'>(null);
  const [missingParts, setMissingParts] = useState(0);
  // Mở màn Google Drive của bảng đang xem từ hộp Hỗ trợ.
  const [driveRequest, setDriveRequest] = useState(false);

  const { boards } = store;
  // Bảng trong thùng rác không hiện; bảng đã đóng chỉ hiện khi đang được mở xem.
  // Bảng việc riêng ẩn khỏi danh sách bảng: chỉ xem qua trang "Công việc của tôi".
  const live = boards.filter((b) => !b.deletedAt && !b.settings.personal);
  const board: BoardData | undefined =
    live.find((b) => b.id === activeId) ?? live.find((b) => b.shareToken === store.linkToken) ?? live.find((b) => !b.archivedAt);
  // Ghi nhớ bảng đang xem (kể cả khi chọn tự động) để đóng bảng xong vẫn ở lại bảng đó, thấy biểu ngữ "Bảng đã đóng".
  useEffect(() => { if (board && board.id !== activeId) setActiveId(board.id); }, [board, activeId]);
  // Cùng chương trình tập huấn thì đứng cạnh nhau; bảng được chia sẻ luôn ở cuối.
  const key = (b: BoardData): string => ((b.access ?? 'owner') !== 'owner' ? '￿￿' : b.program ?? '￿');
  const navBoards = live.filter((b) => !b.archivedAt || b.id === board?.id)
    .map((b, i) => ({ b, i })).sort((x, y) => key(x.b).localeCompare(key(y.b), 'vi') || x.i - y.i).map((x) => x.b);
  const owned = boards.filter((b) => (b.access ?? 'owner') === 'owner' && !b.settings.personal);
  const storedCount = owned.filter((b) => b.archivedAt || b.deletedAt).length;
  const myTemplates: BoardTemplate[] = live.filter((b) => b.isTemplate && (b.access ?? 'owner') === 'owner').map((b) => ({
    id: `my-${b.id}`, name: b.title, description: `Mẫu của bạn · ${b.mode === 'classroom' ? 'Lớp học' : 'Tập huấn'}`,
    mode: b.mode, goals: b.goals, tasks: b.tasks.map((t) => t.label), settings: b.settings,
  }));

  // Vai trò hiệu lực theo quyền thật với bảng: chủ bảng / đồng quản lý theo lựa chọn vai trò để thử; người chỉ xem là giáo viên chỉ xem; còn lại là khách.
  const access = board?.access ?? 'owner';
  const effectiveRole: ViewerRole =
    access === 'viewer' ? 'viewer' : access === 'guest' ? (role === 'viewonly' ? 'viewonly' : 'guest') : role;
  const canCreate = store.isReal ? accounts.current !== null : true;

  const ownCount = owned.filter((b) => !b.deletedAt && !b.archivedAt).length;
  // Học sinh / khách chỉ thấy đúng bảng của mình: không hiện Tổng quan và danh sách bảng khác.
  const teacherNav = canCreate && !store.linkToken && effectiveRole !== 'guest' && effectiveRole !== 'viewonly';
  const showMy = teacherNav && myTasks;
  const showReports = teacherNav && !showMy && reports;
  const showHome = teacherNav && !showMy && !showReports && (home ?? ownCount >= 4);
  const activePage: NavPage = showMy ? 'my' : showReports ? 'reports' : showHome ? 'home' : 'board';
  const go = (p: NavPage): void => { setMyTasks(p === 'my'); setReports(p === 'reports'); if (p === 'home') setHome(true); if (p === 'board') setHome(false); };
  // Mật độ giao diện: giáo viên dùng bản gọn, học sinh và khách giữ bản to thân thiện.
  useEffect(() => { document.documentElement.dataset.density = teacherNav ? 'compact' : 'comfortable'; }, [teacherNav]);
  const pick = (id: string): void => { setActiveId(id); setHome(false); setMyTasks(false); setReports(false); };

  const createBoard = async (title: string, template: BoardTemplate, extras: { lessonTitle?: string; program?: string }): Promise<void> => {
    const b = await store.createBoard(title, template, extras);
    setActiveId(b.id);
    setHome(false);
    setMyTasks(false);
    setReports(false);
    setRole('owner');
    setCreating(false);
  };

  // Giáo viên đăng nhập bằng Supabase thật: tự kiểm tra một lần để báo sớm nếu quên chạy SQL cập nhật.
  useEffect(() => {
    if (!accounts.isReal || !accounts.current || store.linkToken) return;
    void import('./lib/systemCheck').then((m) => m.runSystemCheck()).then((r) => setMissingParts(r.filter((x) => x.state === 'missing').length)).catch(() => undefined);
  }, [accounts.isReal, accounts.current?.id, store.linkToken]);

  const renderBody = () => {
    if (showReports) return <Suspense fallback={<p className="p-10 text-center text-ink-2" role="status">Đang tải…</p>}><ReportsPage boards={owned} currentId={board?.id} /></Suspense>;
    if (showMy) return <Suspense fallback={<p className="p-10 text-center text-ink-2" role="status">Đang tải…</p>}><MyTasksPage store={store} myEmail={accounts.current?.email ?? ''} onOpenBoard={pick} /></Suspense>;
    if (showHome && !store.loading) return <Dashboard boards={navBoards} currentId={board?.id} canCreate={canCreate} onOpen={pick} onCreate={() => setCreating(true)}
      onArchive={async (ids) => { for (const id of ids) await store.setArchived(id, true); }} onTrash={async (ids) => { for (const id of ids) await store.setTrashed(id, true); }} />;
    if (board) return <BoardWorkspace key={board.id} board={board} store={store} role={effectiveRole} onSelectBoard={setActiveId} myEmail={accounts.current?.email ?? ''} openDrive={driveRequest} onOpenDriveHandled={() => setDriveRequest(false)} />;
    if (store.loading) return <p className="p-10 text-center text-ink-2" role="status">Đang tải dữ liệu…</p>;
    if (store.error) return <p className="p-10 text-center font-bold text-rose-700" role="alert">{store.error}</p>;
    if (!accounts.current) return <LoginScreen error={accounts.error} onLogin={() => void accounts.addAnother()} />;
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-extrabold">Chưa có bảng nào</h1>
        <p className="text-ink-2">Tạo bảng đầu tiên cho lớp học hoặc buổi tập huấn của bạn.</p>
        <button type="button" onClick={() => setCreating(true)} className="btn-primary"><Plus className="h-4 w-4" aria-hidden /> Tạo bảng đầu tiên</button>
      </main>
    );
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-brand-200/70 bg-white/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[min(100%,2800px)] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6 2xl:px-10">
          <div className="flex items-center gap-2">
            <Logo className="h-11 w-11" />
            <span className="text-base font-extrabold uppercase tracking-tight">Bảng tương tác</span>
          </div>

          {teacherNav && <BoardSwitcher boards={navBoards} currentId={showHome || showMy || showReports ? undefined : board?.id} onSelect={pick} />}

          <div className="ml-auto flex items-center gap-2">
            {canCreate && !store.linkToken && (
              <button type="button" onClick={() => setArchiveOpen(true)} className="btn-ghost relative" aria-label="Bảng đã đóng và thùng rác">
                <Archive className="h-4 w-4" aria-hidden />
                {storedCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-extrabold text-white">{storedCount}</span>}
              </button>
            )}
            {canCreate && !store.linkToken && (
              <button type="button" onClick={() => setCreating(true)} className="btn-ghost"><Plus className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">Tạo bảng</span></button>
            )}
            <AccountMenu accounts={accounts.accounts} current={accounts.current} isReal={accounts.isReal} error={accounts.error} role={role}
              onSwitch={(a) => void accounts.switchTo(a)} onAddAnother={() => void accounts.addAnother()} onLogout={() => void accounts.logout()} onRoleChange={setRole} />
          </div>
        </div>
      </header>

      {teacherNav && missingParts > 0 && (
        <div role="alert" className="flex flex-wrap items-center gap-2 border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-800">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> Máy chủ còn thiếu {missingParts} phần cập nhật nên một số tính năng chưa hoạt động đúng.
          <button type="button" onClick={() => setHelp('check')} className="btn-ghost btn-sm">Xem cách xử lý</button>
        </div>
      )}
      <div className="lg:flex">
      {teacherNav && <NavRail variant="rail" active={activePage} onGo={go} onArchive={() => setArchiveOpen(true)} storedCount={storedCount} hasBoard={!!board} />}
      <div className="min-w-0 flex-1">
      {renderBody()}

      <footer className="border-t border-brand-200/70 bg-white/70 px-4 pb-24 pt-5 text-center text-sm text-ink-2 backdrop-blur-sm print:hidden sm:pb-16">
        <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <span>Phần mềm được phát triển bởi <b className="font-extrabold text-ink">Nguyễn Thanh Liêm</b></span>
          <span className="hidden text-ink-3 sm:inline" aria-hidden>·</span>
          <a href="tel:0888358363" className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-bold text-brand-700 hover:bg-brand-50 hover:underline" aria-label="Gọi số 0888 358 363">
            <Phone className="h-4 w-4" aria-hidden /> 0888 358 363
          </a>
        </p>
        {teacherNav && <p className="mt-1"><button type="button" onClick={() => setHelp('guide')} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold text-brand-700 hover:bg-brand-50"><HelpCircle className="h-4 w-4" aria-hidden /> Hướng dẫn nhanh và kiểm tra hệ thống</button></p>}
        <p className="mt-1 text-xs text-ink-3">
          Phiên bản {__APP_VERSION__}{__BUILD_COMMIT__ ? ` (${__BUILD_COMMIT__})` : ''} · Cập nhật lúc <time dateTime={__BUILD_TIME__}>{buildStamp()}</time>
        </p>
      </footer>
      </div>
      </div>
      {teacherNav && <NavRail variant="bar" active={activePage} onGo={go} onArchive={() => setArchiveOpen(true)} storedCount={storedCount} hasBoard={!!board} />}

      <Suspense fallback={null}>
      {help && <SystemHelpModal isReal={accounts.isReal} initialTab={help} hasBoard={!!board && (board.access ?? 'owner') !== 'guest'} onOpenDrive={() => { setHelp(null); setMyTasks(false); setReports(false); setHome(false); setDriveRequest(true); }} onResult={setMissingParts} onClose={() => setHelp(null)} />}
      {creating && <CreateBoardModal extraTemplates={myTemplates} onCreate={createBoard} onClose={() => setCreating(false)} />}
      {archiveOpen && (
        <ArchiveManagerModal boards={owned} onClose={() => setArchiveOpen(false)} onOpen={pick}
          onReopen={(id) => store.setArchived(id, false)} onRestore={(id) => store.setTrashed(id, false)} onDeleteForever={store.deleteForever} />
      )}
      </Suspense>
    </div>
  );
}
