// Kiểu dữ liệu dùng chung cho toàn ứng dụng.
// Khi nối Supabase: các kiểu này khớp với bảng boards / cards trong docs/schema.sql
// (camelCase ở đây ↔ snake_case ở CSDL; chuyển đổi tập trung trong src/lib/boardApi.ts).

export type BoardMode = 'classroom' | 'training';
/** view = chỉ xem · guest_post = khách bấm + nộp bài · locked = khóa nộp bài */
export type LinkMode = 'view' | 'guest_post' | 'locked';
/** Kiểm duyệt bài và nhận xét của học sinh: off = hiện ngay; manual = giáo viên duyệt; auto = hệ thống tự duyệt. */
export type ModerationMode = 'off' | 'manual' | 'auto';
export type ViewMode =
  | 'wall' | 'grid' | 'table' | 'columns' | 'summary'
  | 'timeline' | 'map' | 'canvas' | 'mindmap' | 'venn' | 'slides';
/** Vùng của biểu đồ Venn hai vòng: chỉ A, giao nhau, chỉ B. */
export type VennRegion = 'a' | 'ab' | 'b';
export type SortBy = 'newest' | 'oldest' | 'name' | 'unit';
/** Mã phông chữ / nền / biểu tượng: danh sách đầy đủ nằm ở lib/boardSettings.ts (giá trị lạ được đưa về mặc định khi đọc). */
export type BoardFont = string;
export type BoardBackground = string;
export type BoardIconId = string;
export type CardStatus = 'pending' | 'approved' | 'featured' | 'needs_edit';
/** Tiến trình của một thành viên: trạng thái bài nộp, hoặc chưa nộp / đang làm khi chưa có bài. */
export type MemberProgress = 'not_submitted' | 'in_progress' | CardStatus;
/** Giá trị bộ lọc tiến trình (gồm vài nhóm gộp dùng cho thẻ KPI). */
export type ProgressFilter =
  | 'all'
  | 'submitted' // đã có bài (mọi trạng thái bài)
  | 'waiting' // chờ duyệt + đang làm
  | 'done' // đã duyệt + tiêu biểu
  | MemberProgress;
export type TimeFilter = 'all' | 'today' | '24h' | '7d' | 'session';
/** Vai trò đang xem: owner = giáo viên quản lý; viewer = giáo viên chỉ xem; guest = học sinh; viewonly = khách. */
export type ViewerRole = 'owner' | 'viewer' | 'guest' | 'viewonly';
/** Quyền của người đăng nhập đối với một bảng. */
export type BoardAccess = 'owner' | 'editor' | 'viewer' | 'guest';
export type CollabRole = 'editor' | 'viewer';

/** Giáo viên được chủ bảng chia sẻ bảng, nhận diện theo Gmail. */
export interface Collaborator {
  email: string;
  role: CollabRole;
  addedAt?: string;
}

export interface GmailAccount {
  id: string;
  email: string;
  name: string;
  /** Màu nền ảnh đại diện mẫu (Supabase thật sẽ dùng avatar_url của Google). */
  hue: number;
}

export type ResourceKind = 'pdf' | 'slide' | 'video' | 'link' | 'sample' | 'file' | 'audio' | 'image';

/** Tài liệu giáo viên cung cấp: của cả lớp (lessonId trống) hoặc của một bài học / buổi tập huấn. */
export interface PinnedResource {
  id: string;
  kind: ResourceKind;
  title: string;
  description: string;
  url: string;
  sizeLabel?: string;
  /** Bài học / buổi tập huấn chứa tài liệu; trống = tài liệu chung của lớp. */
  lessonId?: string;
  /** Tệp tải lên hoặc nhiều liên kết đính kèm (xem trực tiếp bằng FileViewers). */
  attachments?: Attachment[];
  /** Trình bày thẻ: nhãn nhỏ, màu và các bước hướng dẫn (mỗi bước hỗ trợ **đậm** và `mã`). */
  badge?: string;
  color?: string;
  steps?: string[];
  /** Thứ tự do giáo viên kéo thả (nhỏ đứng trước); trống = chưa sắp xếp, đứng sau các tài liệu đã sắp. */
  order?: number;
}

/** Bài học (lớp học) hoặc buổi / nội dung tập huấn. Có thể có thời gian diễn ra. */
export interface Lesson {
  id: string;
  title: string;
  description: string;
  startsAt?: string | null;
  endsAt?: string | null;
}

/** assignment = bài tập phải nộp sản phẩm; requirement = yêu cầu / nhiệm vụ cần hoàn thành. */
export type TaskKind = 'assignment' | 'requirement';

export type EmbedProvider = 'youtube' | 'vimeo' | 'drive' | 'spotify';

export interface Attachment {
  type: 'image' | 'video' | 'audio' | 'file' | 'link' | 'embed' | 'text';
  name: string;
  url?: string;
  /** Chỉ với type = 'embed': nhà cung cấp và địa chỉ nhúng đã được kiểm tra (xem lib/embeds.ts). */
  embed?: { provider: EmbedProvider; src: string; thumb?: string };
  mime?: string;
  size?: number;
  /** Màu nền thumbnail mẫu khi chưa có ảnh thật. */
  hue?: number;
  /** Tên nút do giáo viên đặt (ví dụ “Tải gói Gemini cách A”). */
  label?: string;
  /** Mã tệp bản sao trên Google Drive của giáo viên (dùng để xóa theo khi xóa bài). */
  driveId?: string;
  /** true = tệp đã chuyển hẳn sang Drive của giáo viên và không còn trên hệ thống (url trỏ tới Drive). */
  archived?: boolean;
  /** Phân loại minh chứng của đầu việc (ví dụ "Biên bản kiểm tra"). */
  group?: string;
}

/** Quy tắc lặp của việc định kỳ: hằng ngày, thứ 2–6, tuần, tháng, quý, học kỳ (6 tháng), năm. */
export type RepeatRule = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'quarterly' | 'semester' | 'yearly'
  /** Lặp theo các thứ đã chọn: 'days:1234' = Thứ 2 đến Thứ 5 (1 = Thứ 2 … 7 = Chủ nhật). */
  | `days:${string}`;

/** Trạng thái việc riêng / việc tổng: chưa làm, đang làm, chờ bổ sung, hoãn, đã hủy, hoàn thành. */
export type TaskProgress = 'todo' | 'doing' | 'waiting' | 'postponed' | 'cancelled' | 'done';

/** Trạng thái một đầu việc thành phần. */
export type ItemStatus = 'todo' | 'scheduled' | 'doing' | 'waiting' | 'done' | 'postponed' | 'cancelled';

/** Đầu việc thành phần của một công việc tổng (ví dụ: kiểm tra từng giáo viên). */
export interface TaskSubItem {
  id: string;
  taskId: string;
  boardId: string;
  title: string;
  subject: string;
  plannedAt: string | null;
  status: ItemStatus;
  result: string;
  note: string;
  startedAt: string | null;
  doneAt: string | null;
  sort: number;
  attachments: Attachment[];
  deletedAt: string | null;
  createdAt: string;
}

/** Một dòng nhật ký tiến độ (chỉ thêm, không sửa). */
export interface TaskLog {
  id: string;
  taskId: string;
  itemId: string | null;
  actor: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  note: string;
  createdAt: string;
}

/** Bài tập hoặc yêu cầu của một bài học; bài nộp gắn vào đây. */
export interface TaskItem {
  id: string;
  label: string;
  lessonId?: string;
  kind?: TaskKind;
  instructions?: string;
  /** Lúc giao; trước thời điểm này học sinh chưa thấy và chưa nộp được. Trống = giao ngay. */
  assignedAt?: string | null;
  /** Hạn nộp. */
  dueAt?: string | null;
  /** Cho nộp muộn (bài nộp muộn được đánh dấu). */
  allowLate?: boolean;
  /** Tổ / nhóm / đơn vị được giao; trống = cả lớp. */
  targetUnits?: string[];
  /** Tài liệu (PDF, Word…) và liên kết (ví dụ phiếu khảo sát) giáo viên / tổ trưởng đính kèm công việc. */
  attachments?: Attachment[];
  /** true = người nhận phải nộp minh chứng (ảnh / tệp). */
  needsEvidence?: boolean;
  /** true = chỉ cần bấm "Tôi đã đọc" (công việc chỉ đọc, không nộp gì). */
  ackOnly?: boolean;
  /** Việc riêng: Cần làm / Đang làm / Xong (cột Kanban). Việc của tổ tính theo bài nộp, không dùng trường này. */
  progress?: TaskProgress;
  priority?: 'high' | 'normal' | 'low';
  /** Nhóm công việc (mã trong lib/taskPlan). */
  category?: string;
  /** Ngày bắt đầu, hạn báo cáo / nộp, ngày hoàn thành thực tế, ngày kết thúc lặp. */
  startAt?: string | null;
  reportDueAt?: string | null;
  completedAt?: string | null;
  repeatUntil?: string | null;
  /** Giao riêng cho các Gmail này (chữ thường). Rỗng = cả tổ / theo đơn vị. Chỉ chủ bảng thấy, khách không nhận trường này. */
  assigneeEmails?: string[];
  /** Việc định kỳ: kỳ mới tự sinh khi tổ trưởng mở bảng. Chỉ kỳ mới nhất của chuỗi còn mang quy tắc lặp. */
  repeat?: RepeatRule;
  /** Mã chuỗi định kỳ (mã của việc đầu tiên) để gom báo cáo theo kỳ. */
  seriesId?: string;
}

/** Một buổi điểm danh của lớp tập huấn: ngày (YYYY-MM-DD), tên buổi, và tên chuẩn hóa của những người có mặt. */
export interface AttendanceSession { day: string; label: string; present: string[] }

export interface SessionSlot {
  id: string;
  label: string;
  fromIso: string;
  toIso: string;
}

/** Nhận xét của một bạn học sinh về bài của bạn khác (đã qua bộ lọc ngôn ngữ). */
export interface CardComment {
  id: string;
  cardId: string;
  author: string;
  body: string;
  at: string;
  /** visible: mọi người thấy; pending: chờ giáo viên duyệt; hidden: giáo viên đã ẩn. Thiếu = visible. */
  status?: 'visible' | 'pending' | 'hidden';
}

export interface CardLocation {
  lat: number;
  lng: number;
  name?: string;
}

/** Thay đổi bố cục của một thẻ; null = bỏ giá trị. */
export interface CardLayoutPatch {
  pos?: { x: number; y: number } | null;
  venn?: VennRegion | null;
  loc?: CardLocation | null;
}

export interface PollOption {
  id: string;
  label: string;
  votes: number;
}

export interface SubmissionCard {
  id: string;
  boardId: string;
  authorName: string;
  /** Tổ/Lớp (lớp học) hoặc Trường/Đơn vị (tập huấn). */
  unit: string;
  title: string;
  taskId: string;
  body: string;
  /** Nhiều đính kèm cùng lúc: ảnh, video, tệp, liên kết… (tối đa 10). */
  attachments: Attachment[];
  /** Điểm giáo viên chấm, thang 10 (bước 0,5); undefined = chưa chấm. */
  grade?: number;
  /** Thăm dò ý kiến gắn vào bài (tiêu đề bài là câu hỏi). */
  poll?: PollOption[];
  /** Số sao (1–5) giáo viên chấm. */
  teacherStars?: number;
  /** Đánh giá sao của các bạn: số lượt và tổng sao (trung bình = tổng / số lượt). */
  ratingCount?: number;
  ratingSum?: number;
  /** Nhận xét của các bạn. */
  comments?: CardComment[];
  /** Vị trí trên bản đồ (kiểu xem Bản đồ). */
  loc?: CardLocation;
  /** Toạ độ thẻ trên Bảng trắng (pixel), do giáo viên kéo thả. */
  pos?: { x: number; y: number };
  /** Vùng trong biểu đồ Venn, do giáo viên xếp. */
  venn?: VennRegion;
  status: CardStatus;
  /** Nộp sau hạn của bài tập (chỉ có khi bài tập cho phép nộp muộn). */
  late?: boolean;
  submittedAt: string; // ISO
  teacherNote?: string;
  /** Mã sửa bài (chỉ có ở trình duyệt vừa nộp bài; máy chủ không trả lại cho người khác). */
  editCode?: string;
  /** Giờ nộp lại mới nhất (bản sửa sau khi đã nộp) và số lần nộp lại. */
  resubmittedAt?: string;
  revisions?: number;
  /** Từng lần nộp lại (giờ máy chủ) và tên tệp của bản đó. */
  history?: { at: string; files: string[] }[];
}

export interface RosterMember {
  id: string;
  name: string;
  unit: string;
  /** true = đã bắt đầu làm nhưng chưa nộp (hiển thị "Đang làm"). */
  startedWorking?: boolean;
  /** Vai trò trong tổ công tác: "Tổ trưởng", "Tổ phó", "Bí thư chi bộ"… (nhiều vai ngăn bằng dấu phẩy). */
  role?: string;
  /** Gmail (tùy chọn): để tổ phó làm đồng quản lý và để gom công việc về một chỗ. */
  email?: string;
  /** Hồ sơ thành viên tổ chuyên môn; chỉ người quản lý tổ nhận được. */
  gender?: string;
  birthDate?: string;
  homeroom?: string;
  teaching?: string;
}

/** Cài đặt giao diện của một bảng; lưu thành một cột JSON `settings` trong bảng boards. */
export interface BoardSettings {
  defaultView: ViewMode;
  sortBy: SortBy;
  icon: BoardIconId;
  background: BoardBackground;
  font: BoardFont;
  cardSize: 'compact' | 'standard' | 'wide';
  /** Kiểu chữ của tên bảng (cả tên): đậm, nghiêng, gạch chân, màu (#rrggbb). Không có = chữ mặc định. */
  titleStyle?: { b?: boolean; i?: boolean; u?: boolean; color?: string };
  /** Chỉ bảng việc riêng: chia sẻ "Công việc của tôi" bằng link. mode view = chỉ xem; edit = xem, và chủ sửa được khi đăng nhập đúng Gmail. key là mã riêng của link. */
  taskShare?: { mode: 'view' | 'edit'; key: string };
  /** Ảnh nền do giáo viên tải lên (data URL JPEG đã thu nhỏ); chỉ dùng khi background = 'custom'. */
  bgImage?: string;
  showAuthor: boolean;
  showTime: boolean;
  /** Tên hai vòng của biểu đồ Venn. */
  vennLabels: [string, string];
  /** Chế độ kiểm duyệt bài nộp và nhận xét của học sinh. */
  moderation: ModerationMode;
  /** Học sinh được chấm sao bài của bạn khác. */
  peerStars: boolean;
  /** Học sinh được nhận xét bài của bạn khác (có bộ lọc ngôn ngữ). */
  peerComments: boolean;
  /** Cho học sinh xem điểm số của giáo viên (mặc định tắt vì điểm là riêng tư). */
  showGrades: boolean;
  /** Phạm vi do giáo viên chọn khi tạo bảng; quyết định cách gọi (lớp / khối / bài học). */
  scope?: 'class' | 'grade' | 'lesson' | 'team';
  /** Tổ công tác: chỉ nhận bài của người có tên trong danh sách. */
  rosterOnly?: boolean;
  /** Tổ công tác: thành viên chỉ thấy bài của chính mình. */
  privateView?: boolean;
  /** Bảng việc riêng của giáo viên (tự tạo, ẩn khỏi danh sách bảng). */
  personal?: boolean;
  /** Cổng Google Drive của giáo viên (địa chỉ ứng dụng web Apps Script và mật khẩu cổng): tệp học sinh nộp được lưu thẳng vào Drive. */
  driveUrl?: string;
  driveSecret?: string;
}

export interface BoardData {
  id: string;
  mode: BoardMode;
  title: string;
  subtitle: string;
  goals: string;
  shareToken: string;
  /** Mã 6 số để học sinh nhập ở trang chủ thay cho link; trống = bảng chưa có mã (CSDL chưa cập nhật hoặc bảng việc riêng). */
  joinCode?: string | null;
  /** Cho phép vào bằng mã (giáo viên bật / tắt); mặc định bật, riêng bảng tổ công tác tắt sẵn. */
  joinEnabled?: boolean;
  linkMode: LinkMode;
  pinned: PinnedResource[];
  /** Bài học (lớp học) / buổi tập huấn, theo thứ tự. */
  lessons: Lesson[];
  /** Chương trình tập huấn chứa lớp này (gom nhóm nhiều lớp tập huấn); trống = không thuộc chương trình nào. */
  program?: string;
  tasks: TaskItem[];
  sessions: SessionSlot[];
  /** Điểm danh các buổi (chỉ chủ bảng tải khi mở hộp Điểm danh). */
  attendance?: AttendanceSession[];
  roster: RosterMember[];
  cards: SubmissionCard[];
  settings: BoardSettings;
  createdAt?: string;
  ownerEmail?: string;
  /** Đã đóng (lưu trữ): chỉ xem, không nhận bài mới. */
  archivedAt?: string | null;
  /** Trong thùng rác: tự xóa vĩnh viễn sau 30 ngày. */
  deletedAt?: string | null;
  /** Đánh dấu là mẫu: xuất hiện trong hộp Tạo bảng. */
  isTemplate?: boolean;
  /** Chỉ có khi nối Supabase: true = người đang đăng nhập là chủ bảng hoặc đồng quản lý. */
  managed?: boolean;
  /** Quyền của người đang đăng nhập; thiếu = chủ bảng (dữ liệu mẫu). */
  access?: BoardAccess;
  /** Giáo viên được chia sẻ bảng này. */
  collaborators?: Collaborator[];
}

export interface FilterState {
  search: string;
  title: string; // '' = tất cả
  taskId: string; // '' = tất cả
  progress: ProgressFilter;
  time: TimeFilter;
  sessionId: string;
}

/** Một dòng dữ liệu đã ghép: thành viên + bài nộp mới nhất (nếu có). */
export interface BoardRow {
  member: RosterMember;
  card: SubmissionCard | null;
  progress: MemberProgress;
  /** false = người nộp không có trong danh sách sĩ số (khách tự nhập tên). */
  inRoster: boolean;
}

export interface Kpis {
  total: number;
  submitted: number;
  waiting: number;
  notSubmitted: number;
  done: number;
  completionPct: number;
}

/** Một dòng trong nhật ký hoạt động của bảng. `action` là mã (xem ACTIVITY_LABEL trong lib/activity.ts). */
export interface ActivityEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
}
