import { useEffect, useState } from 'react';
import { Archive, GraduationCap, Plus, School, Share2, Users } from 'lucide-react';
import type { BoardData, ViewerRole } from './types/board';
import type { BoardTemplate } from './data/boardTemplates';
import { useAccounts } from './hooks/useAccounts';
import { useBoardStore } from './hooks/useBoardStore';
import { AccountMenu } from './components/AccountMenu';
import { BoardWorkspace } from './components/BoardWorkspace';
import { CreateBoardModal } from './components/CreateBoardModal';
import { LoginScreen } from './components/LoginScreen';
import { ArchiveManagerModal } from './components/ArchiveManagerModal';

export default function App() {
  const accounts = useAccounts();
  const store = useBoardStore(accounts.isReal ? accounts.current?.id ?? null : null, accounts.current?.email ?? 'Giáo viên');
  const [activeId, setActiveId] = useState('');
  const [role, setRole] = useState<ViewerRole>('owner');
  const [creating, setCreating] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

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

  const createBoard = async (title: string, template: BoardTemplate, extras: { lessonTitle?: string; program?: string }): Promise<void> => {
    const b = await store.createBoard(title, template, extras);
    setActiveId(b.id);
    setRole('owner');
    setCreating(false);
  };

  const renderBody = () => {
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
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-glow"><GraduationCap className="h-5 w-5" aria-hidden /></span>
            <span className="text-base font-extrabold tracking-tight">Bảng tương tác</span>
          </div>

          {navBoards.length > 0 && (
            <nav aria-label="Chọn bảng" className="order-3 flex w-full gap-1 overflow-x-auto rounded-full bg-brand-50 p-1 sm:order-none sm:w-auto sm:max-w-[60vw]">
              {navBoards.map((b, i) => {
                const on = board?.id === b.id;
                const shared = (b.access ?? 'owner') !== 'owner';
                const Icon = shared ? Share2 : b.mode === 'classroom' ? School : Users;
                const firstShared = shared && !navBoards.slice(0, i).some((x) => (x.access ?? 'owner') !== 'owner');
                return (
                  <span key={b.id} className="flex shrink-0 items-center gap-1">
                    {b.program && b.program !== navBoards[i - 1]?.program && <span className="chip shrink-0 bg-violet-100 text-violet-800 ring-violet-200" title={`Chương trình: ${b.program}`}>{b.program}</span>}
                    {firstShared && i > 0 && <span className="mx-1 h-5 w-px bg-brand-300" aria-hidden />}
                    <button type="button" aria-pressed={on} onClick={() => setActiveId(b.id)}
                      title={shared ? `${b.title} — được chia sẻ bởi ${b.ownerEmail ?? 'giáo viên khác'}` : b.title}
                      className={`btn btn-sm !min-h-[40px] shrink-0 flex-1 sm:flex-none ${on ? 'bg-white text-brand-700 shadow-soft' : 'text-ink-2 hover:bg-white/70'} ${shared ? 'italic' : ''}`}>
                      <Icon className="h-4 w-4" aria-hidden />
                      <span className="max-w-[160px] truncate">{store.isReal || shared ? b.title : b.mode === 'classroom' ? 'Lớp học' : 'Tập huấn'}</span>
                    </button>
                  </span>
                );
              })}
            </nav>
          )}

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

      {creating && <CreateBoardModal extraTemplates={myTemplates} onCreate={createBoard} onClose={() => setCreating(false)} />}
      {archiveOpen && (
        <ArchiveManagerModal boards={owned} onClose={() => setArchiveOpen(false)} onOpen={setActiveId}
          onReopen={(id) => store.setArchived(id, false)} onRestore={(id) => store.setTrashed(id, false)} onDeleteForever={store.deleteForever} />
      )}
    </div>
  );
}
