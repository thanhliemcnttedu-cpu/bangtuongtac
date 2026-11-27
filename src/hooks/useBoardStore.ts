import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ActivityEntry, AttendanceSession, Attachment, BoardData, CardComment, ModerationMode, CardLayoutPatch, CardLocation, CardStatus, CollabRole, LinkMode, Lesson, PinnedResource, ResourceKind, RosterMember, SubmissionCard, TaskItem, TaskLog, TaskProgress, TaskSubItem, ItemStatus,
} from '../types/board';
import { MOCK_BOARDS } from '../data/mockBoardData';
import { buildLargeDemo } from '../data/demoLarge';
import { nextInstance, taskToInput } from '../lib/recurrence';
import { BOARD_TEMPLATES } from '../data/boardTemplates';
import type { BoardTemplate } from '../data/boardTemplates';
import { isSupabaseConfigured } from '../lib/supabase';
import * as api from '../lib/boardApi';
import { linkToAttachment } from '../lib/embeds';
import { MAX_FILE_BYTES, attachmentTypeOf, baseMime, compressImage, docKindOf, formatSize, validateFile } from '../lib/media';
import { removeStoredFiles, uploadAttachment } from '../lib/storage';
import { pollDelay, tokensToCheck } from '../lib/pollPlan';
import { DRIVE_MAX_BYTES, driveAttachment, gatewayDelete, gatewayOf, gatewaySend, getDrive, loadDefaultGateway } from '../lib/drive';
import type { GatewayConfig } from '../lib/drive';
import { ROOT_FOLDER, boardFolderName, safe } from '../lib/driveBackup';
import { checkComment, textFlagged } from '../lib/moderation';
import { getMyCardIds, getMyRatings, rememberMyCard, rememberMyComment, rememberRating } from '../lib/peer';
import type { LessonInput, TaskInput } from '../lib/boardApi';
import { checkSubmit } from '../lib/lessons';
import { newEditCode, normalizeEditCode, normalizeName } from '../lib/editCode';
import { cleanJoinCode, randomJoinCode } from '../lib/joinCode';
import { stripRich } from '../lib/richText';
import * as itemsApi from '../lib/taskItemsApi';
import { actionOf, diffItem } from '../lib/taskPlan';

/** Cứ mỗi chừng này mili giây trang hỏi "dấu vân tay" của bảng; có đổi thì tải lại êm, không cần bấm F5. */
const POLL_MS = 5000;
/** Học sinh không đăng nhập đông hơn nhiều giáo viên: hỏi thưa hơn một chút để máy chủ nhẹ khi cả trường vào cùng lúc. */
const POLL_GUEST_MS = 8000;
/** Chưa chạy lệnh SQL cập nhật thì không có dấu vân tay: tải lại cả bảng thưa hơn để đỡ tốn dữ liệu. */
const POLL_FALLBACK_MS = 20000;

export interface CardEditInput { title: string; body: string; authorName: string; unit: string; keep: Attachment[]; files: File[]; links: string[] }

/** Giữ lại những thứ chỉ có ở trình duyệt này khi dữ liệu mới về: mã sửa bài, và bài đang chờ duyệt của chính học sinh (máy chủ không trả bài chờ duyệt cho người khác). */
function keepLocal(prev: BoardData[], next: BoardData[], signedIn: boolean): BoardData[] {
  const mine = signedIn ? new Set<string>() : getMyCardIds();
  const merged = next.map((nb) => {
    const pb = prev.find((b) => b.id === nb.id);
    if (!pb) return nb;
    const codes = new Map(pb.cards.filter((c) => c.editCode).map((c) => [c.id, c.editCode]));
    const have = new Set(nb.cards.map((c) => c.id));
    const cards = nb.cards.map((c) => (codes.has(c.id) ? { ...c, editCode: codes.get(c.id) } : c));
    const own = pb.cards.filter((c) => !have.has(c.id) && mine.has(c.id) && c.status === 'pending');
    return own.length > 0 ? { ...nb, cards: [...own, ...cards] } : { ...nb, cards };
  });
  return JSON.stringify(merged) === JSON.stringify(prev) ? prev : merged;
}

/** Kết quả dọn tệp khi xóa bài: số tệp đã xóa khỏi kho, trên Drive, và số tệp Drive chưa xóa được. */
export interface CleanupReport { storageRemoved: number; driveDeleted: number; driveFailed: number; driveError?: string }

/** Dọn tệp của các đính kèm bị xóa: kho Supabase (chế độ thật) và bản sao trên Google Drive của giáo viên. Lỗi từng phần không chặn việc xóa bài. */
async function cleanupAttachments(list: Attachment[], real: boolean, cfg: GatewayConfig | null): Promise<CleanupReport> {
  const rep: CleanupReport = { storageRemoved: 0, driveDeleted: 0, driveFailed: 0 };
  if (real) { try { rep.storageRemoved = await removeStoredFiles(list.map((a) => a.url)); } catch { /* kho từ chối: để lại, không chặn */ } }
  const ids = [...new Set(list.map((a) => a.driveId).filter((x): x is string => !!x))];
  if (ids.length > 0) {
    try {
      if (cfg) { rep.driveDeleted = await gatewayDelete(cfg, ids); rep.driveFailed = Math.max(0, ids.length - rep.driveDeleted); } // một lần gọi cho mọi tệp
      else {
        const drive = getDrive(!real, cfg);
        for (const id of ids) { try { await drive.deleteFile(id); rep.driveDeleted += 1; } catch (e) { rep.driveFailed += 1; rep.driveError = e instanceof Error ? e.message : undefined; } }
      }
    } catch (e) { rep.driveFailed += ids.length; rep.driveError = e instanceof Error ? e.message : undefined; }
  }
  return rep;
}

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
  /** Trình bày thẻ: nhãn nhỏ, màu, các bước (mỗi dòng một bước) và tên nút cho từng tệp / liên kết mới (cùng thứ tự). */
  badge?: string;
  color?: string;
  steps?: string;
  fileLabels?: string[];
  linkLabels?: string[];
}

const withLabels = (list: Attachment[], fileLabels: string[] = [], linkLabels: string[] = [], nFiles: number): Attachment[] =>
  list.map((a, i) => { const lab = (i < nFiles ? fileLabels[i] : linkLabels[i - nFiles])?.trim(); return lab ? { ...a, label: lab } : a; });

const stepsOf = (text?: string): string[] => (text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 12);

export interface DuplicateOptions {
  title: string;
  keepRoster: boolean;
  keepPinned: boolean;
}

/** Dữ liệu nhập của một đầu việc: giữ lại các minh chứng cũ (keep), thêm tệp / liên kết mới kèm phân loại. */
export interface ItemInput {
  title: string; subject: string; plannedAt: string | null; status: ItemStatus; result: string; note: string;
  startedAt: string | null; doneAt: string | null; sort: number;
  keep: Attachment[]; files: File[]; links: string[]; group: string;
}

export interface BoardStore {
  boards: BoardData[];
  loading: boolean;
  error: string;
  /** Token của bảng đang mở trên màn hình ('' nếu đang ở trang khác): chỉ bảng này được hỏi dữ liệu mới thường xuyên. */
  watchBoard: (token: string) => void;
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
  /** Giáo viên xóa bài thì xóa luôn tệp trên kho và trên Drive của giáo viên; trả về kết quả dọn dẹp. */
  deleteCard: (boardId: string, cardId: string, asManager: boolean) => Promise<CleanupReport | void>;
  /** Học sinh (không cần đăng nhập) mở lại bài của mình bằng mã sửa bài; null nếu mã không đúng. */
  findCardByCode: (boardId: string, code: string) => Promise<SubmissionCard | null>;
  /** Giáo viên chuyển các bài đã chọn sang một nhiệm vụ khác. */
  moveCards: (boardId: string, cardIds: string[], taskId: string) => Promise<void>;
  /** Danh sách tên để học sinh chọn khi nộp bài (không cần đăng nhập). */
  loadRosterNames: (boardId: string) => Promise<{ name: string; unit: string; role?: string }[]>;
  /** Giáo viên gán bài nộp cho một thành viên trong danh sách (sửa tên và tổ cho khớp). */
  reassignCard: (boardId: string, cardId: string, member: { name: string; unit: string }) => Promise<void>;
  /** Tìm bài theo tên người nộp (tên chính là chìa khóa để sửa). */
  findCardsByName: (boardId: string, name: string) => Promise<SubmissionCard[]>;
  /** Sửa (del = false) hoặc xóa (del = true) bài bằng mã sửa bài. Trả bài sau khi sửa, hoặc null nếu đã xóa. */
  saveCardByCode: (boardId: string, code: string, input: CardEditInput, del?: boolean) => Promise<SubmissionCard | null>;
  clearSubmissions: (boardId: string) => Promise<CleanupReport | void>;
  /** Ghi lại đính kèm của một bài (sau khi chuyển tệp sang Drive). */
  updateCardAttachments: (boardId: string, cardId: string, attachments: Attachment[]) => Promise<void>;
  /** Xóa tệp khỏi kho Supabase (không đụng tới Drive). */
  removeStoredAttachments: (attachments: Attachment[]) => Promise<void>;
  setRoster: (boardId: string, roster: RosterMember[]) => Promise<void>;
  setSettings: (boardId: string, patch: { linkMode?: LinkMode; moderation?: ModerationMode }) => Promise<void>;
  /** Bài học / buổi tập huấn: thêm (lessonId = null) hoặc sửa. */
  saveLesson: (boardId: string, lessonId: string | null, input: LessonInput) => Promise<void>;
  /** Xóa bài học; bài tập và tài liệu của bài chuyển về "chung của lớp" (bài nộp không mất). */
  removeLesson: (boardId: string, lessonId: string) => Promise<void>;
  /** Bài tập / yêu cầu: thêm (taskId = null) hoặc sửa. Trả về bài tập đã lưu. */
  saveTask: (boardId: string, taskId: string | null, input: TaskInput) => Promise<TaskItem>;
  removeTask: (boardId: string, taskId: string) => Promise<void>;
  /** Việc riêng: đổi cột Kanban (Cần làm / Đang làm / Xong). */
  /** Việc định kỳ: sinh kỳ mới cho các việc đã hết hạn. Trả về số kỳ mới. Chỉ chủ bảng. */
  rollRecurring: (boardId: string) => Promise<number>;
  /** Điểm danh lớp tập huấn: tải các buổi, tạo / xóa buổi, đánh dấu có mặt (theo tên chuẩn hóa). */
  loadAttendance: (boardId: string) => Promise<void>;
  addAttendanceSession: (boardId: string, day: string, label: string) => Promise<void>;
  removeAttendanceSession: (boardId: string, day: string) => Promise<void>;
  setAttendancePresent: (boardId: string, day: string, nameKey: string, present: boolean) => Promise<void>;
  /** Đổi link chia sẻ của bảng (link và QR cũ ngừng hoạt động). */
  regenerateLink: (boardId: string) => Promise<void>;
  /** Đổi mã vào lớp (6 số) sang mã mới; mã cũ ngừng dùng. */
  changeJoinCode: (boardId: string) => Promise<void>;
  /** Bật / tắt việc học sinh vào bảng bằng mã. */
  setJoinEnabled: (boardId: string, enabled: boolean) => Promise<void>;
  /** Học sinh nhập mã ở trang chủ: trả về mã link của bảng, null nếu mã sai. */
  resolveJoinCode: (code: string) => Promise<string | null>;
  setTaskProgress: (boardId: string, taskId: string, progress: TaskProgress) => Promise<void>;
  /** Đầu việc thành phần và nhật ký tiến độ của một công việc (Đợt A). */
  loadTaskItems: (boardId: string, taskId: string) => Promise<{ items: TaskSubItem[]; logs: TaskLog[] }>;
  /** Đọc đầu việc của nhiều công việc cùng lúc để tính tiến độ trên danh sách. */
  loadItemSummaries: (taskIds: string[]) => Promise<TaskSubItem[]>;
  /** Thêm (prev = null) hoặc sửa một đầu việc; ghi nhật ký những gì đã đổi. */
  saveTaskItem: (boardId: string, taskId: string, prev: TaskSubItem | null, input: ItemInput, reason?: string) => Promise<TaskSubItem>;
  /** Thêm nhiều đầu việc một lượt (mỗi dòng một đối tượng). */
  addTaskItems: (boardId: string, taskId: string, rows: { title: string; subject: string; plannedAt: string | null }[], startSort: number) => Promise<void>;
  /** Xóa mềm / khôi phục đầu việc (kèm lý do). */
  setTaskItemDeleted: (boardId: string, item: TaskSubItem, deleted: boolean, reason?: string) => Promise<void>;
  reorderTaskItems: (boardId: string, taskId: string, ordered: TaskSubItem[]) => Promise<void>;
  /** Ghi một dòng ghi chú vào nhật ký (công việc tổng hoặc một đầu việc). */
  addTaskNote: (boardId: string, taskId: string, itemId: string | null, note: string) => Promise<void>;
  /** Bảng việc riêng của tôi: có rồi thì trả về, chưa có thì tạo (ẩn khỏi danh sách bảng). */
  ensurePersonalBoard: () => Promise<BoardData>;
  /** Chuẩn bị tệp và liên kết đính kèm (giáo án, minh chứng…) của bảng: tải lên Drive của giáo viên nếu có cổng, không thì kho hệ thống. */
  prepareFiles: (boardId: string, files: File[], links: string[], folder: string) => Promise<Attachment[]>;
  addResource: (boardId: string, input: MaterialInput) => Promise<void>;
  removeResource: (boardId: string, resourceId: string) => Promise<void>;
  updateResource: (boardId: string, resourceId: string, input: MaterialInput) => Promise<void>;
  /** Giáo viên kéo thả: ids là thứ tự mới của các tài liệu trong cùng một nhóm (bài học hoặc tài liệu chung). */
  reorderResources: (boardId: string, ids: string[]) => Promise<void>;
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
async function prepareAttachments(
  input: { boardId: string; files: File[]; links: string[] }, real: boolean, allowArchive = false,
  /** Có cổng Drive thì mọi tệp (bài nộp, tài liệu, minh chứng, hồ sơ) đi thẳng vào Drive của giáo viên; lỗi cổng thì quay về kho Supabase để việc đang làm không bị chặn. */
  drive?: { cfg: GatewayConfig; folder: string[]; author: string },
): Promise<Attachment[]> {
  // Báo tiến độ theo số tệp đã tải xong để biểu mẫu hiển thị "Đang tải tệp 2/5".
  let done = 0;
  const report = (): void => { window.dispatchEvent(new CustomEvent('bt:upload', { detail: { done, total: input.files.length } })); };
  if (input.files.length > 0) report();
  const one = async (raw: File): Promise<Attachment> => {
    const file = await compressImage(raw);
    const problem = validateFile(file, allowArchive, drive ? DRIVE_MAX_BYTES : undefined);
    if (problem) throw new Error(`${raw.name}: ${problem}`);
    const base = { type: attachmentTypeOf(file), name: file.name, mime: baseMime(file), size: file.size };
    if (drive) {
      try {
        const up = await gatewaySend(drive.cfg, drive.folder, `${safe(drive.author, 30)} - ${safe(file.name, 60)}`, file);
        return driveAttachment({ ...base }, up.id);
      } catch (e) {
        // Tệp lớn không có chỗ dự phòng: báo lỗi rõ. Tệp vừa thì quay về kho Supabase bên dưới để vẫn nộp được.
        if (file.size > MAX_FILE_BYTES) throw new Error(`${raw.name}: ${e instanceof Error ? e.message : 'không tải được lên Drive'}`);
      }
    }
    if (real) {
      const up = await uploadAttachment(input.boardId, file);
      return { ...base, url: up.url };
    }
    return { ...base, url: URL.createObjectURL(file) };
  };
  const files = await Promise.all(input.files.map(async (raw) => { const a = await one(raw); done += 1; report(); return a; }));
  return [...files, ...input.links.map((l) => linkToAttachment(l))];
}

/** Tự nhận loại tài liệu từ đính kèm đầu tiên (PDF, slide, video, âm thanh, ảnh, liên kết, tệp khác). */
function inferKind(list: Attachment[]): ResourceKind {
  const a = list[0];
  if (!a) return 'link';
  // Tệp đã nằm trên Drive (nhúng xem trước) vẫn phân loại theo loại tệp, không coi là liên kết.
  if (a.driveId) {
    if (a.type === 'image') return 'image';
    const m = a.mime ?? '';
    if (m.startsWith('video/')) return 'video';
    if (m.startsWith('audio/')) return 'audio';
    const k = docKindOf(a);
    return k === 'pdf' ? 'pdf' : k === 'powerpoint' ? 'slide' : 'file';
  }
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
const isTeamBoard = (s: { scope?: string } | undefined): boolean => s?.scope === 'team';

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

  const boardsRef = useRef<BoardData[]>(boards);
  boardsRef.current = boards;
  /** Dấu vân tay đã thấy của từng bảng (theo token). */
  const fpRef = useRef<Record<string, string | null>>({});
  const watchedRef = useRef('');
  const checkNowRef = useRef<() => void>(() => undefined);
  const watchBoard = useCallback((token: string): void => {
    if (watchedRef.current === token) return;
    watchedRef.current = token;
    if (token) checkNowRef.current();
  }, []);

  const loadAll = useCallback(async (first: boolean): Promise<{ all: BoardData[]; missing: boolean }> => {
    if (first && userId) { try { await api.purgeTrash(); } catch { /* chưa có hàm dọn thùng rác: bỏ qua */ } }
    const mine = userId ? await api.loadMyBoards(actor) : [];
    const isMine = linkToken ? mine.some((b) => b.shareToken === linkToken) : true;
    const pub = linkToken && !isMine ? await api.loadPublicBoard(linkToken) : null;
    return { all: pub ? [pub, ...mine] : mine, missing: !!linkToken && !pub && !isMine };
  }, [userId, linkToken, actor]);

  // Nạp dữ liệu thật mỗi khi đổi tài khoản Gmail hoặc mở link /b/<token>.
  useEffect(() => {
    if (!isReal) return;
    let alive = true;
    setLoading(true);
    setError('');
    fpRef.current = {};
    (async () => {
      const { all, missing } = await loadAll(true);
      if (!alive) return;
      setBoards(all);
      if (missing) setError('Không tìm thấy bảng với liên kết này.');
    })()
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'Không tải được dữ liệu.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [isReal, loadAll]);

  // Tự làm mới êm: hỏi dấu vân tay (rất nhẹ), có đổi mới tải lại. Nhịp 5–8 giây khi đang có thay đổi, lâu im thì thưa dần (pollPlan).
  // Tạm nghỉ khi thẻ trình duyệt bị ẩn hoặc đang kéo thả.
  useEffect(() => {
    if (!isReal) return;
    let stop = false;
    let busy = false;
    let down = false;
    let useFallback = false;
    let lastFull = Date.now();
    const base = userId ? POLL_MS : POLL_GUEST_MS;
    let lastChange = Date.now();
    let lastTick = 0;
    let lastSweep = 0;
    const refresh = async (): Promise<void> => {
      const { all } = await loadAll(false);
      if (!stop) setBoards((prev) => keepLocal(prev, all, !!userId));
      lastFull = Date.now();
    };
    const tick = async (now = false): Promise<void> => {
      if (busy || stop || document.hidden || down) return;
      // Hẹn giờ chạy đều theo nhịp gốc; chưa tới lượt (đang thưa nhịp) thì bỏ qua. Trừ 500ms vì hẹn giờ không đúng từng mili giây.
      if (!now && Date.now() - lastTick < pollDelay(base, Date.now() - lastChange) - 500) return;
      busy = true;
      lastTick = Date.now();
      try {
        if (useFallback) { if (Date.now() - lastFull >= POLL_FALLBACK_MS) await refresh(); return; }
        const all = [...new Set([...(linkToken ? [linkToken] : []), ...boardsRef.current.filter((b) => !b.deletedAt).map((b) => b.shareToken)])].slice(0, 20);
        // Mở bảng nào hỏi bảng đó; các bảng còn lại gom lại hỏi thưa.
        const { tokens, sweep } = tokensToCheck(all, watchedRef.current || linkToken || '', Date.now() - lastSweep);
        if (tokens.length === 0) return;
        if (sweep) lastSweep = Date.now();
        const fps = await Promise.all(tokens.map((t) => api.boardFingerprint(t, !!userId).then((f) => ({ f }), (e: unknown) => ({ e }))));
        let changed = false;
        let missingFn = false;
        tokens.forEach((t, i) => {
          const r = fps[i];
          if ('e' in r) { missingFn = true; return; }
          if (t in fpRef.current && fpRef.current[t] !== r.f) changed = true;
          fpRef.current[t] = r.f;
        });
        if (missingFn && !changed) { useFallback = true; return; }
        if (changed) { lastChange = Date.now(); await refresh(); }
      } catch { /* mất mạng một lúc: lần sau thử lại */ } finally { busy = false; }
    };
    const timer = window.setInterval(() => { void tick(); }, base);
    // Quay lại thẻ: hỏi ngay mọi bảng và trở về nhịp nhanh.
    const onShow = (): void => { if (!document.hidden) { lastChange = Date.now(); lastSweep = 0; void tick(true); } };
    checkNowRef.current = () => { lastChange = Date.now(); void tick(true); };
    window.addEventListener('focus', onShow);
    window.addEventListener('online', onShow);
    const onDown = (): void => { down = true; };
    const onUp = (): void => { down = false; };
    document.addEventListener('visibilitychange', onShow);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
    return () => {
      stop = true;
      checkNowRef.current = () => undefined;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('focus', onShow);
      window.removeEventListener('online', onShow);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
    };
  }, [isReal, userId, linkToken, loadAll]);

  const createBoard = useCallback(async (title: string, tpl: BoardTemplate, extras: { lessonTitle?: string; program?: string } = {}): Promise<BoardData> => {
    // Bảng mới dùng luôn cổng Drive đã kết nối trên trình duyệt này (nếu có).
    const gw = loadDefaultGateway();
    const template: BoardTemplate = gw ? { ...tpl, settings: { ...tpl.settings, driveUrl: gw.url, driveSecret: gw.secret } } : tpl;
    if (!isReal) {
      const lesson: Lesson | undefined = extras.lessonTitle ? { id: `bh-${Date.now()}`, title: extras.lessonTitle, description: '', startsAt: null, endsAt: null } : undefined;
      const b: BoardData = {
        id: `mau-${Date.now()}`, mode: template.mode, title, subtitle: 'Bảng mẫu mới', goals: template.goals, shareToken: randomToken(),
        joinCode: randomJoinCode(), joinEnabled: !isTeamBoard(template.settings),
        linkMode: 'guest_post', pinned: [], lessons: lesson ? [lesson] : [], program: extras.program, sessions: [], roster: [], cards: [], settings: template.settings,
        tasks: [], createdAt: new Date().toISOString(), isTemplate: false,
        ownerEmail: actor, collaborators: [],
      };
      boardsRef.current = [b, ...boardsRef.current];
      setBoards((l) => [b, ...l]);
      return b;
    }
    if (!userId) throw new Error('Cần đăng nhập Gmail để tạo bảng.');
    const b = await api.createBoard(title, template, userId, extras);
    boardsRef.current = [b, ...boardsRef.current];
    setBoards((l) => [b, ...l]);
    return b;
  }, [isReal, userId, actor]);

  const duplicateBoard = useCallback(async (source: BoardData, opts: DuplicateOptions): Promise<BoardData> => {
    let copy: BoardData;
    if (!isReal) {
      copy = {
        ...source, id: `mau-${Date.now()}`, title: opts.title, shareToken: randomToken(), joinCode: randomJoinCode(), cards: [], isTemplate: false,
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
    const gb = boards.find((b) => b.id === input.boardId);
    const cfg = gatewayOf(gb?.settings);
    const attachments = await prepareAttachments(input, isReal, false, gb && cfg ? { cfg, folder: [ROOT_FOLDER, boardFolderName(gb), 'Bài nộp'], author: input.authorName } : undefined);
    // off: hiện ngay · manual: chờ giáo viên · auto: hệ thống đọc chữ, sạch thì duyệt luôn, nghi ngờ thì giữ lại.
    const status: CardStatus = asManager || moderation === 'off' ? 'approved'
      : moderation === 'manual' ? 'pending'
        : textFlagged([input.authorName, input.unit, input.title, stripRich(input.body), input.location?.name, ...(input.poll ?? []), ...attachments.map((a) => a.name)]) ? 'pending' : 'approved';
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
        status, late: late || undefined, submittedAt: new Date().toISOString(), editCode: newEditCode(),
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

  const deleteCard = useCallback(async (boardId: string, cardId: string, asManager: boolean): Promise<CleanupReport | void> => {
    const atts = boards.find((b) => b.id === boardId)?.cards.find((c) => c.id === cardId)?.attachments ?? [];
    if (isReal) await (asManager ? api.deleteCardAsManager(cardId) : api.deleteOwnCard(cardId));
    let label = '';
    patch(boardId, (b) => ({ ...b, cards: b.cards.filter((c) => { if (c.id === cardId) label = `${c.authorName} · ${c.title}`; return c.id !== cardId; }) }));
    await note(boardId, 'xoa_bai', label, false);
    return asManager ? cleanupAttachments(atts, isReal, gatewayOf(boards.find((b) => b.id === boardId)?.settings)) : undefined;
  }, [isReal, boards, patch, note]);

  const findCardByCode = useCallback(async (boardId: string, code: string): Promise<SubmissionCard | null> => {
    const clean = normalizeEditCode(code);
    if (clean.length < 6) return null;
    const b = boards.find((x) => x.id === boardId);
    if (!b) return null;
    if (!isReal) return b.cards.find((c) => c.editCode === clean) ?? null;
    return api.getCardByCode(b.shareToken, clean);
  }, [isReal, boards]);

  const moveCards = useCallback(async (boardId: string, cardIds: string[], taskId: string): Promise<void> => {
    if (cardIds.length === 0) return;
    if (isReal) await api.moveCardsToTask(cardIds, taskId);
    const ids = new Set(cardIds);
    patch(boardId, (b) => ({ ...b, cards: b.cards.map((c) => (ids.has(c.id) ? { ...c, taskId } : c)) }));
    const label = boards.find((b) => b.id === boardId)?.tasks.find((t) => t.id === taskId)?.label ?? 'không thuộc nhiệm vụ nào';
    await note(boardId, 'chuyen_bai', `${cardIds.length} bài → ${label}`, false);
  }, [isReal, boards, patch, note]);

  const loadRosterNames = useCallback(async (boardId: string): Promise<{ name: string; unit: string; role?: string }[]> => {
    const b = boards.find((x) => x.id === boardId);
    if (!b) return [];
    if (!isReal) return b.roster.map((m) => ({ name: m.name, unit: m.unit, role: m.role ?? '' }));
    try { return await api.getRosterPublic(b.shareToken); } catch { return []; }
  }, [isReal, boards]);

  const reassignCard = useCallback(async (boardId: string, cardId: string, member: { name: string; unit: string }): Promise<void> => {
    if (isReal) await api.reassignCard(cardId, member.name, member.unit);
    patch(boardId, (b) => ({ ...b, cards: b.cards.map((c) => (c.id === cardId ? { ...c, authorName: member.name, unit: member.unit || c.unit } : c)) }));
  }, [isReal, patch]);

  const findCardsByName = useCallback(async (boardId: string, name: string): Promise<SubmissionCard[]> => {
    const key = normalizeName(name);
    if (key.length < 2) return [];
    const b = boards.find((x) => x.id === boardId);
    if (!b) return [];
    if (!isReal) return b.cards.filter((c) => c.editCode && normalizeName(c.authorName) === key);
    return api.getCardsByName(b.shareToken, key);
  }, [isReal, boards]);

  const saveCardByCode = useCallback(async (boardId: string, code: string, input: CardEditInput, del = false): Promise<SubmissionCard | null> => {
    const clean = normalizeEditCode(code);
    const b = boards.find((x) => x.id === boardId);
    if (!b) throw new Error('Không tìm thấy bảng.');
    const old = isReal ? await api.getCardByCode(b.shareToken, clean) : b.cards.find((c) => c.editCode === clean) ?? null;
    if (!old) throw new Error('Mã sửa bài không đúng.');
    const cfg = gatewayOf(b.settings);
    let attachments = input.keep;
    if (!del) {
      const added = await prepareAttachments({ boardId, files: input.files, links: input.links }, isReal, false, cfg ? { cfg, folder: [ROOT_FOLDER, boardFolderName(b), 'Bài nộp'], author: input.authorName } : undefined);
      attachments = [...input.keep, ...added];
    }
    let status: CardStatus = old.status;
    if (!isReal && !del) {
      // Bản mẫu mô phỏng đúng máy chủ: sửa xong thì áp lại chế độ kiểm duyệt của bảng.
      const mode = b.settings.moderation;
      const flagged = mode === 'auto' && textFlagged([input.authorName, input.unit, input.title, stripRich(input.body), ...attachments.map((x) => x.name)]);
      status = mode === 'manual' || flagged ? 'pending' : old.status === 'featured' ? 'featured' : 'approved';
    }
    if (isReal) {
      const st = await api.updateCardByCode(b.shareToken, clean, { title: input.title, body: input.body, authorName: input.authorName, unit: input.unit, attachments }, del);
      if (st !== 'deleted') status = st as CardStatus;
    }
    // Tệp bị bỏ khỏi bài (hoặc cả bài bị xóa) thì dọn khỏi kho và Drive; lỗi dọn không chặn việc sửa.
    const keptKeys = new Set(del ? [] : attachments.map((a) => a.url ?? a.driveId));
    const dropped = old.attachments.filter((a) => !keptKeys.has(a.url ?? a.driveId));
    if (dropped.length > 0) { try { await cleanupAttachments(dropped, isReal, cfg); } catch { /* bỏ qua */ } }
    const next: SubmissionCard = { ...old, title: input.title, body: input.body, authorName: input.authorName, unit: input.unit, attachments, status, editCode: clean, resubmittedAt: new Date().toISOString(), revisions: (old.revisions ?? 0) + 1 };
    patch(boardId, (bd) => ({ ...bd, cards: del ? bd.cards.filter((c) => c.id !== old.id) : bd.cards.some((c) => c.id === old.id) ? bd.cards.map((c) => (c.id === old.id ? next : c)) : [next, ...bd.cards] }));
    return del ? null : next;
  }, [isReal, boards, patch]);

  const updateCardAttachments = useCallback(async (boardId: string, cardId: string, attachments: Attachment[]): Promise<void> => {
    if (isReal) await api.updateCardAttachments(cardId, attachments);
    patch(boardId, (b) => ({ ...b, cards: b.cards.map((c) => (c.id === cardId ? { ...c, attachments } : c)) }));
  }, [isReal, patch]);

  const removeStoredAttachments = useCallback(async (attachments: Attachment[]): Promise<void> => {
    if (isReal) await removeStoredFiles(attachments.map((a) => a.url));
    else attachments.forEach((a) => { if (a.url?.startsWith('blob:')) URL.revokeObjectURL(a.url); });
  }, [isReal]);

  const clearSubmissions = useCallback(async (boardId: string): Promise<CleanupReport | void> => {
    const atts = (boards.find((b) => b.id === boardId)?.cards ?? []).flatMap((c) => c.attachments);
    if (isReal) await api.clearSubmissions(boardId);
    patch(boardId, (b) => ({ ...b, cards: [] }));
    await note(boardId, 'xoa_het', 'Đã xóa toàn bộ bài nộp', true);
    return cleanupAttachments(atts, isReal, gatewayOf(boards.find((b) => b.id === boardId)?.settings));
  }, [isReal, boards, patch, note]);

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
    const board = boardsRef.current.find((b) => b.id === boardId);
    if (!board) throw new Error('Không tìm thấy lớp.');
    // Tài liệu / liên kết của công việc: tệp mới được tải lên (Drive của giáo viên nếu có cổng, không thì kho hệ thống).
    const tcfg = gatewayOf(board.settings);
    const added = (input.files?.length ?? 0) + (input.links?.length ?? 0) > 0
      ? await prepareAttachments({ boardId, files: input.files ?? [], links: input.links ?? [] }, isReal, true, tcfg ? { cfg: tcfg, folder: [ROOT_FOLDER, boardFolderName(board), 'Công việc'], author: 'Tài liệu' } : undefined)
      : [];
    const clean: TaskInput = { ...input, files: undefined, links: undefined, attachments: [...(input.attachments ?? []), ...added], label: input.label.trim(), instructions: input.instructions.trim(), targetUnits: [...new Set(input.targetUnits.map((u) => u.trim()).filter(Boolean))] };
    const view = (id: string): TaskItem => ({ id, label: clean.label, lessonId: clean.lessonId ?? undefined, kind: clean.kind, instructions: clean.instructions, assignedAt: clean.assignedAt, dueAt: clean.dueAt, allowLate: clean.allowLate, targetUnits: clean.targetUnits, attachments: clean.attachments, needsEvidence: !!clean.needsEvidence, ackOnly: !!clean.ackOnly, progress: clean.progress ?? 'todo', priority: clean.priority ?? 'normal', assigneeEmails: (clean.assigneeEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean), repeat: clean.repeat ?? 'none', seriesId: clean.seriesId, category: clean.category, startAt: clean.startAt ?? null, reportDueAt: clean.reportDueAt ?? null, completedAt: clean.completedAt ?? null, repeatUntil: clean.repeatUntil ?? null });
    if (taskId) {
      if (isReal) await api.updateTask(taskId, clean);
      patch(boardId, (b) => ({ ...b, tasks: b.tasks.map((t) => (t.id === taskId ? view(taskId) : t)) }));
      await note(boardId, 'sua_bai_tap', clean.label, true);
      return view(taskId);
    }
    const made: TaskItem = isReal ? await api.createTask(boardId, clean, board.tasks.length) : view(`nv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    patch(boardId, (b) => ({ ...b, tasks: [...b.tasks, made] }));
    await note(boardId, 'giao_bai_tap', clean.label, true);
    return made;
  }, [isReal, boards, patch, note]);

  const rolling = useRef(new Set<string>());
  const rollRecurring = useCallback(async (boardId: string): Promise<number> => {
    const board = boardsRef.current.find((b) => b.id === boardId);
    if (!board || (board.access ?? 'owner') !== 'owner' || rolling.current.has(boardId)) return 0;
    rolling.current.add(boardId);
    let made = 0;
    try {
      for (const t of board.tasks.filter((x) => x.repeat && x.repeat !== 'none' && x.dueAt)) {
        let cur = t;
        for (let guard = 0; guard < 12 && cur.dueAt && Date.parse(cur.dueAt) <= Date.now(); guard += 1) {
          const next = nextInstance(cur);
          if (!next) break;
          const created = await saveTask(boardId, null, next);
          // Kỳ cũ thôi mang quy tắc lặp: chỉ kỳ mới nhất của chuỗi còn lặp.
          await saveTask(boardId, cur.id, { ...taskToInput(cur), repeat: 'none', seriesId: next.seriesId });
          cur = created;
          made += 1;
        }
      }
    } finally { rolling.current.delete(boardId); }
    return made;
  }, [saveTask]);

  const loadAttendance = useCallback(async (boardId: string): Promise<void> => {
    if (!isReal) return; // bản mẫu giữ điểm danh ngay trong bộ nhớ của bảng
    const attendance = await api.getAttendance(boardId);
    patch(boardId, (b) => ({ ...b, attendance }));
  }, [isReal, patch]);
  const editAttendance = useCallback((boardId: string, fn: (list: AttendanceSession[]) => AttendanceSession[]): void => {
    patch(boardId, (b) => ({ ...b, attendance: fn(b.attendance ?? []) }));
  }, [patch]);
  const addAttendanceSession = useCallback(async (boardId: string, day: string, label: string): Promise<void> => {
    if (isReal) await api.upsertAttendanceSession(boardId, day, label);
    editAttendance(boardId, (l) => (l.some((s) => s.day === day) ? l.map((s) => (s.day === day ? { ...s, label } : s)) : [...l, { day, label, present: [] }].sort((a, b) => a.day.localeCompare(b.day))));
  }, [isReal, editAttendance]);
  const removeAttendanceSession = useCallback(async (boardId: string, day: string): Promise<void> => {
    if (isReal) await api.deleteAttendanceSession(boardId, day);
    editAttendance(boardId, (l) => l.filter((s) => s.day !== day));
  }, [isReal, editAttendance]);
  const setAttendancePresent = useCallback(async (boardId: string, day: string, nameKey: string, present: boolean): Promise<void> => {
    if (isReal) await api.setAttendancePresent(boardId, day, nameKey, present);
    editAttendance(boardId, (l) => l.map((s) => (s.day === day ? { ...s, present: present ? [...new Set([...s.present, nameKey])] : s.present.filter((k) => k !== nameKey) } : s)));
  }, [isReal, editAttendance]);

  const regenerateLink = useCallback(async (boardId: string): Promise<void> => {
    const token = isReal ? await api.regenerateShareToken(boardId) : randomToken();
    patch(boardId, (b) => ({ ...b, shareToken: token }));
    await note(boardId, 'cai_dat', 'Đổi link chia sẻ', true);
  }, [isReal, patch, note]);

  const changeJoinCode = useCallback(async (boardId: string): Promise<void> => {
    const code = (isReal ? await api.updateJoin(boardId, { newCode: randomJoinCode() }) : randomJoinCode()) ?? null;
    patch(boardId, (b) => ({ ...b, joinCode: code }));
    await note(boardId, 'cai_dat', 'Đổi mã vào lớp', true);
  }, [isReal, patch, note]);

  const setJoinEnabled = useCallback(async (boardId: string, enabled: boolean): Promise<void> => {
    if (isReal) await api.updateJoin(boardId, { enabled });
    patch(boardId, (b) => ({ ...b, joinEnabled: enabled }));
    await note(boardId, 'cai_dat', enabled ? 'Bật vào lớp bằng mã' : 'Tắt vào lớp bằng mã', true);
  }, [isReal, patch, note]);

  const resolveJoinCode = useCallback(async (raw: string): Promise<string | null> => {
    const code = cleanJoinCode(raw);
    if (code.length !== 6) return null;
    if (isReal) return api.resolveJoinCode(code);
    return boardsRef.current.find((b) => b.joinCode === code && b.joinEnabled !== false && !b.deletedAt)?.shareToken ?? null;
  }, [isReal]);

  // ---- Đầu việc thành phần và nhật ký tiến độ (Đợt A). Bản mẫu giữ trong bộ nhớ; dữ liệu thật nằm ở task_items và task_logs. ----
  const mockItems = useRef<Map<string, TaskSubItem[]>>(new Map());
  const mockLogs = useRef<TaskLog[]>([]);
  const newId = (p: string): string => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const writeLog = useCallback(async (boardId: string, taskId: string, itemId: string | null, action: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null, noteText: string): Promise<void> => {
    const entry = { taskId, boardId, itemId, actor, action, before, after, note: noteText };
    if (isReal) { await itemsApi.addLog(entry); return; }
    mockLogs.current = [{ id: newId('lg'), createdAt: new Date().toISOString(), ...entry }, ...mockLogs.current];
  }, [isReal, actor]);

  const putMockItem = (it: TaskSubItem): void => {
    const list = mockItems.current.get(it.taskId) ?? [];
    mockItems.current.set(it.taskId, list.some((x) => x.id === it.id) ? list.map((x) => (x.id === it.id ? it : x)) : [...list, it]);
  };

  const loadTaskItems = useCallback(async (_boardId: string, taskId: string): Promise<{ items: TaskSubItem[]; logs: TaskLog[] }> => {
    if (isReal) {
      const [items, logs] = await Promise.all([itemsApi.listItems([taskId]), itemsApi.listLogs(taskId)]);
      return { items, logs };
    }
    return { items: [...(mockItems.current.get(taskId) ?? [])].sort((a, b) => a.sort - b.sort), logs: mockLogs.current.filter((l) => l.taskId === taskId) };
  }, [isReal]);

  const loadItemSummaries = useCallback(async (taskIds: string[]): Promise<TaskSubItem[]> => {
    if (isReal) return itemsApi.listItems(taskIds);
    return taskIds.flatMap((id) => mockItems.current.get(id) ?? []);
  }, [isReal]);

  const saveTaskItem = useCallback(async (boardId: string, taskId: string, prev: TaskSubItem | null, input: ItemInput, reason = ''): Promise<TaskSubItem> => {
    if (!input.title.trim() && !input.subject.trim()) throw new Error('Hãy nhập tên đầu việc hoặc đối tượng thực hiện.');
    const board = boardsRef.current.find((b) => b.id === boardId);
    if (!board) throw new Error('Không tìm thấy bảng.');
    const gw = gatewayOf(board.settings);
    const added = input.files.length + input.links.length > 0
      ? (await prepareAttachments({ boardId, files: input.files, links: input.links }, isReal, true, gw ? { cfg: gw, folder: [ROOT_FOLDER, boardFolderName(board), 'Minh chứng'], author: 'Minh chứng' } : undefined))
        .map((a) => (input.group ? { ...a, group: input.group } : a))
      : [];
    const now = new Date().toISOString();
    // Ngày thực tế tự điền khi đổi trạng thái; mở lại thì bỏ ngày hoàn thành (nhật ký vẫn giữ ngày cũ).
    let startedAt = input.startedAt;
    let doneAt = input.doneAt;
    if ((input.status === 'doing' || input.status === 'done') && !startedAt) startedAt = prev?.startedAt ?? (input.status === 'doing' ? now : null);
    if (input.status === 'done' && !doneAt) doneAt = now;
    if (input.status !== 'done') doneAt = null;
    const body = {
      taskId, boardId, title: input.title.trim() || input.subject.trim(), subject: input.subject.trim(), plannedAt: input.plannedAt, status: input.status,
      result: input.result.trim(), note: input.note.trim(), startedAt, doneAt, sort: prev?.sort ?? input.sort, attachments: [...input.keep, ...added], deletedAt: prev?.deletedAt ?? null,
    };
    let saved: TaskSubItem;
    if (prev) saved = isReal ? await itemsApi.updateItem(prev.id, body) : { ...prev, ...body };
    else saved = isReal ? (await itemsApi.insertItems([body]))[0] : { ...body, id: newId('it'), createdAt: now };
    if (!isReal) putMockItem(saved);
    const d = diffItem(prev, saved);
    if (d.changed.length > 0) await writeLog(boardId, taskId, saved.id, actionOf(prev, saved, d.changed), prev ? d.before : null, d.after, reason.trim());
    return saved;
  }, [isReal, writeLog]);

  const addTaskItems = useCallback(async (boardId: string, taskId: string, rows: { title: string; subject: string; plannedAt: string | null }[], startSort: number): Promise<void> => {
    const clean = rows.map((r) => ({ ...r, title: r.title.trim(), subject: r.subject.trim() })).filter((r) => r.title || r.subject);
    if (clean.length === 0) throw new Error('Hãy nhập ít nhất một đầu việc.');
    const bodies = clean.map((r, i) => ({ taskId, boardId, title: r.title || r.subject, subject: r.subject, plannedAt: r.plannedAt, status: 'todo' as ItemStatus, result: '', note: '', startedAt: null, doneAt: null, sort: startSort + i, attachments: [], deletedAt: null }));
    const made: TaskSubItem[] = isReal ? await itemsApi.insertItems(bodies) : bodies.map((b) => ({ ...b, id: newId('it'), createdAt: new Date().toISOString() }));
    if (!isReal) made.forEach(putMockItem);
    for (const it of made) await writeLog(boardId, taskId, it.id, 'tao_dau_viec', null, { title: it.title, subject: it.subject, plannedAt: it.plannedAt, status: it.status }, '');
  }, [isReal, writeLog]);

  const setTaskItemDeleted = useCallback(async (boardId: string, item: TaskSubItem, deleted: boolean, reason = ''): Promise<void> => {
    const { id, createdAt, ...rest } = item;
    const body = { ...rest, deletedAt: deleted ? new Date().toISOString() : null };
    const saved = isReal ? await itemsApi.updateItem(id, body) : { ...item, ...body };
    if (!isReal) putMockItem(saved);
    void createdAt;
    await writeLog(boardId, item.taskId, id, deleted ? 'xoa' : 'khoi_phuc', { title: item.title, subject: item.subject, status: item.status }, null, reason.trim());
  }, [isReal, writeLog]);

  const reorderTaskItems = useCallback(async (_boardId: string, taskId: string, ordered: TaskSubItem[]): Promise<void> => {
    const order = ordered.map((it, i) => ({ id: it.id, sort: i }));
    if (isReal) await itemsApi.setItemOrder(order);
    else mockItems.current.set(taskId, ordered.map((it, i) => ({ ...it, sort: i })));
  }, [isReal]);

  const addTaskNote = useCallback(async (boardId: string, taskId: string, itemId: string | null, noteText: string): Promise<void> => {
    if (!noteText.trim()) throw new Error('Hãy nhập nội dung ghi chú.');
    await writeLog(boardId, taskId, itemId, 'ghi_chu', null, null, noteText.trim());
  }, [writeLog]);

  const setTaskProgress = useCallback(async (boardId: string, taskId: string, progress: TaskProgress): Promise<void> => {
    const prev = boardsRef.current.find((b) => b.id === boardId)?.tasks.find((t) => t.id === taskId);
    const completedAt = progress === 'done' ? new Date().toISOString() : null;
    let kept = true;
    if (isReal) kept = await api.updateTaskProgress(taskId, progress, completedAt);
    patch(boardId, (b) => ({ ...b, tasks: b.tasks.map((t) => (t.id === taskId ? { ...t, progress, completedAt: kept ? completedAt : (t.completedAt ?? null) } : t)) }));
    if (prev && (prev.progress ?? 'todo') !== progress) {
      // Nhật ký của việc tổng: máy chủ chưa chạy SQL cập nhật thì bỏ qua, không làm hỏng việc đổi trạng thái.
      try { await writeLog(boardId, taskId, null, 'doi_trang_thai_tong', { progress: prev.progress ?? 'todo' }, { progress }, ''); } catch { /* chưa có bảng nhật ký */ }
    }
  }, [isReal, patch, writeLog]);

  const prepareFiles = useCallback(async (boardId: string, files: File[], links: string[], folder: string): Promise<Attachment[]> => {
    if (files.length + links.length === 0) return [];
    const board = boardsRef.current.find((b) => b.id === boardId);
    const gw = board ? gatewayOf(board.settings) : null;
    return prepareAttachments({ boardId, files, links }, isReal, true, gw && board ? { cfg: gw, folder: [ROOT_FOLDER, boardFolderName(board), folder], author: folder } : undefined);
  }, [isReal]);

  const ensurePersonalBoard = useCallback(async (): Promise<BoardData> => {
    const have = boards.find((b) => b.settings.personal && !b.deletedAt && (b.access ?? 'owner') === 'owner');
    if (have) return have;
    const tpl = BOARD_TEMPLATES.find((t) => t.id === 'to-cong-tac');
    if (!tpl) throw new Error('Thiếu mẫu bảng.');
    return createBoard('Việc riêng của tôi', { ...tpl, settings: { ...tpl.settings, personal: true, rosterOnly: false, privateView: true } });
  }, [boards, createBoard]);

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
    const rb = boards.find((b) => b.id === boardId);
    const rcfg = gatewayOf(rb?.settings);
    const drive = rb && rcfg ? { cfg: rcfg, folder: [ROOT_FOLDER, boardFolderName(rb), 'Tài liệu'], author: 'Giáo viên' } : undefined;
    const prepared = await prepareAttachments({ boardId, files: input.files, links: input.links }, isReal, true, drive);
    const attachments = withLabels(prepared, input.fileLabels, input.linkLabels, input.files.length);
    const kind: ResourceKind = input.kind === 'auto' ? inferKind(attachments) : input.kind;
    const first = attachments.find((a) => a.type === 'link' || a.type === 'embed');
    const look = { badge: input.badge?.trim() || undefined, color: input.color || undefined, steps: stepsOf(input.steps) };
    const payload = { title: input.title.trim(), description: input.description.trim(), url: first?.url ?? '', kind, lessonId: input.lessonId, attachments, ...look };
    const res: PinnedResource = isReal
      ? await api.addResource(boardId, payload)
      : { id: `r-${Date.now()}`, kind, title: payload.title, description: payload.description, url: payload.url || attachments[0]?.url || '#', lessonId: input.lessonId ?? undefined, attachments, sizeLabel: sizeLabelOf(attachments), ...look, steps: look.steps.length > 0 ? look.steps : undefined };
    patch(boardId, (b) => ({ ...b, pinned: [...b.pinned, { ...res, sizeLabel: res.sizeLabel ?? sizeLabelOf(attachments) }] }));
    await note(boardId, 'ghim_tai_lieu', input.title, true);
  }, [isReal, boards, patch, note]);

  const updateResource = useCallback(async (boardId: string, resourceId: string, input: MaterialInput): Promise<void> => {
    if (!input.title.trim()) throw new Error('Hãy nhập tên tài liệu.');
    const kept = input.keep ?? [];
    if (kept.length + input.files.length + input.links.length === 0) throw new Error('Tài liệu cần ít nhất một tệp hoặc một liên kết.');
    const ub = boards.find((b) => b.id === boardId);
    const ucfg = gatewayOf(ub?.settings);
    const udrive = ub && ucfg ? { cfg: ucfg, folder: [ROOT_FOLDER, boardFolderName(ub), 'Tài liệu'], author: 'Giáo viên' } : undefined;
    const added = withLabels(await prepareAttachments({ boardId, files: input.files, links: input.links }, isReal, true, udrive), input.fileLabels, input.linkLabels, input.files.length);
    const attachments = [...kept, ...added];
    const kind: ResourceKind = input.kind === 'auto' ? inferKind(attachments) : input.kind;
    const first = attachments.find((a) => a.type === 'link' || a.type === 'embed');
    const look = { badge: input.badge?.trim() || undefined, color: input.color || undefined, steps: stepsOf(input.steps) };
    // Sửa tài liệu không làm mất vị trí đã kéo thả.
    const keepOrder = ub?.pinned.find((r) => r.id === resourceId)?.order;
    const payload = { title: input.title.trim(), description: input.description.trim(), url: first?.url ?? '', kind, lessonId: input.lessonId, attachments, ...look, order: keepOrder };
    const res: PinnedResource = isReal
      ? await api.updateResource(resourceId, payload)
      : { id: resourceId, kind, title: payload.title, description: payload.description, url: payload.url || attachments[0]?.url || '#', lessonId: input.lessonId ?? undefined, attachments, ...look, steps: look.steps.length > 0 ? look.steps : undefined, order: keepOrder };
    patch(boardId, (b) => ({ ...b, pinned: b.pinned.map((r) => (r.id === resourceId ? { ...res, sizeLabel: sizeLabelOf(attachments) } : r)) }));
    await note(boardId, 'sua_tai_lieu', input.title, true);
  }, [isReal, boards, patch, note]);

  const reorderResources = useCallback(async (boardId: string, ids: string[]): Promise<void> => {
    const b = boards.find((x) => x.id === boardId);
    if (!b) return;
    const byId = new Map(b.pinned.map((r) => [r.id, r]));
    const list = ids.map((id) => byId.get(id)).filter((r): r is PinnedResource => !!r);
    if (list.length < 2) return;
    if (isReal) await api.setResourceOrder(list.map((r, i) => ({ id: r.id, badge: r.badge, color: r.color, steps: r.steps, order: i })));
    patch(boardId, (bd) => {
      // Các tài liệu của nhóm giữ nguyên "ô" của mình trong danh sách chung, chỉ đổi người đứng trong ô.
      const next = [...bd.pinned];
      const slots = bd.pinned.map((r, i) => (ids.includes(r.id) ? i : -1)).filter((i) => i >= 0);
      slots.forEach((slot, k) => { const r = byId.get(ids[k]); if (r) next[slot] = { ...r, order: k }; });
      return { ...bd, pinned: next };
    });
    await note(boardId, 'sua_tai_lieu', 'Sắp xếp lại tài liệu', true);
  }, [isReal, boards, patch, note]);

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
    boards: visibleBoards, loading, error, isReal, linkToken, watchBoard,
    rateCard, addComment, deleteOwnComment, setCommentStatus, deleteComment, setTeacherStars,
    inviteCollaborator, changeCollaboratorRole, removeCollaborator, leaveBoard,
    createBoard, duplicateBoard, updateMeta, addCard, setCardLayout, setStatus, setGrade, vote, deleteCard, moveCards, loadRosterNames, reassignCard, findCardByCode, findCardsByName, saveCardByCode, clearSubmissions, updateCardAttachments, removeStoredAttachments,
    setRoster, setSettings, saveLesson, removeLesson, saveTask, removeTask, regenerateLink, changeJoinCode, setJoinEnabled, resolveJoinCode, setTaskProgress, loadTaskItems, loadItemSummaries, saveTaskItem, addTaskItems, setTaskItemDeleted, reorderTaskItems, addTaskNote, ensurePersonalBoard, prepareFiles, rollRecurring, loadAttendance, addAttendanceSession, removeAttendanceSession, setAttendancePresent, addResource, removeResource, updateResource, reorderResources, assignToBoards, setProgram, setArchived, setTrashed, deleteForever, setTemplate, loadActivity,
  };
}
