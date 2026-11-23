// Lớp nối CSDL Supabase (bảng khai báo trong docs/schema.sql).
// Mọi hàm ném lỗi tiếng Việt khi Supabase từ chối (thường do RLS); App hiển thị lỗi đó cho người dùng.

import type {
  CardComment, ActivityEntry, Attachment, BoardAccess, BoardData, CollabRole, Collaborator, CardLayoutPatch, CardLocation, VennRegion, BoardMode, CardStatus, LinkMode, Lesson, PinnedResource, PollOption, ResourceKind, RosterMember, SubmissionCard, TaskItem, TaskKind,
} from '../types/board';
import { linkToAttachment } from './embeds';
import type { BoardSettings } from '../types/board';
import type { BoardTemplate } from '../data/boardTemplates';
import { parseSettings } from './boardSettings';
import { supabase } from './supabase';

/* ---------- Kiểu hàng trong CSDL (snake_case) ---------- */
interface BoardDb {
  id: string; title: string; mode: BoardMode; goals: string | null; share_token: string;
  link_mode: LinkMode; owner_email: string | null; settings: unknown;
  archived_at: string | null; deleted_at: string | null; is_template: boolean; created_at: string; program?: string | null;
}
interface CardDb {
  id: string; board_id?: string; kind: 'resource' | 'submission'; author_name: string | null; group_name: string | null;
  title: string | null; body: string | null; link_url: string | null; file_type: string | null;
  task_id: string | null; status: CardStatus; teacher_note: string | null; created_at: string;
  loc: CardLocation | null; pos: { x: number; y: number } | null; venn: VennRegion | null;
  teacher_stars: number | null; lesson_id?: string | null; late?: boolean | null;
  attachments: Attachment[] | null; poll: { id: string; label: string }[] | null; grade: number | string | null;
}
interface CollabDb { board_id: string; email: string; role: CollabRole; added_at: string }

/** Quyền của tôi: chủ bảng (theo Gmail), hoặc vai trò được chia sẻ; không thấy hàng nào thì coi là chỉ xem. */
function accessFor(b: BoardDb, me: string, collabs: CollabDb[]): BoardAccess {
  if ((b.owner_email ?? '').toLowerCase() === me) return 'owner';
  return collabs.find((c) => c.board_id === b.id && c.email.toLowerCase() === me)?.role ?? 'viewer';
}

interface VoteCount { card_id: string; option_id: string; n: number }
interface TaskDb {
  id: string; board_id?: string; label: string; sort?: number; lesson_id?: string | null; kind?: TaskKind | null; instructions?: string | null;
  assigned_at?: string | null; due_at?: string | null; allow_late?: boolean | null; target_units?: string[] | null;
}
interface LessonDb { id: string; board_id?: string; title: string; description: string | null; sort?: number; starts_at?: string | null; ends_at?: string | null }

function toTask(t: TaskDb): TaskItem {
  return {
    id: t.id, label: t.label, lessonId: t.lesson_id ?? undefined, kind: t.kind === 'requirement' ? 'requirement' : 'assignment',
    instructions: t.instructions ?? '', assignedAt: t.assigned_at ?? null, dueAt: t.due_at ?? null, allowLate: !!t.allow_late,
    targetUnits: t.target_units ?? [],
  };
}
function toLesson(l: LessonDb): Lesson {
  return { id: l.id, title: l.title, description: l.description ?? '', startsAt: l.starts_at ?? null, endsAt: l.ends_at ?? null };
}
interface RosterDb { id: string; board_id: string; name: string; unit: string; started_working: boolean }
interface RatingAgg { card_id: string; n: number; sum: number }
/** Nhận xét: hàng của bảng comments (author_name, created_at) hoặc phần tử của get_board_public (author, at). */
interface CommentDb { id: string; card_id: string; board_id?: string; author?: string; author_name?: string; body: string; at?: string; created_at?: string; status?: string }

function toComment(m: CommentDb): CardComment {
  return { id: m.id, cardId: m.card_id, author: m.author ?? m.author_name ?? 'Bạn', body: m.body, at: m.at ?? m.created_at ?? new Date().toISOString(), status: m.status === 'hidden' || m.status === 'pending' ? m.status : 'visible' };
}

interface PublicBoardJson {
  board: { id: string; title: string; mode: BoardMode; goals: string | null; link_mode: LinkMode; share_token: string; settings: unknown; archived_at?: string | null };
  program?: string | null;
  lessons?: LessonDb[];
  tasks: TaskDb[];
  cards: CardDb[];
  votes: VoteCount[];
  ratings?: RatingAgg[];
  comments?: CommentDb[];
}

function db() {
  if (!supabase) throw new Error('Chưa cấu hình Supabase (.env).');
  return supabase;
}

function fail(action: string, message: string): never {
  throw new Error(`${action}: ${message}`);
}

/* ---------- Chuyển đổi CSDL → kiểu ứng dụng ---------- */
const RESOURCE_KINDS: ResourceKind[] = ['pdf', 'slide', 'video', 'link', 'sample', 'file', 'audio', 'image'];

function toResource(c: CardDb): PinnedResource {
  const kind = RESOURCE_KINDS.find((k) => k === c.file_type) ?? 'link';
  const attachments = c.attachments && c.attachments.length > 0 ? c.attachments : undefined;
  return {
    id: c.id, kind, title: c.title ?? 'Tài liệu', description: c.body ?? '', url: c.link_url ?? attachments?.[0]?.url ?? '#',
    lessonId: c.lesson_id ?? undefined, attachments,
  };
}

function toSubmission(c: CardDb, boardId: string, votes: VoteCount[], ratings: RatingAgg[] = [], comments: CommentDb[] = []): SubmissionCard {
  const rate = ratings.find((r) => r.card_id === c.id);
  const poll: PollOption[] | undefined = c.poll && c.poll.length > 0
    ? c.poll.map((o) => ({ id: o.id, label: o.label, votes: Number(votes.find((v) => v.card_id === c.id && v.option_id === o.id)?.n ?? 0) }))
    : undefined;
  return {
    id: c.id,
    boardId,
    authorName: c.author_name ?? '',
    unit: c.group_name ?? '',
    title: c.title ?? 'Bài nộp',
    taskId: c.task_id ?? '',
    body: c.body ?? '',
    attachments: c.attachments ?? (c.link_url ? [linkToAttachment(c.link_url)] : []),
    poll,
    loc: c.loc ?? undefined,
    pos: c.pos ?? undefined,
    venn: c.venn ?? undefined,
    status: c.status,
    late: c.late ?? undefined,
    submittedAt: c.created_at,
    teacherNote: c.teacher_note ?? undefined,
    grade: c.grade === null || c.grade === undefined ? undefined : Number(c.grade),
    teacherStars: c.teacher_stars ?? undefined,
    ratingCount: rate ? Number(rate.n) : 0,
    ratingSum: rate ? Number(rate.sum) : 0,
    comments: comments.filter((m) => m.card_id === c.id).map(toComment),
  };
}

function assemble(
  b: Pick<BoardDb, 'id' | 'title' | 'mode' | 'goals' | 'share_token' | 'link_mode' | 'settings'> & {
    owner_email?: string | null; archived_at?: string | null; deleted_at?: string | null; is_template?: boolean; created_at?: string; program?: string | null;
  },
  cards: CardDb[], tasks: TaskItem[], lessons: Lesson[], roster: RosterMember[], access: BoardAccess, votes: VoteCount[] = [], collaborators: Collaborator[] = [],
  ratings: RatingAgg[] = [], comments: CommentDb[] = [],
): BoardData {
  return {
    id: b.id,
    mode: b.mode,
    title: b.title,
    subtitle: b.owner_email ? `Chủ bảng: ${b.owner_email}` : '',
    goals: b.goals ?? '',
    shareToken: b.share_token,
    linkMode: b.link_mode,
    pinned: cards.filter((c) => c.kind === 'resource').map(toResource),
    lessons,
    program: b.program ?? undefined,
    tasks,
    sessions: [], // chưa lưu "buổi" trong CSDL: bộ lọc theo buổi sẽ trống
    roster,
    cards: cards.filter((c) => c.kind === 'submission').map((c) => toSubmission(c, b.id, votes, ratings, comments)),
    settings: parseSettings(b.settings),
    createdAt: b.created_at,
    ownerEmail: b.owner_email ?? undefined,
    archivedAt: b.archived_at ?? null,
    deletedAt: b.deleted_at ?? null,
    isTemplate: b.is_template ?? false,
    managed: access === 'owner' || access === 'editor',
    access,
    collaborators,
  };
}

/* ---------- Đọc ---------- */

/** Bảng của tôi + bảng được chia sẻ: RLS tự lọc theo Gmail đăng nhập. */
export async function loadMyBoards(myEmail: string): Promise<BoardData[]> {
  const client = db();
  const { data: boards, error } = await client.from('boards').select('*').order('created_at', { ascending: false });
  if (error) fail('Không tải được bảng', error.message);
  const list = (boards ?? []) as BoardDb[];
  if (list.length === 0) return [];
  const ids = list.map((b) => b.id);
  const [cards, tasks, lessons, roster, votes, collabs, ratings, comments] = await Promise.all([
    client.from('cards').select('*').in('board_id', ids).order('created_at', { ascending: false }),
    client.from('board_tasks').select('*').in('board_id', ids).order('sort'),
    client.from('board_lessons').select('*').in('board_id', ids).order('sort'),
    client.from('board_roster').select('*').in('board_id', ids).order('name'),
    client.from('card_votes').select('card_id, option_id'),
    client.from('board_collaborators').select('*').in('board_id', ids),
    client.from('card_ratings').select('card_id, stars'),
    client.from('comments').select('*').in('board_id', ids).order('created_at').limit(3000),
  ]);
  if (cards.error) fail('Không tải được bài nộp', cards.error.message);
  if (tasks.error) fail('Không tải được nhiệm vụ', tasks.error.message);
  if (lessons.error) fail('Không tải được bài học', lessons.error.message);
  if (roster.error) fail('Không tải được danh sách', roster.error.message);
  if (votes.error) fail('Không tải được phiếu bình chọn', votes.error.message);
  if (collabs.error) fail('Không tải được danh sách chia sẻ', collabs.error.message);
  if (ratings.error) fail('Không tải được đánh giá sao', ratings.error.message);
  if (comments.error) fail('Không tải được nhận xét', comments.error.message);
  const ratingMap = new Map<string, { n: number; sum: number }>();
  for (const r of (ratings.data ?? []) as { card_id: string; stars: number }[]) {
    const cur = ratingMap.get(r.card_id) ?? { n: 0, sum: 0 };
    ratingMap.set(r.card_id, { n: cur.n + 1, sum: cur.sum + r.stars });
  }
  const ratingAgg: RatingAgg[] = [...ratingMap].map(([card_id, v]) => ({ card_id, n: v.n, sum: v.sum }));
  const commentRows = (comments.data ?? []) as CommentDb[];
  const collabRows = (collabs.data ?? []) as CollabDb[];
  const me = myEmail.trim().toLowerCase();
  const cardRows = (cards.data ?? []) as (CardDb & { board_id: string })[];
  const taskRows = (tasks.data ?? []) as (TaskDb & { board_id: string })[];
  const lessonRows = (lessons.data ?? []) as (LessonDb & { board_id: string })[];
  const rosterRows = (roster.data ?? []) as RosterDb[];
  // Đếm phiếu ở trình duyệt (PostgREST không nhóm theo cột); đủ cho lớp học, giới hạn mặc định 1000 phiếu mỗi lần tải.
  const counts = new Map<string, number>();
  for (const v of (votes.data ?? []) as { card_id: string; option_id: string }[]) {
    const k = `${v.card_id}|${v.option_id}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const voteRows: VoteCount[] = [...counts].map(([k, n]) => { const [card_id, option_id] = k.split('|'); return { card_id, option_id, n }; });
  return list.map((b) =>
    assemble(
      b,
      cardRows.filter((c) => c.board_id === b.id),
      taskRows.filter((t) => t.board_id === b.id).map(toTask),
      lessonRows.filter((l) => l.board_id === b.id).map(toLesson),
      rosterRows.filter((r) => r.board_id === b.id).map((r) => ({ id: r.id, name: r.name, unit: r.unit, startedWorking: r.started_working })),
      accessFor(b, me, collabRows),
      voteRows,
      collabRows.filter((c) => c.board_id === b.id).map((c) => ({ email: c.email, role: c.role, addedAt: c.added_at })),
      ratingAgg,
      commentRows.filter((m) => m.board_id === b.id),
    ),
  );
}

/** Khách mở link /b/<token>: chỉ thấy tài liệu và bài đã duyệt (hàm get_board_public). */
export async function loadPublicBoard(token: string): Promise<BoardData | null> {
  const { data, error } = await db().rpc('get_board_public', { p_token: token });
  if (error) fail('Không mở được bảng', error.message);
  if (!data) return null;
  const j = data as PublicBoardJson;
  return assemble({ ...j.board, program: j.program }, j.cards, j.tasks.map(toTask), (j.lessons ?? []).map(toLesson), [], 'guest', j.votes, [], j.ratings ?? [], j.comments ?? []);
}

/* ---------- Giáo viên ---------- */

export async function createBoard(title: string, template: BoardTemplate, ownerId: string, extras: { lessonTitle?: string; program?: string } = {}): Promise<BoardData> {
  const client = db();
  const { data, error } = await client
    .from('boards')
    .insert({ owner_id: ownerId, title, mode: template.mode, goals: template.goals, settings: template.settings, program: extras.program ?? null })
    .select('*')
    .single();
  if (error) fail('Không tạo được bảng', error.message);
  const board = data as BoardDb;
  // Tạo theo bước "một bài học": có sẵn bài học và các nhiệm vụ mẫu nằm trong bài đó.
  const lessons: Lesson[] = extras.lessonTitle ? [await createLesson(board.id, { title: extras.lessonTitle, description: '', startsAt: null, endsAt: null }, 0)] : [];
  // Bảng mới KHÔNG có sẵn bài tập: giáo viên tự giao để dễ kiểm soát.
  const defaults: string[] = [];
  const { data: tasks, error: te } = defaults.length === 0 ? { data: [] as TaskDb[], error: null } : await client
    .from('board_tasks')
    .insert(defaults.map((label, i) => ({ board_id: board.id, label, sort: i, lesson_id: lessons[0]?.id ?? null })))
    .select('*');
  if (te) fail('Không tạo được nhiệm vụ', te.message);
  const taskItems = ((tasks ?? []) as TaskDb[]).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)).map(toTask);
  return assemble(board, [], taskItems, lessons, [], 'owner');
}

export interface BoardMetaPatch { title: string; goals: string; settings: BoardSettings; /** Chương trình tập huấn (chỉ lớp tập huấn); undefined = không đổi. */ program?: string }

/** Lưu tiêu đề, lời dẫn và toàn bộ cài đặt giao diện của bảng (chỉ chủ bảng / đồng quản lý qua RLS). */
export async function updateBoardMeta(boardId: string, meta: BoardMetaPatch): Promise<void> {
  const { error } = await db().from('boards').update({ title: meta.title, goals: meta.goals, settings: meta.settings }).eq('id', boardId);
  if (error) fail('Không lưu được cài đặt bảng', error.message);
}

export async function updateBoardSettings(boardId: string, patch: { linkMode?: LinkMode }): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.linkMode) row.link_mode = patch.linkMode;
  const { error } = await db().from('boards').update(row).eq('id', boardId);
  if (error) fail('Không lưu được cài đặt', error.message);
}

export async function setCardStatus(cardId: string, status: CardStatus): Promise<void> {
  const { error } = await db().from('cards').update({ status }).eq('id', cardId);
  if (error) fail('Không đổi được trạng thái', error.message);
}

export async function deleteCardAsManager(cardId: string): Promise<void> {
  const { error } = await db().from('cards').delete().eq('id', cardId);
  if (error) fail('Không xóa được bài', error.message);
}

export async function replaceRoster(boardId: string, roster: RosterMember[]): Promise<RosterMember[]> {
  const client = db();
  const del = await client.from('board_roster').delete().eq('board_id', boardId);
  if (del.error) fail('Không cập nhật được danh sách', del.error.message);
  if (roster.length === 0) return [];
  const ins = await client
    .from('board_roster')
    .insert(roster.map((m) => ({ board_id: boardId, name: m.name, unit: m.unit, started_working: false })))
    .select('*');
  if (ins.error) fail('Không lưu được danh sách', ins.error.message);
  return ((ins.data ?? []) as RosterDb[]).map((r) => ({ id: r.id, name: r.name, unit: r.unit, startedWorking: r.started_working }));
}

export interface ResourceInput {
  title: string; description: string; url: string; kind: ResourceKind;
  /** Bài học chứa tài liệu; trống = tài liệu chung của lớp. */
  lessonId?: string | null;
  /** Tệp đã tải lên kho hoặc liên kết đính kèm. */
  attachments?: Attachment[];
}

export async function addResource(boardId: string, input: ResourceInput): Promise<PinnedResource> {
  const { data, error } = await db()
    .from('cards')
    .insert({
      board_id: boardId, kind: 'resource', title: input.title, body: input.description, link_url: input.url || null, file_type: input.kind,
      status: 'approved', lesson_id: input.lessonId || null, attachments: input.attachments ?? [],
    })
    .select('*')
    .single();
  if (error) fail('Không ghim được tài liệu', error.message);
  return toResource(data as CardDb);
}

/* ---------- Khách không đăng nhập ---------- */

const SESSION_KEY = 'bt.sessionId';
const EDIT_TOKENS_KEY = 'bt.editTokens';

/** Mã phiên ngẫu nhiên của trình duyệt, dùng cho giới hạn chống spam. */
export function getSessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(SESSION_KEY, id); }
    return id;
  } catch {
    return 'khong-luu-duoc';
  }
}

function readTokens(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(EDIT_TOKENS_KEY) ?? '{}') as Record<string, string>; } catch { return {}; }
}
function saveToken(cardId: string, token: string): void {
  try { localStorage.setItem(EDIT_TOKENS_KEY, JSON.stringify({ ...readTokens(), [cardId]: token })); } catch { /* bỏ qua */ }
}

export interface GuestCardInput {
  boardId: string; taskId: string; authorName: string; unit: string; title: string; body: string;
  attachments: Attachment[];
  location: CardLocation | null;
  /** Nhãn các lựa chọn thăm dò (2–6), hoặc null nếu bài không có thăm dò. */
  poll: string[] | null;
}

/**
 * Đăng bài (khách hoặc giáo viên): INSERT trực tiếp, qua chính sách `cards_guest_insert`.
 * Id và edit_token sinh ở trình duyệt vì khách không có quyền đọc lại bài đang chờ duyệt.
 */
export async function insertSubmission(input: GuestCardInput, status: CardStatus): Promise<SubmissionCard> {
  const id = crypto.randomUUID();
  const editToken = crypto.randomUUID().replace(/-/g, '');
  const pollOptions = input.poll ? input.poll.map((label, i) => ({ id: `o${i + 1}`, label })) : null;
  const row = {
    id, board_id: input.boardId, kind: 'submission', author_name: input.authorName, group_name: input.unit,
    title: input.title, body: input.body, attachments: input.attachments, poll: pollOptions, loc: input.location, task_id: input.taskId || null,
    status, session_id: getSessionId(), edit_token: editToken,
  };
  const { error } = await db().from('cards').insert(row);
  if (error) fail('Không nộp được bài', error.message);
  saveToken(id, editToken);
  // Trạng thái thật do máy chủ quyết định (chế độ kiểm duyệt của bảng): hỏi lại bằng mã sửa bài.
  let finalStatus = status;
  try {
    const { data } = await db().rpc('my_card_status', { p_id: id, p_edit_token: editToken });
    if (data === 'pending' || data === 'approved' || data === 'featured' || data === 'needs_edit') finalStatus = data;
  } catch { /* hỏi lại không được thì dùng giá trị dự đoán */ }
  return {
    id, boardId: input.boardId, authorName: input.authorName, unit: input.unit, title: input.title, taskId: input.taskId,
    body: input.body, attachments: input.attachments,
    poll: pollOptions?.map((o) => ({ ...o, votes: 0 })),
    loc: input.location ?? undefined,
    status: finalStatus, submittedAt: new Date().toISOString(),
  };
}

/** Khách xóa bài của mình trong 15 phút đầu (hàm edit_card kiểm tra edit_token và thời gian). */
export async function deleteOwnCard(cardId: string): Promise<void> {
  const token = readTokens()[cardId];
  if (!token) throw new Error('Không tìm thấy mã sửa bài trên trình duyệt này.');
  const { error } = await db().rpc('edit_card', { p_id: cardId, p_edit_token: token, p_title: null, p_body: null, p_delete: true });
  if (error) fail('Không xóa được bài', error.message);
}

/* ---------- Bình chọn ---------- */
const VOTES_KEY = 'bt.myVotes';

/** Phiếu của chính trình duyệt này: { mã bài → mã lựa chọn }. */
export function getMyVotes(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(VOTES_KEY) ?? '{}') as Record<string, string>; } catch { return {}; }
}
export function rememberVote(cardId: string, optionId: string): void {
  try { localStorage.setItem(VOTES_KEY, JSON.stringify({ ...getMyVotes(), [cardId]: optionId })); } catch { /* bỏ qua */ }
}

export async function voteCard(cardId: string, optionId: string): Promise<void> {
  const { error } = await db().rpc('vote_card', { p_card: cardId, p_session: getSessionId(), p_option: optionId });
  if (error) fail('Không bình chọn được', error.message);
}

/* ---------- Vòng đời bảng: nhân bản, đóng, thùng rác, mẫu ---------- */

/* ---------- Bài học, bài tập / yêu cầu, tài liệu ---------- */

export interface LessonInput { title: string; description: string; startsAt: string | null; endsAt: string | null }
export interface TaskInput {
  label: string; lessonId: string | null; kind: TaskKind; instructions: string;
  assignedAt: string | null; dueAt: string | null; allowLate: boolean; targetUnits: string[];
}

const lessonRow = (i: LessonInput) => ({ title: i.title, description: i.description, starts_at: i.startsAt, ends_at: i.endsAt });
const taskRow = (i: TaskInput) => ({
  label: i.label, lesson_id: i.lessonId, kind: i.kind, instructions: i.instructions,
  assigned_at: i.assignedAt, due_at: i.dueAt, allow_late: i.allowLate, target_units: i.targetUnits,
});

export async function createLesson(boardId: string, input: LessonInput, sort: number): Promise<Lesson> {
  const { data, error } = await db().from('board_lessons').insert({ board_id: boardId, sort, ...lessonRow(input) }).select('*').single();
  if (error) fail('Không tạo được bài học', error.message);
  return toLesson(data as LessonDb);
}
export async function updateLesson(id: string, input: LessonInput): Promise<void> {
  const { error } = await db().from('board_lessons').update(lessonRow(input)).eq('id', id);
  if (error) fail('Không lưu được bài học', error.message);
}
export async function deleteLesson(id: string): Promise<void> {
  const { error } = await db().from('board_lessons').delete().eq('id', id);
  if (error) fail('Không xóa được bài học', error.message);
}
export async function createTask(boardId: string, input: TaskInput, sort: number): Promise<TaskItem> {
  const { data, error } = await db().from('board_tasks').insert({ board_id: boardId, sort, ...taskRow(input) }).select('*').single();
  if (error) fail('Không tạo được bài tập', error.message);
  return toTask(data as TaskDb);
}
export async function updateTask(id: string, input: TaskInput): Promise<void> {
  const { error } = await db().from('board_tasks').update(taskRow(input)).eq('id', id);
  if (error) fail('Không lưu được bài tập', error.message);
}
export async function deleteTask(id: string): Promise<void> {
  const { error } = await db().from('board_tasks').delete().eq('id', id);
  if (error) fail('Không xóa được bài tập', error.message);
}
export async function deleteResource(id: string): Promise<void> {
  const { error } = await db().from('cards').delete().eq('id', id).eq('kind', 'resource');
  if (error) fail('Không xóa được tài liệu', error.message);
}
export async function setBoardProgram(boardId: string, program: string): Promise<void> {
  const { error } = await db().from('boards').update({ program: program.trim() || null }).eq('id', boardId);
  if (error) fail('Không lưu được chương trình', error.message);
}

export interface AssignmentCopy { lesson?: Lesson; task: TaskItem; resources: PinnedResource[] }

/**
 * Giao một bài tập cho lớp khác: chép bài học (nếu có), bài tập và tài liệu của bài học sang lớp đích.
 * Chỉ thành công với lớp mà người dùng là chủ hoặc đồng quản lý (RLS); mỗi lớp là một bản sao độc lập có bài nộp riêng.
 */
export async function copyAssignmentTo(targetBoardId: string, src: AssignmentCopy, lessonsInTarget: number, tasksInTarget: number): Promise<AssignmentCopy> {
  let lesson: Lesson | undefined;
  if (src.lesson) {
    lesson = await createLesson(targetBoardId, { title: src.lesson.title, description: src.lesson.description, startsAt: src.lesson.startsAt ?? null, endsAt: src.lesson.endsAt ?? null }, lessonsInTarget);
  }
  const task = await createTask(targetBoardId, {
    label: src.task.label, lessonId: lesson?.id ?? null, kind: src.task.kind ?? 'assignment', instructions: src.task.instructions ?? '',
    assignedAt: src.task.assignedAt ?? null, dueAt: src.task.dueAt ?? null, allowLate: !!src.task.allowLate, targetUnits: src.task.targetUnits ?? [],
  }, tasksInTarget);
  const resources: PinnedResource[] = [];
  if (lesson) {
    for (const r of src.resources) {
      resources.push(await addResource(targetBoardId, { title: r.title, description: r.description, url: r.url === '#' ? '' : r.url, kind: r.kind, lessonId: lesson.id, attachments: r.attachments }));
    }
  }
  return { lesson, task, resources };
}

export interface DuplicateOpts { title: string; keepRoster: boolean; keepPinned: boolean }

/** Nhân bản cấu trúc bảng (nhiệm vụ, lời dẫn, cài đặt, tùy chọn: tài liệu ghim và sĩ số). Không chép bài nộp. */
export async function duplicateBoard(source: BoardData, opts: DuplicateOpts, ownerId: string): Promise<BoardData> {
  const client = db();
  const { data, error } = await client.from('boards')
    .insert({ owner_id: ownerId, title: opts.title, mode: source.mode, goals: source.goals, settings: source.settings })
    .select('*').single();
  if (error) fail('Không nhân bản được bảng', error.message);
  const board = data as BoardDb;
  // Bài học chép trước để bài tập và tài liệu trỏ đúng mã mới.
  const lessonMap = new Map<string, string>();
  const newLessons: Lesson[] = [];
  for (const [i, l] of source.lessons.entries()) {
    const made = await createLesson(board.id, { title: l.title, description: l.description, startsAt: l.startsAt ?? null, endsAt: l.endsAt ?? null }, i);
    lessonMap.set(l.id, made.id);
    newLessons.push(made);
  }
  const tasks = await client.from('board_tasks').insert(source.tasks.map((t, i) => ({
    board_id: board.id, sort: i, ...taskRow({
      label: t.label, lessonId: t.lessonId ? lessonMap.get(t.lessonId) ?? null : null, kind: t.kind ?? 'assignment', instructions: t.instructions ?? '',
      assignedAt: t.assignedAt ?? null, dueAt: t.dueAt ?? null, allowLate: !!t.allowLate, targetUnits: t.targetUnits ?? [],
    }),
  }))).select('*');
  if (tasks.error) fail('Không chép được nhiệm vụ', tasks.error.message);
  if (source.program) await setBoardProgram(board.id, source.program);
  let resources: CardDb[] = [];
  if (opts.keepPinned && source.pinned.length > 0) {
    const r = await client.from('cards').insert(source.pinned.map((p) => ({
      board_id: board.id, kind: 'resource', title: p.title, body: p.description, link_url: p.url === '#' ? null : p.url, file_type: p.kind, status: 'approved',
      lesson_id: p.lessonId ? lessonMap.get(p.lessonId) ?? null : null, attachments: p.attachments ?? [],
    }))).select('*');
    if (r.error) fail('Không chép được tài liệu ghim', r.error.message);
    resources = (r.data ?? []) as CardDb[];
  }
  let roster: RosterMember[] = [];
  if (opts.keepRoster && source.roster.length > 0) roster = await replaceRoster(board.id, source.roster);
  const taskItems = ((tasks.data ?? []) as TaskDb[]).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)).map(toTask);
  return assemble({ ...board, program: source.program ?? null }, resources, taskItems, newLessons, roster, 'owner');
}

export async function setBoardFlags(boardId: string, flags: { archivedAt?: string | null; deletedAt?: string | null; isTemplate?: boolean }): Promise<void> {
  const row: Record<string, unknown> = {};
  if (flags.archivedAt !== undefined) row.archived_at = flags.archivedAt;
  if (flags.deletedAt !== undefined) row.deleted_at = flags.deletedAt;
  if (flags.isTemplate !== undefined) row.is_template = flags.isTemplate;
  const { error } = await db().from('boards').update(row).eq('id', boardId);
  if (error) fail('Không cập nhật được bảng', error.message);
}

export async function deleteBoardForever(boardId: string): Promise<void> {
  const { error } = await db().from('boards').delete().eq('id', boardId);
  if (error) fail('Không xóa được bảng', error.message);
}

export async function clearSubmissions(boardId: string): Promise<void> {
  const { error } = await db().from('cards').delete().eq('board_id', boardId).eq('kind', 'submission');
  if (error) fail('Không xóa được bài nộp', error.message);
}

export async function purgeTrash(): Promise<void> {
  const { error } = await db().rpc('purge_trashed_boards');
  if (error) fail('Không dọn được thùng rác', error.message);
}

/* ---------- Sổ điểm và nhật ký ---------- */

export async function setGrade(cardId: string, grade: number | null, note: string): Promise<void> {
  const { error } = await db().from('cards').update({ grade, teacher_note: note || null }).eq('id', cardId);
  if (error) fail('Không lưu được điểm', error.message);
}

interface ActivityDb { id: string; actor: string; action: string; detail: string; created_at: string }

export async function loadActivity(boardId: string): Promise<ActivityEntry[]> {
  const { data, error } = await db().from('board_activity').select('*').eq('board_id', boardId).order('created_at', { ascending: false }).limit(150);
  if (error) fail('Không tải được nhật ký', error.message);
  return ((data ?? []) as ActivityDb[]).map((a) => ({ id: a.id, at: a.created_at, actor: a.actor, action: a.action, detail: a.detail }));
}

export async function logActivity(boardId: string, actor: string, action: string, detail: string): Promise<void> {
  const { error } = await db().from('board_activity').insert({ board_id: boardId, actor, action, detail });
  if (error) fail('Không ghi được nhật ký', error.message);
}

/** Lưu bố cục của thẻ (vị trí bản đồ, toạ độ Bảng trắng, vùng Venn): chỉ chủ bảng / đồng quản lý qua RLS `cards_manage`. */
export async function updateCardLayout(cardId: string, patch: CardLayoutPatch): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.pos !== undefined) row.pos = patch.pos;
  if (patch.venn !== undefined) row.venn = patch.venn;
  if (patch.loc !== undefined) row.loc = patch.loc;
  const { error } = await db().from('cards').update(row).eq('id', cardId);
  if (error) fail('Không lưu được bố cục', error.message);
}

/* ---------- Chia sẻ với giáo viên khác ---------- */

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const isValidEmail = (raw: string): boolean => EMAIL_RE.test(normalizeEmail(raw));

/** Chỉ chủ bảng mời được (RLS `collab_owner`); trigger giới hạn 20 người và chặn mời chính chủ. */
export async function addCollaborator(boardId: string, email: string, role: CollabRole, invitedBy: string): Promise<Collaborator> {
  const clean = normalizeEmail(email);
  const { data, error } = await db().from('board_collaborators').insert({ board_id: boardId, email: clean, role, added_by: invitedBy }).select('*').single();
  if (error) fail(error.code === '23505' ? 'Người này đã được chia sẻ' : 'Không mời được', error.code === '23505' ? 'có thể đổi quyền ở danh sách.' : error.message);
  const row = data as CollabDb;
  return { email: row.email, role: row.role, addedAt: row.added_at };
}

export async function updateCollaboratorRole(boardId: string, email: string, role: CollabRole): Promise<void> {
  const { error } = await db().from('board_collaborators').update({ role }).eq('board_id', boardId).eq('email', normalizeEmail(email));
  if (error) fail('Không đổi được quyền', error.message);
}

export async function removeCollaborator(boardId: string, email: string): Promise<void> {
  const { error } = await db().from('board_collaborators').delete().eq('board_id', boardId).eq('email', normalizeEmail(email));
  if (error) fail('Không gỡ được quyền', error.message);
}

/* ---------- Đánh giá giữa các bạn: sao và nhận xét ---------- */

/** Câu lỗi của máy chủ (đã tiếng Việt, thân thiện) được giữ nguyên để hiện thẳng cho học sinh. */
function friendly(message: string, fallback: string): Error {
  return new Error(message && !/^(new row|duplicate|permission|invalid|JWT|PGRST)/i.test(message) ? message : fallback);
}

export async function rateCard(cardId: string, stars: number): Promise<void> {
  const { error } = await db().rpc('rate_card', { p_card: cardId, p_session: getSessionId(), p_stars: stars });
  if (error) throw friendly(error.message, 'Không chấm sao được, hãy thử lại.');
}

export async function postComment(cardId: string, author: string, body: string): Promise<CardComment> {
  const { data, error } = await db().rpc('post_comment', { p_card: cardId, p_session: getSessionId(), p_author: author, p_body: body });
  if (error) throw friendly(error.message, 'Không gửi được nhận xét, hãy thử lại.');
  return toComment(data as CommentDb);
}

export async function deleteOwnComment(commentId: string): Promise<void> {
  const { error } = await db().rpc('delete_comment', { p_id: commentId, p_session: getSessionId() });
  if (error) throw friendly(error.message, 'Không xóa được nhận xét.');
}

/** Giáo viên: ẩn / hiện lại hoặc xóa nhận xét (RLS comments_manage). */
export async function setCommentStatus(commentId: string, status: 'visible' | 'pending' | 'hidden'): Promise<void> {
  const { error } = await db().from('comments').update({ status }).eq('id', commentId);
  if (error) fail('Không đổi được trạng thái nhận xét', error.message);
}

export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await db().from('comments').delete().eq('id', commentId);
  if (error) fail('Không xóa được nhận xét', error.message);
}

export async function setTeacherStars(cardId: string, stars: number | null): Promise<void> {
  const { error } = await db().from('cards').update({ teacher_stars: stars }).eq('id', cardId);
  if (error) fail('Không lưu được số sao', error.message);
}
