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
  // Chạy thử không cần .env: thêm ?demo=login vào địa chỉ để xem trang chủ dành cho học sinh (nhập mã 6 số).
  const [demoLogin, setDemoLogin] = useState(() => !store.isReal && /[?&]demo=login/.test(window.location.search));

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
  const teacherNav = canCreate && !store.linkToken && !demoLogin && effectiveRole !== 'guest' && effectiveRole !== 'viewonly';
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

  // Học sinh vào lớp theo mã 6 số của thầy cô: tra mã ra link của bảng rồi mở như khi bấm link.
  const openToken = (token: string): void => {
    if (store.isReal) { window.location.assign(`/b/${token}`); return; }
    const target = boards.find((b) => b.shareToken === token);
    if (target) { setActiveId(target.id); setRole('guest'); setHome(false); setDemoLogin(false); }
  };
  const joinByCode = async (code: string): Promise<void> => {
    const token = await store.resolveJoinCode(code);
    if (!token) throw new Error('Mã này chưa đúng hoặc cô đã tắt vào lớp bằng mã. Em kiểm tra lại mã 6 số của cô nhé.');
    openToken(token);
  };

  const renderBody = () => {
    if (demoLogin) return <LoginScreen error="" onLogin={() => setDemoLogin(false)} onJoinCode={joinByCode} onOpenLink={openToken} />;
    if (showReports) return <Suspense fallback={<p className="p-10 text-center text-ink-2" role="status">Đang tải…</p>}><ReportsPage boards={owned} currentId={board?.id} /></Suspense>;
    if (showMy) return <Suspense fallback={<p className="p-10 text-center text-ink-2" role="status">Đang tải…</p>}><MyTasksPage store={store} myEmail={accounts.current?.email ?? ''} onOpenBoard={pick} /></Suspense>;
    if (showHome && !store.loading) return <Dashboard boards={navBoards} currentId={board?.id} canCreate={canCreate} onOpen={pick} onCreate={() => setCreating(true)}
      onArchive={async (ids) => { for (const id of ids) await store.setArchived(id, true); }} onTrash={async (ids) => { for (const id of ids) await store.setTrashed(id, true); }} />;
    if (board) return <BoardWorkspace key={board.id} board={board} store={store} role={effectiveRole} onSelectBoard={setActiveId} myEmail={accounts.current?.email ?? ''} openDrive={driveRequest} onOpenDriveHandled={() => setDriveRequest(false)} />;
    if (store.loading) return <p className="p-10 text-center text-ink-2" role="status">Đang tải dữ liệu…</p>;
    if (store.error) return <p className="p-10 text-center font-bold text-rose-700" role="alert">{store.error}</p>;
    if (!accounts.current) return <LoginScreen error={accounts.error} onLogin={() => void accounts.addAnother()} onJoinCode={joinByCode} onOpenLink={openToken} />;
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
            {canCreate && !store.linkToken && !demoLogin && (
              <button type="button" onClick={() => setArchiveOpen(true)} className="btn-ghost relative" aria-label="Bảng đã đóng và thùng rác">
                <Archive className="h-4 w-4" aria-hidden />
                {storedCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-extrabold text-white">{storedCount}</span>}
              </button>
            )}
            {canCreate && !store.linkToken && !demoLogin && (
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

      {/* Chân trang mỏng một hàng: nền xanh đêm chuyển sắc cùng tông với màu chính, chữ sáng; trên điện thoại gọn thành hai dòng. */}
      <footer className="bg-gradient-to-r from-[#0a1730] via-[#0f2a5c] to-[#0b4fd0] px-4 pb-[88px] pt-2.5 text-sm text-white/80 print:hidden sm:pb-3 sm:pt-3">
        <div className="mx-auto flex max-w-[min(100%,2800px)] flex-wrap items-center justify-center gap-x-4 gap-y-1 sm:justify-between 2xl:px-6">
          <p className="flex flex-wrap items-center justify-center gap-x-2">
            <span>Phát triển bởi <b className="font-extrabold text-white">Nguyễn Thanh Liêm</b></span>
            <a href="tel:0888358363" className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-white/10 px-3 font-bold text-white ring-1 ring-white/20 transition hover:bg-white/20" aria-label="Gọi số 0888 358 363">
              <Phone className="h-4 w-4" aria-hidden /> 0888 358 363
            </a>
          </p>
          <p className="flex flex-wrap items-center justify-center gap-x-3 text-xs">
            {teacherNav && <button type="button" onClick={() => setHelp('guide')} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-2 font-bold text-white hover:bg-white/10"><HelpCircle className="h-4 w-4" aria-hidden /> Hướng dẫn<span className="hidden sm:inline">&nbsp;nhanh và kiểm tra hệ thống</span></button>}
            <span className="text-white/60">v{__APP_VERSION__}{__BUILD_COMMIT__ ? ` (${__BUILD_COMMIT__})` : ''} · <time dateTime={__BUILD_TIME__}>{buildStamp()}</time></span>
          </p>
        </div>
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
