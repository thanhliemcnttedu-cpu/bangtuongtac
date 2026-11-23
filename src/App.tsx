import { Suspense, lazy, useEffect, useState } from 'react';
import { Archive, LayoutDashboard, Plus } from 'lucide-react';
import { Logo } from './components/Logo';
import { BoardSwitcher } from './components/BoardSwitcher';
import { Dashboard } from './components/Dashboard';
import type { BoardData, ViewerRole } from './types/board';
import type { BoardTemplate } from './data/boardTemplates';
import { useAccounts } from './hooks/useAccounts';
import { useBoardStore } from './hooks/useBoardStore';
import { AccountMenu } from './components/AccountMenu';
import { BoardWorkspace } from './components/BoardWorkspace';
import { LoginScreen } from './components/LoginScreen';

// Nạp khi cần (chia nhỏ gói mã để trang mở nhanh).
const CreateBoardModal = lazy(() => import('./components/CreateBoardModal').then((m) => ({ default: m.CreateBoardModal })));
const ArchiveManagerModal = lazy(() => import('./components/ArchiveManagerModal').then((m) => ({ default: m.ArchiveManagerModal })));

export default function App() {
  const accounts = useAccounts();
  const store = useBoardStore(accounts.isReal ? accounts.current?.id ?? null : null, accounts.current?.email ?? 'Giáo viên');
  const [activeId, setActiveId] = useState('');
  const [role, setRole] = useState<ViewerRole>('owner');
  const [creating, setCreating] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  // Trang Tổng quan: bật sẵn khi giáo viên có nhiều bảng (từ 4 bảng của mình trở lên) để không phải chọn từng bảng.
  const [home, setHome] = useState<boolean | null>(null);

  const { boards } = store;
  // Bảng trong thùng rác không hiện; bảng đã đóng chỉ hiện khi đang được mở xem.
  const live = boards.filter((b) => !b.deletedAt);
  const board: BoardData | undefined =
    live.find((b) => b.id === activeId) ?? live.find((b) => b.shareToken === store.linkToken) ?? live.find((b) => !b.archivedAt);
  // Ghi nhớ bảng đang xem (kể cả khi chọn tự động) để đóng bảng xong vẫn ở lại bảng đó, thấy biểu ngữ "Bảng đã đóng".
  useEffect(() => { if (board && board.id !== activeId) setActiveId(board.id); }, [board, activeId]);
  // Cùng chương trình tập huấn thì đứng cạnh nhau; bảng được chia sẻ luôn ở cuối.
  const key = (b: BoardData): string => ((b.access ?? 'owner') !== 'owner' ? '￿￿' : b.program ?? '￿');
  const navBoards = live.filter((b) => !b.archivedAt || b.id === board?.id)
    .map((b, i) => ({ b, i })).sort((x, y) => key(x.b).localeCompare(key(y.b), 'vi') || x.i - y.i).map((x) => x.b);
  const owned = boards.filter((b) => (b.access ?? 'owner') === 'owner');
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
  const showHome = teacherNav && (home ?? ownCount >= 4);
  const pick = (id: string): void => { setActiveId(id); setHome(false); };

  const createBoard = async (title: string, template: BoardTemplate, extras: { lessonTitle?: string; program?: string }): Promise<void> => {
    const b = await store.createBoard(title, template, extras);
    setActiveId(b.id);
    setHome(false);
    setRole('owner');
    setCreating(false);
  };

  const renderBody = () => {
    if (showHome && !store.loading) return <Dashboard boards={navBoards} currentId={board?.id} canCreate={canCreate} onOpen={pick} onCreate={() => setCreating(true)}
      onArchive={async (ids) => { for (const id of ids) await store.setArchived(id, true); }} onTrash={async (ids) => { for (const id of ids) await store.setTrashed(id, true); }} />;
    if (board) return <BoardWorkspace key={board.id} board={board} store={store} role={effectiveRole} onSelectBoard={setActiveId} myEmail={accounts.current?.email ?? ''} />;
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

          {teacherNav && navBoards.length > 1 && (
            <button type="button" aria-pressed={showHome} onClick={() => setHome(!showHome)} className={`btn !min-h-[52px] !rounded-2xl border-[1.5px] ${showHome ? 'border-transparent bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-glow' : 'border-brand-200 bg-white text-brand-700 hover:-translate-y-0.5 hover:bg-brand-50'}`}><LayoutDashboard className="h-5 w-5" aria-hidden /> Tổng quan</button>
          )}
          {teacherNav && <BoardSwitcher boards={navBoards} currentId={showHome ? undefined : board?.id} onSelect={pick} />}

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

      {renderBody()}

      <Suspense fallback={null}>
      {creating && <CreateBoardModal extraTemplates={myTemplates} onCreate={createBoard} onClose={() => setCreating(false)} />}
      {archiveOpen && (
        <ArchiveManagerModal boards={owned} onClose={() => setArchiveOpen(false)} onOpen={pick}
          onReopen={(id) => store.setArchived(id, false)} onRestore={(id) => store.setTrashed(id, false)} onDeleteForever={store.deleteForever} />
      )}
      </Suspense>
    </div>
  );
}
