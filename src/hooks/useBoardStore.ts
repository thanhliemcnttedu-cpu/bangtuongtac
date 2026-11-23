import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ActivityEntry, Attachment, BoardData, CardComment, ModerationMode, CardLayoutPatch, CardLocation, CardStatus, CollabRole, LinkMode, Lesson, PinnedResource, ResourceKind, RosterMember, SubmissionCard, TaskItem,
} from '../types/board';
import { MOCK_BOARDS } from '../data/mockBoardData';
import { buildLargeDemo } from '../data/demoLarge';
import type { BoardTemplate } from '../data/boardTemplates';
import { isSupabaseConfigured } from '../lib/supabase';
import * as api from '../lib/boardApi';
import { linkToAttachment } from '../lib/embeds';
import { attachmentTypeOf, baseMime, compressImage, docKindOf, formatSize, validateFile } from '../lib/media';
import { uploadAttachment } from '../lib/storage';
import { checkComment, textFlagged } from '../lib/moderation';
import { getMyRatings, rememberMyCard, rememberMyComment, rememberRating } from '../lib/peer';
import type { LessonInput, TaskInput } from '../lib/boardApi';
import { checkSubmit } from '../lib/lessons';

export interface NewCardInput {
  boardId: string;
  taskId: string;
  authorName: string;
  unit: string;
  title: string;
  body: string;
  /** Nhiều tệp cùng lúc (ảnh, video, tài liệu, ảnh chụp, hình vẽ…). */
  files: File[];
  links: string[];
  location: CardLocation | null;
  /** Nhãn các lựa chọn thăm dò (2–6) hoặc null. */
  poll: string[] | null;
}

/** Tài liệu giáo viên cung cấp: tải nhiều tệp và/hoặc dán liên kết; `kind = 'auto'` để hệ thống tự nhận theo tệp. */
export interface MaterialInput {
  title: string;
  description: string;
  kind: ResourceKind | 'auto';
  /** Bài học chứa tài liệu; null = tài liệu chung của lớp. */
  lessonId: string | null;
  files: File[];
  links: string[];
  /** Chỉ khi sửa: các đính kèm cũ được giữ lại (bỏ khỏi danh sách = gỡ khỏi tài liệu). */
  keep?: Attachment[];
}

export interface DuplicateOptions {
  title: string;
  keepRoster: boolean;
  keepPinned: boolean;
}

export interface BoardStore {
  boards: BoardData[];
  loading: boolean;
  error: string;
  isReal: boolean;
  /** Token trong đường dẫn /b/<token> (khách mở link chia sẻ), nếu có. */
  linkToken: string | null;
  createBoard: (title: string, template: BoardTemplate, extras?: { lessonTitle?: string; program?: string }) => Promise<BoardData>;
  duplicateBoard: (source: BoardData, opts: DuplicateOptions) => Promise<BoardData>;
  updateMeta: (boardId: string, meta: api.BoardMetaPatch) => Promise<void>;
  /** Chế độ kiểm duyệt quyết định bài hiện ngay hay chờ duyệt; giáo viên (asManager) luôn được duyệt sẵn. */
  addCard: (input: NewCardInput, moderation: ModerationMode, asManager: boolean) => Promise<SubmissionCard>;
  setStatus: (boardId: string, cardId: string, status: CardStatus) => Promise<void>;
  setGrade: (boardId: string, cardId: string, grade: number | null, note: string) => Promise<void>;
  vote: (boardId: string, cardId: string, optionId: string) => Promise<void>;
  setCardLayout: (boardId: string, cardId: string, patch: CardLayoutPatch) => Promise<void>;
  deleteCard: (boardId: string, cardId: string, asManager: boolean) => Promise<void>;
  clearSubmissions: (boardId: string) => Promise<void>;
  setRoster: (boardId: string, roster: RosterMember[]) => Promise<void>;
  setSettings: (boardId: string, patch: { linkMode?: LinkMode; moderation?: ModerationMode }) => Promise<void>;
  /** Bài học / buổi tập huấn: thêm (lessonId = null) hoặc sửa. */
  saveLesson: (boardId: string, lessonId: string | null, input: LessonInput) => Promise<void>;
  /** Xóa bài học; bài tập và tài liệu của bài chuyển về "chung của lớp" (bài nộp không mất). */
  removeLesson: (boardId: string, lessonId: string) => Promise<void>;
  /** Bài tập / yêu cầu: thêm (taskId = null) hoặc sửa. Trả về bài tập đã lưu. */
  saveTask: (boardId: string, taskId: string | null, input: TaskInput) => Promise<TaskItem>;
  removeTask: (boardId: string, taskId: string) => Promise<void>;
  addResource: (boardId: string, input: MaterialInput) => Promise<void>;
  removeResource: (boardId: string, resourceId: string) => Promise<void>;
  updateResource: (boardId: string, resourceId: string, input: MaterialInput) => Promise<void>;
  /** Giao một bài tập (kèm bài học và tài liệu của bài) cho các lớp khác của tôi. Trả về số lớp đã giao. */
  assignToBoards: (sourceBoardId: string, task: TaskItem, targetBoardIds: string[]) => Promise<number>;
  /** Gán lớp vào chương trình tập huấn (rỗng = bỏ khỏi chương trình). */
  setProgram: (boardId: string, program: string) => Promise<void>;
  setArchived: (boardId: string, archived: boolean) => Promise<void>;
  setTrashed: (boardId: string, trashed: boolean) => Promise<void>;
  deleteForever: (boardId: string) => Promise<void>;
  setTemplate: (boardId: string, value: boolean) => Promise<void>;
  loadActivity: (boardId: string) => Promise<ActivityEntry[]>;
  /** Học sinh chấm sao bài của bạn (1–5); đổi ý được. */
  rateCard: (boardId: string, cardId: string, stars: number) => Promise<void>;
  /** Học sinh nhận xét bài của bạn. Lỗi (từ không phù hợp, quá dài, quá nhanh…) được ném ra bằng câu tiếng Việt thân thiện. */
  addComment: (boardId: string, cardId: string, author: string, body: string) => Promise<CardComment>;
  deleteOwnComment: (boardId: string, cardId: string, commentId: string) => Promise<void>;
  /** Giáo viên: ẩn / hiện lại, xóa nhận xét, chấm sao. */
  setCommentStatus: (boardId: string, cardId: string, commentId: string, status: 'visible' | 'pending' | 'hidden') => Promise<void>;
  deleteComment: (boardId: string, cardId: string, commentId: string) => Promise<void>;
  setTeacherStars: (boardId: string, cardId: string, stars: number | null) => Promise<void>;
  /** Chia sẻ với giáo viên khác (chỉ chủ bảng). Lỗi được ném ra với câu tiếng Việt. */
  inviteCollaborator: (boardId: string, email: string, role: CollabRole) => Promise<void>;
  changeCollaboratorRole: (boardId: string, email: string, role: CollabRole) => Promise<void>;
  removeCollaborator: (boardId: string, email: string) => Promise<void>;
  /** Người được chia sẻ tự rời khỏi bảng. */
  leaveBoard: (boardId: string) => Promise<void>;
}

/**
 * Chuẩn bị mọi đính kèm của một bài: nén ảnh, kiểm tra loại/dung lượng, tải song song lên kho (dữ liệu thật)
 * hoặc tạo liên kết tạm (bản mẫu). Một tệp lỗi thì cả bài dừng và báo rõ tệp nào; không gửi bài thiếu tệp.
 */
async function prepareAttachments(input: { boardId: string; files: File[]; links: string[] }, real: boolean, allowArchive = false): Promise<Attachment[]> {
  const files = await Promise.all(input.files.map(async (raw): Promise<Attachment> => {
    const file = await compressImage(raw);
    const problem = validateFile(file, allowArchive);
    if (problem) throw new Error(`${raw.name}: ${problem}`);
    const base = { type: attachmentTypeOf(file), name: file.name, mime: baseMime(file), size: file.size };
    if (real) {
      const up = await uploadAttachment(input.boardId, file);
      return { ...base, url: up.url };
    }
    return { ...base, url: URL.createObjectURL(file) };
  }));
  return [...files, ...input.links.map((l) => linkToAttachment(l))];
}

/** Tự nhận loại tài liệu từ đính kèm đầu tiên (PDF, slide, video, âm thanh, ảnh, liên kết, tệp khác). */
function inferKind(list: Attachment[]): ResourceKind {
  const a = list[0];
  if (!a) return 'link';
  if (a.type === 'video' || a.type === 'embed') return a.type === 'video' || /youtube|vimeo/.test(a.embed?.provider ?? '') ? 'video' : 'link';
  if (a.type === 'audio') return 'audio';
  if (a.type === 'image') return 'image';
  if (a.type === 'link') return 'link';
  const kind = docKindOf(a);
  return kind === 'pdf' ? 'pdf' : kind === 'powerpoint' ? 'slide' : 'file';
}

const sizeLabelOf = (list: Attachment[]): string | undefined => {
  const total = list.reduce((n, a) => n + (a.size ?? 0), 0);
  return total > 0 ? formatSize(total) : undefined;
};

function tokenFromPath(): string | null {
  const m = window.location.pathname.match(/^\/b\/([A-Za-z0-9_-]+)\/?$/);
  return m ? m[1] : null;
}

const randomToken = (): string => Math.random().toString(36).slice(2, 12);

/**
 * Một cổng duy nhất cho dữ liệu bảng: dữ liệu mẫu khi chưa có .env, Supabase khi đã cấu hình.
 * App.tsx chỉ gọi các hàm ở đây, không biết dữ liệu đến từ đâu.
 * `actor` là tên/Gmail ghi vào nhật ký hoạt động.
 */
export function useBoardStore(userId: string | null, actor: string): BoardStore {
  const isReal = isSupabaseConfigured;
  const linkToken = isReal ? tokenFromPath() : null;
  const [boards, setBoards] = useState<BoardData[]>(isReal ? [] : typeof location !== 'undefined' && location.search.includes('demo=full') ? buildLargeDemo() : MOCK_BOARDS);
  const [loading, setLoading] = useState(isReal);
  const [error, setError] = useState('');
  const [mockLog, setMockLog] = useState<Record<string, ActivityEntry[]>>({});

  // Bản mẫu: quyền suy ra từ Gmail đang chọn (chủ bảng, được chia sẻ, hoặc không thấy), để thử chuyển tài khoản.
  const visibleBoards = useMemo<BoardData[]>(() => {
    if (isReal) return boards;
    const me = actor.toLowerCase();
    return boards.flatMap((b) => {
      const access = (b.ownerEmail ?? '').toLowerCase() === me ? 'owner' : (b.collaborators ?? []).find((c) => c.email === me)?.role;
      return access ? [{ ...b, access }] : [];
    });
  }, [boards, isReal, actor]);

  const patch = useCallback((id: string, fn: (b: BoardData) => BoardData): void => {
    setBoards((list) => list.map((b) => (b.id === id ? fn(b) : b)));
  }, []);

  /**
   * Ghi nhật ký. Sự kiện về BÀI NỘP (nộp, đổi trạng thái, chấm điểm, xóa) do trigger CSDL ghi khi dùng dữ liệu thật,
   * nên `viaDb = false` chỉ ghi ở bản mẫu. Sự kiện cấp BẢNG (`viaDb = true`) do trình duyệt ghi vào CSDL.
   */
  const note = useCallback(async (boardId: string, action: string, detail: string, viaDb: boolean): Promise<void> => {
    if (isReal) {
      if (viaDb) { try { await api.logActivity(boardId, actor, action, detail); } catch { /* nhật ký lỗi không được làm hỏng thao tác chính */ } }
      return;
    }
    const entry: ActivityEntry = { id: `${Date.now()}-${Math.random()}`, at: new Date().toISOString(), actor, action, detail };
    setMockLog((m) => ({ ...m, [boardId]: [entry, ...(m[boardId] ?? [])] }));
  }, [isReal, actor]);

  // Nạp dữ liệu thật mỗi khi đổi tài khoản Gmail hoặc mở link /b/<token>.
  useEffect(() => {
    if (!isReal) return;
    let alive = true;
    setLoading(true);
    setError('');
    (async () => {
      if (userId) { try { await api.purgeTrash(); } catch { /* chưa có hàm dọn thùng rác: bỏ qua */ } }
      const mine = userId ? await api.loadMyBoards(actor) : [];
      const isMine = linkToken ? mine.some((b) => b.shareToken === linkToken) : true;
      const pub = linkToken && !isMine ? await api.loadPublicBoard(linkToken) : null;
      if (!alive) return;
      const all = pub ? [pub, ...mine] : mine;
      setBoards(all);
      if (linkToken && !pub && !isMine) setError('Không tìm thấy bảng với liên kết này.');
    })()
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'Không tải được dữ liệu.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [isReal, userId, linkToken, actor]);

  const createBoard = useCallback(async (title: string, template: BoardTemplate, extras: { lessonTitle?: string; program?: string } = {}): Promise<BoardData> => {
    if (!isReal) {
      const lesson: Lesson | undefined = extras.lessonTitle ? { id: `bh-${Date.now()}`, title: extras.lessonTitle, description: '', startsAt: null, endsAt: null } : undefined;
      const b: BoardData = {
        id: `mau-${Date.now()}`, mode: template.mode, title, subtitle: 'Bảng mẫu mới', goals: template.goals, shareToken: randomToken(),
        linkMode: 'guest_post', pinned: [], lessons: lesson ? [lesson] : [], program: extras.program, sessions: [], roster: [], cards: [], settings: template.settings,
        tasks: [], createdAt: new Date().toISOString(), isTemplate: false,
        ownerEmail: actor, collaborators: [],
      };
      setBoards((l) => [b, ...l]);
      return b;
    }
    if (!userId) throw new Error('Cần đăng nhập Gmail để tạo bảng.');
    const b = await api.createBoard(title, template, userId, extras);
    setBoards((l) => [b, ...l]);
    return b;
  }, [isReal, userId, actor]);

  const duplicateBoard = useCallback(async (source: BoardData, opts: DuplicateOptions): Promise<BoardData> => {
    let copy: BoardData;
    if (!isReal) {
      copy = {
        ...source, id: `mau-${Date.now()}`, title: opts.title, shareToken: randomToken(), cards: [], isTemplate: false,
        archivedAt: null, deletedAt: null, createdAt: new Date().toISOString(), ownerEmail: actor, collaborators: [],
        roster: opts.keepRoster ? source.roster : [],
        pinned: opts.keepPinned ? source.pinned.map((r) => ({ ...r, id: `r-${Math.random()}` })) : [],
      };
    } else {
      if (!userId) throw new Error('Cần đăng nhập Gmail để nhân bản bảng.');
      copy = await api.duplicateBoard(source, opts, userId);
    }
    setBoards((l) => [copy, ...l]);
    await note(copy.id, 'nhan_ban', `Nhân bản từ “${source.title}”`, true);
    return copy;
  }, [isReal, userId, note]);

  const addCard = useCallback(async (input: NewCardInput, moderation: ModerationMode, asManager: boolean): Promise<SubmissionCard> => {
    // Báo trước cho học sinh: bài tập chưa giao / hết hạn / không giao cho tổ này. Máy chủ vẫn kiểm tra lại (trigger cards_guard).
    let late = false;
    const task = boards.find((b) => b.id === input.boardId)?.tasks.find((t) => t.id === input.taskId);
    if (task && !asManager) {
      const check = checkSubmit(task, input.unit, Date.now());
      if (!check.ok) throw new Error(check.reason);
      late = check.late;
    }
    const attachments = await prepareAttachments(input, isReal);
    // off: hiện ngay · manual: chờ giáo viên · auto: hệ thống đọc chữ, sạch thì duyệt luôn, nghi ngờ thì giữ lại.
    const status: CardStatus = asManager || moderation === 'off' ? 'approved'
      : moderation === 'manual' ? 'pending'
        : textFlagged([input.authorName, input.unit, input.title, input.body, input.location?.name, ...(input.poll ?? []), ...attachments.map((a) => a.name)]) ? 'pending' : 'approved';
    let card: SubmissionCard;
    if (isReal) {
      card = await api.insertSubmission(
        { boardId: input.boardId, taskId: input.taskId, authorName: input.authorName, unit: input.unit, title: input.title, body: input.body, attachments, poll: input.poll, location: input.location },
        status,
      );
    } else {
      card = {
        id: `${input.boardId}-new-${Date.now()}`, boardId: input.boardId, authorName: input.authorName, unit: input.unit,
        title: input.title, taskId: input.taskId, body: input.body, attachments, loc: input.location ?? undefined,
        poll: input.poll?.map((label, i) => ({ id: `o${i + 1}`, label, votes: 0 })),
        status, late: late || undefined, submittedAt: new Date().toISOString(),
      };
    }
    patch(input.boardId, (b) => ({ ...b, cards: [card, ...b.cards] }));
    rememberMyCard(card.id);
    await note(input.boardId, 'nop_bai', `${card.authorName} · ${card.title}`, false);
    return card;
  }, [isReal, boards, patch, note]);

  const vote = useCallback(async (boardId: string, cardId: string, optionId: string): Promise<void> => {
    if (isReal) await api.voteCard(cardId, optionId);
    const prev = api.getMyVotes()[cardId];
    api.rememberVote(cardId, optionId);
    patch(boardId, (b) => ({
      ...b,
      cards: b.cards.map((c) => (c.id !== cardId || !c.poll ? c : {
        ...c,
        poll: c.poll.map((o) => ({ ...o, votes: o.votes + (o.id === optionId ? 1 : 0) - (o.id === prev ? 1 : 0) })),
      })),
    }));
  }, [isReal, patch]);

  const setCardLayout = useCallback(async (boardId: string, cardId: string, p: CardLayoutPatch): Promise<void> => {
    if (isReal) await api.updateCardLayout(cardId, p);
    patch(boardId, (b) => ({
      ...b,
      cards: b.cards.map((c) => {
        if (c.id !== cardId) return c;
        const next = { ...c };
        if (p.pos !== undefined) next.pos = p.pos ?? undefined;
        if (p.venn !== undefined) next.venn = p.venn ?? undefined;
        if (p.loc !== undefined) next.loc = p.loc ?? undefined;
        return next;
      }),
    }));
  }, [isReal, patch]);

  const setStatus = useCallback(async (boardId: string, cardId: string, status: CardStatus): Promise<void> => {
    if (isReal) await api.setCardStatus(cardId, status);
    let who = '';
    patch(boardId, (b) => ({ ...b, cards: b.cards.map((c) => { if (c.id === cardId) who = c.authorName; return c.id === cardId ? { ...c, status } : c; }) }));
    await note(boardId, 'doi_trang_thai', `${who}: → ${status}`, false);
  }, [isReal, patch, note]);

  const setGrade = useCallback(async (boardId: string, cardId: string, grade: number | null, teacherNote: string): Promise<void> => {
    if (isReal) await api.setGrade(cardId, grade, teacherNote);
    let who = '';
    patch(boardId, (b) => ({
      ...b,
      cards: b.cards.map((c) => {
        if (c.id !== cardId) return c;
        who = c.authorName;
        return { ...c, grade: grade ?? undefined, teacherNote: teacherNote || undefined };
      }),
    }));
    await note(boardId, 'cham_diem', `${who}: ${grade !== null ? String(grade).replace('.', ',') : teacherNote ? 'nhận xét' : 'bỏ điểm'}`, false);
  }, [isReal, patch, note]);

  const deleteCard = useCallback(async (boardId: string, cardId: string, asManager: boolean): Promise<void> => {
    if (isReal) await (asManager ? api.deleteCardAsManager(cardId) : api.deleteOwnCard(cardId));
    let label = '';
    patch(boardId, (b) => ({ ...b, cards: b.cards.filter((c) => { if (c.id === cardId) label = `${c.authorName} · ${c.title}`; return c.id !== cardId; }) }));
    await note(boardId, 'xoa_bai', label, false);
  }, [isReal, patch, note]);

  const clearSubmissions = useCallback(async (boardId: string): Promise<void> => {
    if (isReal) await api.clearSubmissions(boardId);
    patch(boardId, (b) => ({ ...b, cards: [] }));
    await note(boardId, 'xoa_het', 'Đã xóa toàn bộ bài nộp', true);
  }, [isReal, patch, note]);

  const updateMeta = useCallback(async (boardId: string, meta: api.BoardMetaPatch): Promise<void> => {
    if (isReal) await api.updateBoardMeta(boardId, meta);
    const cur = boards.find((b) => b.id === boardId);
    const program = meta.program === undefined ? cur?.program : meta.program.trim() || undefined;
    if (isReal && meta.program !== undefined && program !== cur?.program) await api.setBoardProgram(boardId, program ?? '');
    patch(boardId, (b) => ({ ...b, title: meta.title, goals: meta.goals, settings: meta.settings, program }));
    await note(boardId, 'cai_dat', 'Đổi cài đặt bảng', true);
  }, [isReal, boards, patch, note]);

  const setRoster = useCallback(async (boardId: string, roster: RosterMember[]): Promise<void> => {
    const saved = isReal ? await api.replaceRoster(boardId, roster) : roster;
    patch(boardId, (b) => ({ ...b, roster: saved }));
    await note(boardId, 'nhap_danh_sach', `${saved.length} người`, true);
  }, [isReal, patch, note]);

  const setSettings = useCallback(async (boardId: string, p: { linkMode?: LinkMode; moderation?: ModerationMode }): Promise<void> => {
    const current = boards.find((x) => x.id === boardId);
    if (p.linkMode) {
      const linkMode = p.linkMode;
      if (isReal) await api.updateBoardSettings(boardId, { linkMode });
      patch(boardId, (b) => ({ ...b, linkMode }));
      await note(boardId, 'cai_dat', `Quyền link → ${linkMode}`, true);
    }
    if (p.moderation && current) {
      const settings = { ...current.settings, moderation: p.moderation };
      if (isReal) await api.updateBoardMeta(boardId, { title: current.title, goals: current.goals, settings });
      patch(boardId, (b) => ({ ...b, settings: { ...b.settings, moderation: p.moderation as ModerationMode } }));
      await note(boardId, 'cai_dat', `Kiểm duyệt → ${p.moderation}`, true);
    }
  }, [isReal, boards, patch, note]);

  const saveLesson = useCallback(async (boardId: string, lessonId: string | null, input: LessonInput): Promise<void> => {
    if (!input.title.trim()) throw new Error('Hãy nhập tên bài học.');
    if (input.startsAt && input.endsAt && Date.parse(input.endsAt) < Date.parse(input.startsAt)) throw new Error('Giờ kết thúc phải sau giờ bắt đầu.');
    const board = boards.find((b) => b.id === boardId);
    if (!board) throw new Error('Không tìm thấy lớp.');
    const clean: LessonInput = { ...input, title: input.title.trim(), description: input.description.trim() };
    if (lessonId) {
      if (isReal) await api.updateLesson(lessonId, clean);
      patch(boardId, (b) => ({ ...b, lessons: b.lessons.map((l) => (l.id === lessonId ? { ...l, ...clean } : l)) }));
      await note(boardId, 'sua_bai_hoc', clean.title, true);
      return;
    }
    const made: Lesson = isReal ? await api.createLesson(boardId, clean, board.lessons.length) : { id: `bh-${Date.now()}`, ...clean };
    patch(boardId, (b) => ({ ...b, lessons: [...b.lessons, made] }));
    await note(boardId, 'tao_bai_hoc', clean.title, true);
  }, [isReal, boards, patch, note]);

  const removeLesson = useCallback(async (boardId: string, lessonId: string): Promise<void> => {
    if (isReal) await api.deleteLesson(lessonId);
    patch(boardId, (b) => ({
      ...b,
      lessons: b.lessons.filter((l) => l.id !== lessonId),
      tasks: b.tasks.map((t) => (t.lessonId === lessonId ? { ...t, lessonId: undefined } : t)),
      pinned: b.pinned.map((r) => (r.lessonId === lessonId ? { ...r, lessonId: undefined } : r)),
    }));
    await note(boardId, 'xoa_bai_hoc', lessonId, true);
  }, [isReal, patch, note]);

  const saveTask = useCallback(async (boardId: string, taskId: string | null, input: TaskInput): Promise<TaskItem> => {
    if (!input.label.trim()) throw new Error('Hãy nhập tên bài tập / yêu cầu.');
    if (input.assignedAt && input.dueAt && Date.parse(input.dueAt) <= Date.parse(input.assignedAt)) throw new Error('Hạn nộp phải sau lúc giao bài.');
    const board = boards.find((b) => b.id === boardId);
    if (!board) throw new Error('Không tìm thấy lớp.');
    const clean: TaskInput = { ...input, label: input.label.trim(), instructions: input.instructions.trim(), targetUnits: [...new Set(input.targetUnits.map((u) => u.trim()).filter(Boolean))] };
    const view = (id: string): TaskItem => ({ id, label: clean.label, lessonId: clean.lessonId ?? undefined, kind: clean.kind, instructions: clean.instructions, assignedAt: clean.assignedAt, dueAt: clean.dueAt, allowLate: clean.allowLate, targetUnits: clean.targetUnits });
    if (taskId) {
      if (isReal) await api.updateTask(taskId, clean);
      patch(boardId, (b) => ({ ...b, tasks: b.tasks.map((t) => (t.id === taskId ? view(taskId) : t)) }));
      await note(boardId, 'sua_bai_tap', clean.label, true);
      return view(taskId);
    }
    const made: TaskItem = isReal ? await api.createTask(boardId, clean, board.tasks.length) : view(`nv-${Date.now()}`);
    patch(boardId, (b) => ({ ...b, tasks: [...b.tasks, made] }));
    await note(boardId, 'giao_bai_tap', clean.label, true);
    return made;
  }, [isReal, boards, patch, note]);

  const removeTask = useCallback(async (boardId: string, taskId: string): Promise<void> => {
    if (isReal) await api.deleteTask(taskId);
    patch(boardId, (b) => ({
      ...b,
      tasks: b.tasks.filter((t) => t.id !== taskId),
      cards: b.cards.map((c) => (c.taskId === taskId ? { ...c, taskId: '' } : c)),
    }));
    await note(boardId, 'xoa_bai_tap', taskId, true);
  }, [isReal, patch, note]);

  const addResource = useCallback(async (boardId: string, input: MaterialInput): Promise<void> => {
    if (!input.title.trim()) throw new Error('Hãy nhập tên tài liệu.');
    if (input.files.length + input.links.length === 0) throw new Error('Hãy tải lên tệp hoặc dán ít nhất một liên kết.');
    const attachments = await prepareAttachments({ boardId, files: input.files, links: input.links }, isReal, true);
    const kind: ResourceKind = input.kind === 'auto' ? inferKind(attachments) : input.kind;
    const first = attachments.find((a) => a.type === 'link' || a.type === 'embed');
    const payload = { title: input.title.trim(), description: input.description.trim(), url: first?.url ?? '', kind, lessonId: input.lessonId, attachments };
    const res: PinnedResource = isReal
      ? await api.addResource(boardId, payload)
      : { id: `r-${Date.now()}`, kind, title: payload.title, description: payload.description, url: payload.url || attachments[0]?.url || '#', lessonId: input.lessonId ?? undefined, attachments, sizeLabel: sizeLabelOf(attachments) };
    patch(boardId, (b) => ({ ...b, pinned: [...b.pinned, { ...res, sizeLabel: res.sizeLabel ?? sizeLabelOf(attachments) }] }));
    await note(boardId, 'ghim_tai_lieu', input.title, true);
  }, [isReal, patch, note]);

  const updateResource = useCallback(async (boardId: string, resourceId: string, input: MaterialInput): Promise<void> => {
    if (!input.title.trim()) throw new Error('Hãy nhập tên tài liệu.');
    const kept = input.keep ?? [];
    if (kept.length + input.files.length + input.links.length === 0) throw new Error('Tài liệu cần ít nhất một tệp hoặc một liên kết.');
    const added = await prepareAttachments({ boardId, files: input.files, links: input.links }, isReal, true);
    const attachments = [...kept, ...added];
    const kind: ResourceKind = input.kind === 'auto' ? inferKind(attachments) : input.kind;
    const first = attachments.find((a) => a.type === 'link' || a.type === 'embed');
    const payload = { title: input.title.trim(), description: input.description.trim(), url: first?.url ?? '', kind, lessonId: input.lessonId, attachments };
    const res: PinnedResource = isReal
      ? await api.updateResource(resourceId, payload)
      : { id: resourceId, kind, title: payload.title, description: payload.description, url: payload.url || attachments[0]?.url || '#', lessonId: input.lessonId ?? undefined, attachments };
    patch(boardId, (b) => ({ ...b, pinned: b.pinned.map((r) => (r.id === resourceId ? { ...res, sizeLabel: sizeLabelOf(attachments) } : r)) }));
    await note(boardId, 'sua_tai_lieu', input.title, true);
  }, [isReal, patch, note]);

  const removeResource = useCallback(async (boardId: string, resourceId: string): Promise<void> => {
    if (isReal) await api.deleteResource(resourceId);
    patch(boardId, (b) => ({ ...b, pinned: b.pinned.filter((r) => r.id !== resourceId) }));
    await note(boardId, 'go_tai_lieu', resourceId, true);
  }, [isReal, patch, note]);

  const assignToBoards = useCallback(async (sourceBoardId: string, task: TaskItem, targetBoardIds: string[]): Promise<number> => {
    const source = boards.find((b) => b.id === sourceBoardId);
    if (!source) throw new Error('Không tìm thấy lớp nguồn.');
    const lesson = source.lessons.find((l) => l.id === task.lessonId);
    const resources = lesson ? source.pinned.filter((r) => r.lessonId === lesson.id) : [];
    let done = 0;
    for (const targetId of targetBoardIds) {
      const target = boards.find((b) => b.id === targetId);
      if (!target || target.id === sourceBoardId) continue;
      if (target.access && target.access !== 'owner' && target.access !== 'editor') continue; // chỉ lớp tôi được ghi
      const copy: api.AssignmentCopy = isReal
        ? await api.copyAssignmentTo(targetId, { lesson, task, resources }, target.lessons.length, target.tasks.length)
        : {
          lesson: lesson ? { ...lesson, id: `bh-${Date.now()}-${done}` } : undefined,
          task: { ...task, id: `nv-${Date.now()}-${done}` },
          resources: resources.map((r) => ({ ...r, id: `r-${Date.now()}-${done}-${r.id}` })),
        };
      const linked: TaskItem = { ...copy.task, lessonId: copy.lesson?.id };
      const linkedRes = copy.resources.map((r) => ({ ...r, lessonId: copy.lesson?.id }));
      patch(targetId, (b) => ({
        ...b,
        lessons: copy.lesson ? [...b.lessons, copy.lesson] : b.lessons,
        tasks: [...b.tasks, linked],
        pinned: [...b.pinned, ...linkedRes],
      }));
      await note(targetId, 'giao_bai_tap', `${task.label} (giao từ “${source.title}”)`, true);
      done += 1;
    }
    return done;
  }, [isReal, boards, patch, note]);

  const setProgram = useCallback(async (boardId: string, program: string): Promise<void> => {
    const clean = program.trim();
    if (isReal) await api.setBoardProgram(boardId, clean);
    patch(boardId, (b) => ({ ...b, program: clean || undefined }));
    await note(boardId, 'cai_dat', clean ? `Chương trình → ${clean}` : 'Bỏ khỏi chương trình', true);
  }, [isReal, patch, note]);

  const setArchived = useCallback(async (boardId: string, archived: boolean): Promise<void> => {
    const at = archived ? new Date().toISOString() : null;
    if (isReal) await api.setBoardFlags(boardId, { archivedAt: at });
    patch(boardId, (b) => ({ ...b, archivedAt: at }));
    await note(boardId, archived ? 'dong_bang' : 'mo_bang', archived ? 'Đã đóng bảng' : 'Đã mở lại bảng', true);
  }, [isReal, patch, note]);

  const setTrashed = useCallback(async (boardId: string, trashed: boolean): Promise<void> => {
    const at = trashed ? new Date().toISOString() : null;
    if (isReal) await api.setBoardFlags(boardId, { deletedAt: at });
    patch(boardId, (b) => ({ ...b, deletedAt: at }));
    await note(boardId, trashed ? 'thung_rac' : 'khoi_phuc', trashed ? 'Chuyển vào thùng rác' : 'Khôi phục từ thùng rác', true);
  }, [isReal, patch, note]);

  const deleteForever = useCallback(async (boardId: string): Promise<void> => {
    if (isReal) await api.deleteBoardForever(boardId);
    setBoards((l) => l.filter((b) => b.id !== boardId));
  }, [isReal]);

  const setTemplate = useCallback(async (boardId: string, value: boolean): Promise<void> => {
    if (isReal) await api.setBoardFlags(boardId, { isTemplate: value });
    patch(boardId, (b) => ({ ...b, isTemplate: value }));
    await note(boardId, 'danh_dau_mau', value ? 'Đánh dấu là mẫu' : 'Bỏ đánh dấu mẫu', true);
  }, [isReal, patch, note]);

  const loadActivity = useCallback(async (boardId: string): Promise<ActivityEntry[]> => {
    if (isReal) return api.loadActivity(boardId);
    return mockLog[boardId] ?? [];
  }, [isReal, mockLog]);

  const mapCard = useCallback((boardId: string, cardId: string, fn: (c: SubmissionCard) => SubmissionCard): void => {
    patch(boardId, (b) => ({ ...b, cards: b.cards.map((c) => (c.id === cardId ? fn(c) : c)) }));
  }, [patch]);

  const rateCard = useCallback(async (boardId: string, cardId: string, stars: number): Promise<void> => {
    if (stars < 1 || stars > 5) throw new Error('Số sao từ 1 đến 5.');
    if (isReal) await api.rateCard(cardId, stars);
    const prev = getMyRatings()[cardId];
    rememberRating(cardId, stars);
    mapCard(boardId, cardId, (c) => ({
      ...c,
      ratingCount: (c.ratingCount ?? 0) + (prev === undefined ? 1 : 0),
      ratingSum: (c.ratingSum ?? 0) - (prev ?? 0) + stars,
    }));
  }, [isReal, mapCard]);

  const addComment = useCallback(async (boardId: string, cardId: string, author: string, body: string): Promise<CardComment> => {
    const name = author.trim();
    if (!name) throw new Error('Hãy nhập tên của bạn.');
    if (name.length > 40) throw new Error('Tên tối đa 40 ký tự.');
    const check = checkComment(body);
    if (!check.ok) throw new Error(check.message);
    const nameCheck = checkComment(name);
    if (!nameCheck.ok && nameCheck.problem === 'profanity') throw new Error('Tên có từ chưa phù hợp. Hãy dùng tên thật hoặc biệt danh lịch sự.');
    const mode = boards.find((b) => b.id === boardId)?.settings.moderation ?? 'manual';
    const comment: CardComment = isReal
      ? await api.postComment(cardId, name, body.trim())
      : { id: `cm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, cardId, author: name, body: body.trim(), at: new Date().toISOString(), status: mode === 'manual' ? 'pending' : 'visible' };
    rememberMyComment(comment.id);
    mapCard(boardId, cardId, (c) => ({ ...c, comments: [...(c.comments ?? []), comment] }));
    return comment;
  }, [isReal, mapCard, boards]);

  const deleteOwnComment = useCallback(async (boardId: string, cardId: string, commentId: string): Promise<void> => {
    if (isReal) await api.deleteOwnComment(commentId);
    mapCard(boardId, cardId, (c) => ({ ...c, comments: (c.comments ?? []).filter((m) => m.id !== commentId) }));
  }, [isReal, mapCard]);

  const setCommentStatus = useCallback(async (boardId: string, cardId: string, commentId: string, status: 'visible' | 'pending' | 'hidden'): Promise<void> => {
    if (isReal) await api.setCommentStatus(commentId, status);
    mapCard(boardId, cardId, (c) => ({ ...c, comments: (c.comments ?? []).map((m) => (m.id === commentId ? { ...m, status } : m)) }));
  }, [isReal, mapCard]);

  const deleteComment = useCallback(async (boardId: string, cardId: string, commentId: string): Promise<void> => {
    if (isReal) await api.deleteComment(commentId);
    mapCard(boardId, cardId, (c) => ({ ...c, comments: (c.comments ?? []).filter((m) => m.id !== commentId) }));
  }, [isReal, mapCard]);

  const setTeacherStars = useCallback(async (boardId: string, cardId: string, stars: number | null): Promise<void> => {
    if (isReal) await api.setTeacherStars(cardId, stars);
    mapCard(boardId, cardId, (c) => ({ ...c, teacherStars: stars ?? undefined }));
  }, [isReal, mapCard]);

  const inviteCollaborator = useCallback(async (boardId: string, rawEmail: string, role: CollabRole): Promise<void> => {
    const email = api.normalizeEmail(rawEmail);
    if (!api.isValidEmail(email)) throw new Error('Địa chỉ email chưa đúng. Ví dụ: ten@gmail.com');
    const board = boards.find((b) => b.id === boardId);
    if (!board) throw new Error('Không tìm thấy bảng.');
    if ((board.ownerEmail ?? '').toLowerCase() === email || email === actor.toLowerCase()) throw new Error('Đây là tài khoản của chủ bảng, không cần mời.');
    if ((board.collaborators ?? []).some((c) => c.email === email)) throw new Error('Người này đã được chia sẻ. Đổi quyền ở danh sách bên dưới.');
    if ((board.collaborators ?? []).length >= 20) throw new Error('Mỗi bảng chia sẻ tối đa 20 giáo viên.');
    const added = isReal
      ? await api.addCollaborator(boardId, email, role, actor)
      : { email, role, addedAt: new Date().toISOString() };
    patch(boardId, (b) => ({ ...b, collaborators: [...(b.collaborators ?? []), added] }));
    await note(boardId, 'chia_se', `${email} · ${role === 'editor' ? 'đồng quản lý' : 'chỉ xem'}`, true);
  }, [boards, actor, isReal, patch, note]);

  const changeCollaboratorRole = useCallback(async (boardId: string, email: string, role: CollabRole): Promise<void> => {
    if (isReal) await api.updateCollaboratorRole(boardId, email, role);
    patch(boardId, (b) => ({ ...b, collaborators: (b.collaborators ?? []).map((c) => (c.email === email ? { ...c, role } : c)) }));
    await note(boardId, 'doi_quyen', `${email} → ${role === 'editor' ? 'đồng quản lý' : 'chỉ xem'}`, true);
  }, [isReal, patch, note]);

  const removeCollaborator = useCallback(async (boardId: string, email: string): Promise<void> => {
    if (isReal) await api.removeCollaborator(boardId, email);
    patch(boardId, (b) => ({ ...b, collaborators: (b.collaborators ?? []).filter((c) => c.email !== email) }));
    await note(boardId, 'go_chia_se', email, true);
  }, [isReal, patch, note]);

  const leaveBoard = useCallback(async (boardId: string): Promise<void> => {
    if (isReal) {
      await api.removeCollaborator(boardId, actor);
      setBoards((l) => l.filter((b) => b.id !== boardId)); // RLS sẽ ẩn bảng với tôi từ lần tải sau
    } else {
      // Bản mẫu: chỉ gỡ tên tôi khỏi danh sách chia sẻ, bảng của chủ vẫn còn.
      patch(boardId, (b) => ({ ...b, collaborators: (b.collaborators ?? []).filter((c) => c.email !== actor.toLowerCase()) }));
    }
  }, [isReal, actor, patch]);

  return {
    boards: visibleBoards, loading, error, isReal, linkToken,
    rateCard, addComment, deleteOwnComment, setCommentStatus, deleteComment, setTeacherStars,
    inviteCollaborator, changeCollaboratorRole, removeCollaborator, leaveBoard,
    createBoard, duplicateBoard, updateMeta, addCard, setCardLayout, setStatus, setGrade, vote, deleteCard, clearSubmissions,
    setRoster, setSettings, saveLesson, removeLesson, saveTask, removeTask, addResource, removeResource, updateResource, assignToBoards, setProgram, setArchived, setTrashed, deleteForever, setTemplate, loadActivity,
  };
}
