import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { KeyRound, ListChecks, Lock, Pencil, Plus, Presentation, Settings, Share2, Trash2 } from 'lucide-react';
import type {
  BoardData, BoardRow, CardLayoutPatch, CardStatus, FilterState, Lesson, PinnedResource, RosterMember, SubmissionCard, TaskItem, ViewMode, ViewerRole,
} from '../types/board';
import type { BoardStore } from '../hooks/useBoardStore';
import { EMPTY_FILTERS, applyFilters, buildRows, computeKpis, isFiltered, sortRows } from '../lib/boardLogic';
import { BACKGROUNDS, FONTS, ICONS } from '../lib/boardSettings';
import type { BoardMetaPatch } from '../lib/boardApi';
import { DataBoardSummary } from './DataBoardSummary';
import { MultiFilterBar } from './MultiFilterBar';
import { LessonsPanel } from './LessonsPanel';
import { LessonModal } from './LessonModal';
import { TaskModal } from './TaskModal';
import { MaterialModal } from './MaterialModal';
import { isAssigned } from '../lib/lessons';
import { GridAndColumnsView } from './GridAndColumnsView';
import { SubmissionTableView } from './SubmissionTableView';
import { GroupSummaryView } from './GroupSummaryView';
import { TimelineView } from './views/TimelineView';
import { SlidesView } from './views/SlidesView';
import { CanvasView } from './views/CanvasView';
import { MindMapView } from './views/MindMapView';
import { VennView } from './views/VennView';

// Bản đồ (Leaflet) chỉ nạp khi mở kiểu xem Bản đồ.
const MapView = lazy(() => import('./views/MapView'));
import { QuickPostModal } from './QuickPostModal';
import type { PostDraft } from '../hooks/usePostDraft';
import { ShareBoardModal } from './ShareBoardModal';
import { SlidePresentationModal } from './SlidePresentationModal';
import { RosterImportModal } from './RosterImportModal';
import { BoardSettingsModal } from './BoardSettingsModal';
import type { FeedbackActions } from './FeedbackPanel';
import { getMyCardIds } from '../lib/peer';
import { BoardMenu } from './BoardMenu';
import { ConfirmModal } from './ConfirmModal';
import { DriveBackupModal } from './DriveBackupModal';
import { EditCodeModal } from './EditCodeModal';
import { EditSubmissionModal } from './EditSubmissionModal';
import { myCodes, rememberCode } from '../lib/editCode';
import { DRIVE_MAX_BYTES, gatewayOf } from '../lib/drive';
import type { CleanupReport } from '../hooks/useBoardStore';
import { GradebookModal } from './GradebookModal';
import { ActivityModal } from './ActivityModal';
import { DuplicateBoardModal } from './DuplicateBoardModal';
import { BoardDetailsModal } from './BoardDetailsModal';
import { buildReport, reportFilename } from '../lib/report';
import { downloadCsv } from '../lib/csv';

const EDIT_WINDOW_MS = 15 * 60_000; // khách được xóa bài của mình trong 15 phút đầu
const PROFILE_KEY = 'bt.lastProfile';

type SlideRow = BoardRow & { card: SubmissionCard };

/** Câu thông báo sau khi xóa bài: nói rõ đã xóa bao nhiêu tệp trên Drive / kho, hoặc tệp Drive nào chưa xóa được. */
function cleanupText(base: string, rep: CleanupReport | void): string {
  if (!rep) return `${base}.`;
  const parts: string[] = [];
  if (rep.driveDeleted > 0) parts.push(`${rep.driveDeleted} tệp trên Google Drive`);
  if (rep.storageRemoved > 0) parts.push(`${rep.storageRemoved} tệp trong kho`);
  const done = parts.length > 0 ? ` và đã xóa ${parts.join(', ')}` : '';
  const fail = rep.driveFailed > 0 ? `. Chưa xóa được ${rep.driveFailed} tệp trên Drive${rep.driveError ? ` (${rep.driveError.slice(0, 80)})` : ''}, bạn xóa tay trong thư mục Bảng tương tác lớp học` : '';
  return `${base}${done}${fail}.`;
}

function loadProfile(): { name: string; unit: string } {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as { name: string; unit: string }) : { name: '', unit: '' };
  } catch {
    return { name: '', unit: '' };
  }
}

interface Props {
  board: BoardData;
  store: BoardStore;
  role: ViewerRole;
  /** Chuyển sang bảng khác (sau khi nhân bản). */
  onSelectBoard: (id: string) => void;
  /** Gmail của người đang đăng nhập. */
  myEmail: string;
}

/** Toàn bộ không gian làm việc của MỘT bảng. App.tsx gắn key = id bảng nên bộ lọc tự đặt lại khi đổi bảng. */
export function BoardWorkspace({ board: savedBoard, store, role, onSelectBoard, myEmail }: Props) {
  // Khi mở Cài đặt, bảng hiển thị bản nháp để người dùng thấy thay đổi ngay; Hủy thì quay về bản đã lưu.
  const [metaDraft, setMetaDraft] = useState<BoardMetaPatch | null>(null);
  const board = useMemo<BoardData>(() => (metaDraft ? { ...savedBoard, ...metaDraft } : savedBoard), [savedBoard, metaDraft]);
  const [view, setView] = useState<ViewMode>(savedBoard.settings.defaultView);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [shareTab, setShareTab] = useState<'students' | 'teachers'>('students');
  const [modal, setModal] = useState<'post' | 'share' | 'roster' | 'resource' | 'duplicate' | 'activity' | 'gradebook' | 'details' | 'lesson' | 'task' | 'material' | 'drive' | 'edit-mine' | 'confirm-card' | 'confirm-cards' | 'confirm-lesson' | 'confirm-task' | 'confirm-material' | 'confirm-clear' | 'confirm-trash' | 'confirm-archive' | null>(null);
  const [slideStart, setSlideStart] = useState<string | null>(null);
  // Đối tượng đang soạn trong các hộp Bài học / Bài tập / Tài liệu.
  const [editLesson, setEditLesson] = useState<Lesson | undefined>();
  const [editTask, setEditTask] = useState<TaskItem | undefined>();
  const [taskLesson, setTaskLesson] = useState<string | null>(null);
  const [materialLesson, setMaterialLesson] = useState<string | null>(null);
  const [materialMM, setMaterialMM] = useState(false);
  const [editMaterial, setEditMaterial] = useState<PinnedResource | undefined>(undefined);
  const [toDelete, setToDelete] = useState<{ lesson?: Lesson; task?: TaskItem; resource?: PinnedResource; card?: SubmissionCard; cardIds?: string[] }>({});
  const [postTask, setPostTask] = useState<string | undefined>();
  const [myPosts, setMyPosts] = useState<Record<string, number>>({});
  const [toast, setToast] = useState('');
  /** Mã sửa bài vừa cấp cho học sinh sau khi nộp. */
  /** Bài của chính em này (tra bằng mã đã lưu trên máy): máy chủ không đưa bài chờ duyệt / cần sửa vào danh sách công khai. */
  const [mine, setMine] = useState<SubmissionCard[]>([]);
  /** Tên trong danh sách lớp, để học sinh chọn khi nộp bài. */
  const [rosterNames, setRosterNames] = useState<{ name: string; unit: string }[]>([]);
  const [editCodePick, setEditCodePick] = useState<string | undefined>();
  const [codeShown, setCodeShown] = useState<{ code: string; name: string; title: string; note?: string } | null>(null);

  const access = savedBoard.access ?? 'owner';
  useEffect(() => {
    if (role !== 'guest') { setRosterNames([]); return; }
    let alive = true;
    void store.loadRosterNames(savedBoard.id).then((l) => { if (alive) setRosterNames(l); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, savedBoard.id, savedBoard.roster]);
  useEffect(() => {
    if (role !== 'guest') { setMine([]); return; }
    let alive = true;
    void Promise.all(myCodes(savedBoard.shareToken).map((c) => store.findCardByCode(savedBoard.id, c.code).catch(() => null)))
      .then((list) => { if (alive) setMine(list.filter((c): c is SubmissionCard => !!c)); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, savedBoard.id, savedBoard.cards, codeShown]);
  // canManage: chủ bảng hoặc đồng quản lý đang xem bằng vai giáo viên; isOwner: riêng chủ bảng; canView: xem toàn bộ dữ liệu (cả giáo viên chỉ xem).
  const canManage = role === 'owner';
  const isOwner = canManage && access === 'owner';
  const canView = role === 'owner' || role === 'viewer';

  const showToast = (msg: string): void => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 3500);
  };

  /** Chạy một thao tác dữ liệu; lỗi (ví dụ RLS từ chối) hiện thành thông báo thay vì im lặng. */
  const run = async (fn: () => Promise<void>, okMsg?: string): Promise<boolean> => {
    try {
      await fn();
      if (okMsg) showToast(okMsg);
      return true;
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Thao tác không thành công.');
      return false;
    }
  };

  // Người không phải giáo viên chỉ thấy bài đã duyệt (+ bài của chính họ) và không thấy sĩ số.
  const visibleBoard = useMemo<BoardData>(() => {
    if (canView) return board;
    const t = Date.now();
    return {
      ...board,
      tasks: board.tasks.filter((x) => isAssigned(x, t)),
      roster: [],
      cards: board.cards.filter((c) => c.status === 'approved' || c.status === 'featured' || c.id in myPosts),
    };
  }, [board, canView, myPosts]);

  const rows = useMemo(() => buildRows(visibleBoard), [visibleBoard]);
  const filtered = useMemo(
    () => sortRows(applyFilters(rows, filters, visibleBoard), board.settings.sortBy),
    [rows, filters, visibleBoard, board.settings.sortBy],
  );
  const kpis = useMemo(() => computeKpis(rows), [rows]);
  const slideItems = useMemo(() => filtered.filter((r): r is SlideRow => r.card !== null), [filtered]);

  const SHARED_VIEWS: ViewMode[] = ['wall', 'grid', 'columns', 'timeline', 'map', 'canvas', 'mindmap', 'venn', 'slides'];
  const allowedViews: ViewMode[] = canView ? ['wall', 'grid', 'table', 'columns', 'summary', 'timeline', 'map', 'canvas', 'mindmap', 'venn', 'slides'] : SHARED_VIEWS;
  const effectiveView: ViewMode = allowedViews.includes(view) ? view : 'grid';

  const now = Date.now();
  const deletableIds = useMemo(
    () => new Set(Object.entries(myPosts).filter(([, t]) => now - t < EDIT_WINDOW_MS).map(([id]) => id)),
    [myPosts, now],
  );

  const patchFilters = (p: Partial<FilterState>): void => setFilters((f) => ({ ...f, ...p }));
  const clearFilters = (): void => setFilters(EMPTY_FILTERS);

  const setStatus = (cardId: string, status: CardStatus): void => {
    void run(() => store.setStatus(board.id, cardId, status));
  };

  const deleteCard = (cardId: string): void => {
    void run(async () => {
      await store.deleteCard(board.id, cardId, canManage);
      setMyPosts((m) => { const { [cardId]: _gone, ...rest } = m; return rest; });
    }, 'Đã xóa bài.');
  };

  /** Trả về thông báo lỗi để form nộp bài hiện ngay tại chỗ (loại tệp sai, quá dung lượng, bị RLS từ chối…). */
  const submitPost = async (d: PostDraft): Promise<string | null> => {
    try {
      const card = await store.addCard(
        { boardId: board.id, taskId: d.taskId, authorName: d.authorName.trim(), unit: d.unit.trim(), title: d.title.trim() || 'Bài nộp', body: d.body.trim(), files: d.files, links: d.links, location: d.location, poll: d.poll },
        savedBoard.settings.moderation, canManage,
      );
      setMyPosts((m) => ({ ...m, [card.id]: Date.now() }));
      try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: card.authorName, unit: card.unit })); } catch { /* bỏ qua */ }
      setModal(null);
      if (card.editCode && !canManage) {
        rememberCode({ code: card.editCode, title: card.title, token: savedBoard.shareToken, at: Date.now() });
        setCodeShown({ code: card.editCode, name: card.authorName, title: card.title, note: card.status === 'pending' ? 'Bài sẽ hiện công khai sau khi giáo viên duyệt.' : undefined });
      }
      showToast(card.status !== 'pending' ? 'Đã nộp bài thành công.'
        : savedBoard.settings.moderation === 'auto' ? 'Đã nộp bài. Hệ thống giữ bài lại để giáo viên xem rồi mới hiện công khai.'
          : 'Đã nộp bài. Bài sẽ hiện công khai sau khi giáo viên duyệt.');
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Không nộp được bài.';
    }
  };

  const applyRoster = (roster: RosterMember[]): void => {
    void run(async () => { await store.setRoster(board.id, roster); setModal(null); }, `Đã áp dụng danh sách ${roster.length} người.`);
  };

  const onLayout = (cardId: string, patch: CardLayoutPatch): void => { void run(() => store.setCardLayout(savedBoard.id, cardId, patch)); };

  const onVote = (cardId: string, optionId: string): void => { void run(() => store.vote(board.id, cardId, optionId)); };

  // Đánh giá & nhận xét: học sinh (vai guest) chấm sao, nhận xét; giáo viên chấm sao, điểm, lời phê, ẩn/xóa nhận xét.
  const feedback: FeedbackActions = {
    canManage,
    canInteract: role === 'guest' && board.linkMode === 'guest_post' && !savedBoard.archivedAt,
    isMine: (id) => getMyCardIds().has(id) || id in myPosts,
    onRate: (cardId, stars) => store.rateCard(savedBoard.id, cardId, stars),
    onComment: (cardId, author, body) => store.addComment(savedBoard.id, cardId, author, body),
    onDeleteOwnComment: (cardId, id) => store.deleteOwnComment(savedBoard.id, cardId, id),
    onCommentStatus: (cardId, id, status) => store.setCommentStatus(savedBoard.id, cardId, id, status),
    onDeleteComment: (cardId, id) => store.deleteComment(savedBoard.id, cardId, id),
    onTeacherStars: (cardId, stars) => store.setTeacherStars(savedBoard.id, cardId, stars),
    onGrade: (cardId, grade, note) => store.setGrade(savedBoard.id, cardId, grade, note),
    onReassign: (cardId, member) => store.reassignCard(savedBoard.id, cardId, member),
  };

  const rowActions = {
    canManage,
    onVote,
    feedback,
    onOpen: (id: string) => setSlideStart(id),
    onSetStatus: setStatus,
    deletableIds,
    // Giáo viên: hỏi xác nhận rồi xóa vĩnh viễn; học sinh xóa bài của mình (trong 15 phút) như cũ.
    onDelete: (cardId: string) => {
      const c = savedBoard.cards.find((x) => x.id === cardId);
      if (canManage && c) { setToDelete({ card: c }); setModal('confirm-card'); } else deleteCard(cardId);
    },
  };

  const closed = !!savedBoard.archivedAt;
  const pendingComments = savedBoard.cards.flatMap((c) => (c.comments ?? []).filter((m) => m.status === 'pending'));

  const exportReport = (): void => downloadCsv(reportFilename(board), buildReport(board, sortRows(rows, board.settings.sortBy)));
  const toggleFullscreen = (): void => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const menuActions = {
    onDuplicate: () => setModal('duplicate'),
    onActivity: () => setModal('activity'),
    onSettings: () => setMetaDraft({ title: savedBoard.title, goals: savedBoard.goals, settings: savedBoard.settings, program: savedBoard.program ?? '' }),
    onGradebook: () => setModal('gradebook'),
    onRoster: () => setModal('roster'),
    onDetails: () => setModal('details'),
    onToggleTemplate: () => { void run(() => store.setTemplate(savedBoard.id, !savedBoard.isTemplate), savedBoard.isTemplate ? 'Đã bỏ đánh dấu mẫu.' : 'Đã đánh dấu là mẫu: bảng này sẽ xuất hiện trong hộp Tạo bảng.'); },
    onExport: exportReport,
    onPrint: () => window.print(),
    onFullscreen: toggleFullscreen,
    onToggleArchive: () => { if (closed) void run(() => store.setArchived(savedBoard.id, false), 'Đã mở lại bảng.'); else setModal('confirm-archive'); },
    onClear: () => setModal('confirm-clear'),
    onDrive: () => setModal('drive'),
    onTrash: () => setModal('confirm-trash'),
    onShareTeachers: () => { setShareTab('teachers'); setModal('share'); },
  };

  const gradeRows = sortRows(buildRows(board), board.settings.sortBy).filter((r): r is SlideRow => r.card !== null);

  const showFab = role !== 'viewonly' && role !== 'viewer' && board.linkMode !== 'view' && !closed;
  const fabLocked = board.linkMode === 'locked' && !canManage;
  const profile = loadProfile();
  const { Icon: BoardIcon } = ICONS[board.settings.icon];

  return (
    <div className="min-h-[calc(100vh-4rem)]" style={{ background: BACKGROUNDS[board.settings.background].css, fontFamily: FONTS[board.settings.font].family }}>
      <main className="mx-auto w-full max-w-[min(100%,2800px)] space-y-5 px-4 py-5 pb-28 sm:px-6 2xl:px-10">
        <header className="relative z-20 rounded-3xl border-[1.5px] border-brand-200 bg-white/90 p-4 shadow-soft backdrop-blur-md sm:p-6">
          {/* Quầng sáng trang trí được cắt trong khung riêng, để khung tiêu đề không cần overflow-hidden (nếu không, trình đơn "Thêm" bị cắt mất). */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl" aria-hidden><div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-gradient-to-br from-brand-200/70 to-teal2-100/70 blur-2xl" /></div>
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-teal2-600 text-white shadow-glow sm:h-16 sm:w-16">
                <BoardIcon className="h-7 w-7 sm:h-8 sm:w-8" aria-hidden />
              </span>
              <div className="min-w-0">
                {board.program && <p className="mb-0.5 text-xs font-extrabold uppercase tracking-wide text-violet-700">{board.program}</p>}
                <h1 className="text-[clamp(1.35rem,2.8vw,2.1rem)] font-extrabold leading-tight tracking-tight">{board.title}</h1>
                {board.subtitle && <p className="mt-1 text-sm text-ink-2">{board.subtitle}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="chip bg-brand-100 text-brand-800 ring-brand-200">{board.mode === 'classroom' ? 'Chế độ Lớp học' : 'Chế độ Tập huấn'}</span>
                  <span className={`chip ${board.linkMode === 'guest_post' ? 'bg-emerald-100 text-emerald-800 ring-emerald-200' : board.linkMode === 'locked' ? 'bg-rose-100 text-rose-800 ring-rose-200' : 'bg-slate-100 text-slate-700 ring-slate-200'}`}>
                    {board.linkMode === 'guest_post' ? 'Đang nhận bài, không cần tài khoản' : board.linkMode === 'locked' ? 'Đã khóa nộp bài' : 'Link chỉ xem'}
                  </span>
                  <span className={`chip ${board.settings.moderation === 'off' ? 'bg-slate-100 text-slate-700 ring-slate-200' : 'bg-amber-100 text-amber-900 ring-amber-200'}`}>
                    {board.settings.moderation === 'manual' ? 'Giáo viên duyệt bài' : board.settings.moderation === 'auto' ? 'Hệ thống tự duyệt' : 'Không kiểm duyệt'}
                  </span>
                  {access !== 'owner' && access !== 'guest' && (
                    <span className="chip bg-violet-100 text-violet-800 ring-violet-200" title={savedBoard.ownerEmail}>
                      Được chia sẻ bởi {savedBoard.ownerEmail ?? 'giáo viên khác'} · {access === 'editor' ? 'Đồng quản lý' : 'Chỉ xem'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="relative mt-4 flex flex-wrap items-center gap-2 border-t border-brand-100 pt-4">
            <button type="button" onClick={() => { setShareTab('students'); setModal('share'); }} className="btn-primary"><Share2 className="h-4 w-4" aria-hidden /> Chia sẻ & QR</button>
            <button type="button" disabled={slideItems.length === 0} onClick={() => setSlideStart(slideItems[0]?.card.id ?? null)} className="btn-ghost"><Presentation className="h-4 w-4" aria-hidden /> Trình chiếu</button>
            {canManage && <button type="button" onClick={menuActions.onSettings} className="btn-ghost"><Pencil className="h-4 w-4" aria-hidden /> Sửa bảng</button>}
            {isOwner && <button type="button" onClick={menuActions.onTrash} className="btn-ghost hover:!border-rose-300 hover:!bg-rose-50 hover:!text-rose-700"><Trash2 className="h-4 w-4" aria-hidden /> Xóa bảng</button>}
            <span className="ml-auto"><BoardMenu board={board} canManage={canManage} isOwner={isOwner} canView={canView} actions={menuActions} /></span>
          </div>
        </header>

        {canManage && pendingComments.length > 0 && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span><b>{pendingComments.length} nhận xét</b> của học sinh đang chờ bạn duyệt.</span>
            <button type="button" onClick={() => setSlideStart(pendingComments[0].cardId)} className="btn-ghost btn-sm">Mở bài đầu tiên để duyệt</button>
          </div>
        )}

        {closed && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-800">
            <span><b>Bảng đã đóng.</b> Không nhận bài mới; vẫn xem, chấm điểm và xuất báo cáo được.</span>
            {isOwner && <button type="button" onClick={menuActions.onToggleArchive} className="btn-ghost btn-sm">Mở lại bảng</button>}
          </div>
        )}

        <LessonsPanel board={visibleBoard} canManage={canManage} canSubmit={role !== 'viewonly' && role !== 'viewer' && board.linkMode === 'guest_post' && !closed} now={now}
          actions={{
            onAddLesson: () => { setEditLesson(undefined); setModal('lesson'); },
            onEditLesson: (l) => { setEditLesson(l); setModal('lesson'); },
            onDeleteLesson: (l) => { setToDelete({ lesson: l }); setModal('confirm-lesson'); },
            onAddTask: (lessonId) => { setEditTask(undefined); setTaskLesson(lessonId); setModal('task'); },
            onEditTask: (t) => { setEditTask(t); setTaskLesson(null); setModal('task'); },
            onDeleteTask: (t) => { setToDelete({ task: t }); setModal('confirm-task'); },
            onAddMaterial: (lessonId, opts) => { setEditMaterial(undefined); setMaterialLesson(lessonId); setMaterialMM(!!opts?.mindmap); setModal('material'); },
            onEditMaterial: (r) => { setEditMaterial(r); setMaterialLesson(r.lessonId ?? null); setMaterialMM(false); setModal('material'); },
            onDeleteMaterial: (r) => { setToDelete({ resource: r }); setModal('confirm-material'); },
            onSubmitTo: (taskId) => { setPostTask(taskId); setModal('post'); },
            onViewSubmissions: (taskId) => { patchFilters({ taskId }); document.querySelector('section[aria-label="Bài nộp và sản phẩm"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
          }} />

        {canView && <DataBoardSummary kpis={kpis} active={filters.progress} hasRoster={savedBoard.roster.length > 0} onSelect={(p) => patchFilters({ progress: p })} />}

        <MultiFilterBar board={visibleBoard} filters={filters} view={effectiveView} resultCount={filtered.length}
          onChange={patchFilters} onViewChange={setView} onClear={clearFilters} isFiltered={isFiltered(filters)} allowedViews={allowedViews}
          deletableCount={canManage ? filtered.filter((r) => r.card).length : 0}
          onDeleteShown={canManage ? () => { setToDelete({ cardIds: filtered.flatMap((r) => (r.card ? [r.card.id] : [])) }); setModal('confirm-cards'); } : undefined} />

        {!canView && (
          <p className="rounded-2xl bg-brand-50 px-4 py-2 text-sm text-brand-800">
            Bạn đang xem với vai trò {role === 'guest' ? 'học sinh / học viên' : 'khách chỉ xem'}: chỉ thấy bài đã duyệt{role === 'guest' ? ' và bài của chính bạn' : ''}.
          </p>
        )}

        {role === 'guest' && mine.filter((c) => c.status === 'needs_edit' || c.status === 'pending').map((c) => (
          <div key={c.id} className={`flex flex-wrap items-center gap-3 rounded-2xl border-[1.5px] p-3 text-sm ${c.status === 'needs_edit' ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}>
            <div className="min-w-0 flex-1">
              <p className="font-extrabold text-ink">{c.status === 'needs_edit' ? 'Cô giáo nhờ em sửa lại bài' : 'Bài của em đang chờ cô duyệt'}: “{c.title}”</p>
              {c.teacherNote && <p className="mt-0.5 text-ink-2">Lời cô: {c.teacherNote}</p>}
            </div>
            {c.status === 'needs_edit' && <button type="button" onClick={() => { setEditCodePick(c.editCode); setModal('edit-mine'); }} className="btn-primary btn-sm">Sửa ngay</button>}
          </div>
        ))}
        <section aria-label="Bài nộp và sản phẩm" aria-live="polite">
          {(effectiveView === 'wall' || effectiveView === 'grid' || effectiveView === 'columns') && (
            <GridAndColumnsView rows={filtered} board={visibleBoard} mode={effectiveView} {...rowActions} />
          )}
          {effectiveView === 'table' && <SubmissionTableView rows={filtered} board={visibleBoard} {...rowActions} />}
          {effectiveView === 'timeline' && <TimelineView rows={filtered} board={visibleBoard} onLayout={onLayout} {...rowActions} />}
          {effectiveView === 'slides' && <SlidesView rows={filtered} board={visibleBoard} onLayout={onLayout} {...rowActions} />}
          {effectiveView === 'canvas' && <CanvasView rows={filtered} board={visibleBoard} onLayout={onLayout} {...rowActions} />}
          {effectiveView === 'mindmap' && <MindMapView rows={filtered} board={visibleBoard} onLayout={onLayout} {...rowActions} />}
          {effectiveView === 'venn' && <VennView rows={filtered} board={visibleBoard} onLayout={onLayout} {...rowActions} />}
          {effectiveView === 'map' && (
            <Suspense fallback={<p role="status" className="glass rounded-3xl p-10 text-center text-ink-2">Đang mở bản đồ…</p>}>
              <MapView rows={filtered} board={visibleBoard} onLayout={onLayout} {...rowActions} />
            </Suspense>
          )}
          {effectiveView === 'summary' && <GroupSummaryView rows={filtered} board={visibleBoard} onPickUnit={(u) => { patchFilters({ search: u }); setView('table'); }} />}
        </section>

        <p className="pb-4 text-center text-xs text-ink-3">{store.isReal ? 'Dữ liệu lưu trên Supabase' : 'Bản giao diện mẫu · dữ liệu giả lập, chưa lưu lên máy chủ'}</p>
      </main>

      {showFab && role === 'guest' && !fabLocked && (
        <button type="button" onClick={() => { setEditCodePick(undefined); setModal('edit-mine'); }}
          className="btn-ghost fixed bottom-[calc(max(1.25rem,env(safe-area-inset-bottom))+4.5rem)] right-5 z-[19] !min-h-[44px] bg-white/95 text-sm shadow-soft sm:right-8">
          <KeyRound className="h-4 w-4" aria-hidden /> Sửa bài đã nộp
        </button>
      )}
      {showFab && (
        <button type="button" disabled={fabLocked} onClick={() => { setPostTask(undefined); setModal('post'); }} aria-label={fabLocked ? 'Bảng đã khóa nộp bài' : 'Thêm bài nộp'}
          className="btn-primary fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-[19] !min-h-[60px] !gap-2 !px-6 text-base sm:right-8">
          {fabLocked ? <Lock className="h-6 w-6" aria-hidden /> : <Plus className="h-7 w-7" strokeWidth={3} aria-hidden />}
          <span>{fabLocked ? 'Đã khóa nộp bài' : 'Nộp bài'}</span>
        </button>
      )}

      {modal === 'duplicate' && <DuplicateBoardModal board={savedBoard} onClose={() => setModal(null)}
        onDuplicate={async (opts) => { const copy = await store.duplicateBoard(savedBoard, opts); setModal(null); onSelectBoard(copy.id); }} />}
      {modal === 'activity' && <ActivityModal load={() => store.loadActivity(savedBoard.id)} onClose={() => setModal(null)} />}
      {modal === 'details' && <BoardDetailsModal board={savedBoard} onClose={() => setModal(null)} />}
      {modal === 'gradebook' && <GradebookModal board={board} rows={gradeRows} onClose={() => setModal(null)} onExport={exportReport}
        onSetGrade={(cardId, grade, note) => store.setGrade(savedBoard.id, cardId, grade, note)}
        onSetStars={(cardId, stars) => store.setTeacherStars(savedBoard.id, cardId, stars)} />}
      {modal === 'confirm-clear' && (
        <ConfirmModal title="Xóa hết bài nộp?" confirmLabel={`Xóa ${savedBoard.cards.length} bài`} danger requireText="XÓA" onClose={() => setModal(null)}
          onConfirm={async () => { const rep = await store.clearSubmissions(savedBoard.id); setModal(null); showToast(cleanupText('Đã xóa toàn bộ bài nộp', rep)); }}>
          <p>Toàn bộ <b className="text-ink">{savedBoard.cards.length} bài nộp</b> (kèm điểm và nhận xét) của “{savedBoard.title}” sẽ bị xóa. Tài liệu ghim, danh sách sĩ số và cài đặt được giữ nguyên.</p>
          <p className="font-bold text-rose-700">Không thể hoàn tác. Hãy bấm “Xuất báo cáo” trước nếu cần lưu điểm.</p>
        </ConfirmModal>
      )}
      {modal === 'confirm-trash' && (
        <ConfirmModal title="Chuyển bảng vào thùng rác?" confirmLabel="Chuyển vào thùng rác" danger onClose={() => setModal(null)}
          onConfirm={async () => { await store.setTrashed(savedBoard.id, true); }}>
          <p>Bảng “{savedBoard.title}” sẽ ẩn khỏi danh sách và <b className="text-ink">link chia sẻ ngừng hoạt động</b>. Bạn có thể khôi phục trong 30 ngày ở mục “Bảng đã đóng & thùng rác”; sau đó bảng tự xóa vĩnh viễn.</p>
        </ConfirmModal>
      )}
      {modal === 'confirm-archive' && (
        <ConfirmModal title="Đóng bảng?" confirmLabel="Đóng bảng" onClose={() => setModal(null)}
          onConfirm={async () => { await store.setArchived(savedBoard.id, true); setModal(null); showToast('Đã đóng bảng. Mở lại ở mục “Bảng đã đóng & thùng rác”.'); }}>
          <p>Bảng sẽ ngừng nhận bài mới và bình chọn. Mọi bài, điểm và báo cáo vẫn giữ nguyên; bạn có thể mở lại bất cứ lúc nào.</p>
        </ConfirmModal>
      )}
      {metaDraft && (
        <BoardSettingsModal
          initial={{ title: savedBoard.title, goals: savedBoard.goals, settings: savedBoard.settings, program: savedBoard.program ?? '' }}
          showProgram={savedBoard.mode === 'training'}
          onPreview={setMetaDraft}
          onSave={async (d) => { await store.updateMeta(savedBoard.id, d); setMetaDraft(null); showToast('Đã lưu cài đặt bảng.'); }}
          onCancel={() => setMetaDraft(null)}
        />
      )}
      {modal === 'edit-mine' && <EditSubmissionModal key={editCodePick ?? 'tay'} initialCode={editCodePick} boardToken={savedBoard.shareToken} isClass={board.mode === 'classroom'}
        onFind={(code) => store.findCardByCode(savedBoard.id, code)} onFindByName={(name) => store.findCardsByName(savedBoard.id, name)}
        limits={gatewayOf(savedBoard.settings) ? { maxFile: DRIVE_MAX_BYTES, maxTotal: DRIVE_MAX_BYTES } : undefined}
        onSave={(code, input, del) => store.saveCardByCode(savedBoard.id, code, input, del)}
        onDone={(msg) => { setModal(null); showToast(msg); }} onClose={() => setModal(null)} />}
      {codeShown && <EditCodeModal code={codeShown.code} name={codeShown.name} title={codeShown.title} note={codeShown.note} onClose={() => setCodeShown(null)} />}
      {modal === 'post' && <QuickPostModal board={visibleBoard} roster={rosterNames} initialName={profile.name} initialUnit={profile.unit} initialTaskId={postTask} onSubmit={submitPost} onClose={() => setModal(null)} />}
      {modal === 'share' && <ShareBoardModal board={board} canManage={canManage} access={access} myEmail={myEmail} initialTab={shareTab}
        onInvite={(email, r) => store.inviteCollaborator(savedBoard.id, email, r)}
        onChangeRole={(email, r) => store.changeCollaboratorRole(savedBoard.id, email, r)}
        onRemove={(email) => store.removeCollaborator(savedBoard.id, email)}
        onLeave={async () => { await store.leaveBoard(savedBoard.id); setModal(null); }}
        onChangeLinkMode={(m) => void run(() => store.setSettings(board.id, { linkMode: m }))}
        onChangeModeration={(m) => void run(() => store.setSettings(board.id, { moderation: m }), 'Đã đổi chế độ kiểm duyệt.')} onClose={() => setModal(null)} />}
      {modal === 'roster' && <RosterImportModal board={board} onApply={applyRoster} onClose={() => setModal(null)} />}
      {modal === 'lesson' && <LessonModal mode={board.mode} lesson={editLesson} onClose={() => setModal(null)}
        onSave={async (input) => { await store.saveLesson(savedBoard.id, editLesson?.id ?? null, input); setModal(null); showToast(editLesson ? 'Đã lưu thay đổi.' : 'Đã thêm vào danh sách.'); }} />}
      {modal === 'task' && <TaskModal board={savedBoard} task={editTask} defaultLessonId={taskLesson} onClose={() => setModal(null)}
        otherBoards={store.boards.filter((b) => b.id !== savedBoard.id && (b.access === undefined || b.access === 'owner' || b.access === 'editor') && !b.archivedAt && !b.deletedAt && !b.isTemplate).map((b) => ({ id: b.id, title: b.title }))}
        onSave={async (input, alsoAssignTo) => {
          const saved = await store.saveTask(savedBoard.id, editTask?.id ?? null, input);
          const n = alsoAssignTo.length > 0 ? await store.assignToBoards(savedBoard.id, saved, alsoAssignTo) : 0;
          setModal(null);
          showToast(n > 0 ? `Đã lưu và giao thêm cho ${n} lớp khác.` : editTask ? 'Đã lưu thay đổi.' : 'Đã giao bài.');
        }} />}
      {modal === 'material' && <MaterialModal board={savedBoard} defaultLessonId={materialLesson} startMindMap={materialMM} resource={editMaterial} onClose={() => setModal(null)}
        onAdd={async (input) => {
          if (editMaterial) { await store.updateResource(savedBoard.id, editMaterial.id, input); setModal(null); showToast('Đã lưu tài liệu.'); return; }
          await store.addResource(savedBoard.id, input); setModal(null); showToast('Đã thêm tài liệu.');
        }} />}
      {modal === 'drive' && <DriveBackupModal board={savedBoard} real={store.isReal} onClose={() => setModal(null)}
        onSaveGateway={async (cfg, all) => {
          // Ghi cổng vào cài đặt của bảng này và (nếu chọn) mọi bảng của giáo viên để học sinh ở bảng nào cũng nộp thẳng vào Drive.
          const targets = store.boards.filter((b) => !b.deletedAt && (b.access ?? 'owner') === 'owner' && (all || b.id === savedBoard.id));
          for (const b of targets) await store.updateMeta(b.id, { title: b.title, goals: b.goals, settings: { ...b.settings, driveUrl: cfg.url, driveSecret: cfg.secret } });
        }}
        onUpdateAttachments={(cardId, atts) => store.updateCardAttachments(savedBoard.id, cardId, atts)} onRemoveStored={store.removeStoredAttachments} />}
      {modal === 'confirm-card' && toDelete.card && (
        <ConfirmModal title="Xóa bài nộp này?" confirmLabel="Xóa bài" danger onClose={() => setModal(null)}
          onConfirm={async () => { const rep = await store.deleteCard(savedBoard.id, toDelete.card!.id, true); setModal(null); showToast(cleanupText('Đã xóa bài nộp', rep)); }}>
          <p>Bài “{toDelete.card.title}” của <b className="text-ink">{toDelete.card.authorName}</b> ({toDelete.card.unit}) sẽ bị xóa vĩnh viễn, kể cả tệp đính kèm, điểm và nhận xét. <b className="text-ink">Không thể hoàn tác.</b></p>
        </ConfirmModal>
      )}
      {modal === 'confirm-cards' && toDelete.cardIds && (
        <ConfirmModal title={`Xóa ${toDelete.cardIds.length} bài nộp?`} confirmLabel={`Xóa ${toDelete.cardIds.length} bài`} danger requireText="XOA" onClose={() => setModal(null)}
          onConfirm={async () => {
            const total = { storageRemoved: 0, driveDeleted: 0, driveFailed: 0 };
            for (const id of toDelete.cardIds!) {
              const rep = await store.deleteCard(savedBoard.id, id, true);
              if (rep) { total.storageRemoved += rep.storageRemoved; total.driveDeleted += rep.driveDeleted; total.driveFailed += rep.driveFailed; }
            }
            setModal(null); showToast(cleanupText(`Đã xóa ${toDelete.cardIds!.length} bài nộp`, total));
          }}>
          <p>Mọi bài đang hiển thị theo bộ lọc hiện tại (<b className="text-ink">{toDelete.cardIds.length} bài</b>) sẽ bị xóa vĩnh viễn, kể cả tệp, điểm và nhận xét. <b className="text-ink">Không thể hoàn tác.</b> Hãy kiểm tra kỹ bộ lọc trước khi xóa.</p>
        </ConfirmModal>
      )}
      {modal === 'confirm-lesson' && toDelete.lesson && (
        <ConfirmModal title="Xóa bài học?" confirmLabel="Xóa bài học" danger onClose={() => setModal(null)}
          onConfirm={async () => { await store.removeLesson(savedBoard.id, toDelete.lesson!.id); setModal(null); showToast('Đã xóa bài học.'); }}>
          <p>“{toDelete.lesson.title}” sẽ bị xóa. Bài tập và tài liệu bên trong <b className="text-ink">không mất</b>, chỉ chuyển ra ngoài bài học. Bài nộp được giữ nguyên.</p>
        </ConfirmModal>
      )}
      {modal === 'confirm-task' && toDelete.task && (
        <ConfirmModal title="Xóa bài tập / yêu cầu?" confirmLabel="Xóa" danger onClose={() => setModal(null)}
          onConfirm={async () => { await store.removeTask(savedBoard.id, toDelete.task!.id); setModal(null); showToast('Đã xóa bài tập.'); }}>
          <p>“{toDelete.task.label}” sẽ bị xóa. Các bài đã nộp vẫn còn nhưng không còn gắn với bài tập nào.</p>
        </ConfirmModal>
      )}
      {modal === 'confirm-material' && toDelete.resource && (
        <ConfirmModal title="Gỡ tài liệu?" confirmLabel="Gỡ tài liệu" danger onClose={() => setModal(null)}
          onConfirm={async () => { await store.removeResource(savedBoard.id, toDelete.resource!.id); setModal(null); showToast('Đã gỡ tài liệu.'); }}>
          <p>“{toDelete.resource.title}” sẽ không còn hiện cho {board.mode === 'classroom' ? 'học sinh' : 'học viên'}.</p>
        </ConfirmModal>
      )}
      {slideStart && slideItems.length > 0 && (
        <SlidePresentationModal items={slideItems} startCardId={slideStart} board={visibleBoard} canManage={canManage} onSetStatus={setStatus} onVote={onVote} feedback={feedback} onClose={() => setSlideStart(null)} />
      )}

      {toast && <div role="status" className="pop-in fixed bottom-24 left-1/2 z-[70] max-w-[92vw] -translate-x-1/2 rounded-full bg-ink px-5 py-3 text-sm font-bold text-white shadow-lift">{toast}</div>}
    </div>
  );
}
