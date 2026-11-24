import { isGatewayUrl } from './drive';
import {
  Apple, Atom, Award, Backpack, Beaker, Bell, Bird, Blend,
  Bone, BookOpen, Bot, Brush, Bug, Calculator, Camera, Cat,
  Clapperboard, Clock, Cloud, CloudRain, Code, Columns3, Contrast, Cpu,
  Database, Dna, Dog, Droplets, Eraser, Film, Fish, FlaskConical,
  Flower, Flower2, Folder, Gamepad2, Globe, GraduationCap, HardDrive, Heart,
  Highlighter, Keyboard, Languages, Laptop, Layers, LayoutDashboard, LayoutGrid, Leaf,
  Library, Lightbulb, Magnet, MapPin, Medal, Mic, Microscope, Monitor,
  Mountain, Mouse, Move, Music, Network, Notebook, NotebookPen, Orbit,
  PaintBucket, Palette, Paperclip, PawPrint, Pen, PenTool, Pencil, Pipette,
  Presentation, Puzzle, Rabbit, Rainbow, Rat, Rocket, Ruler, Satellite,
  School, Scissors, Sigma, Smartphone, Smile, Snail, Snowflake, Sparkles,
  Sprout, Squirrel, Star, StickyNote, Sun, Sunrise, Table2, Telescope,
  Terminal, TreeDeciduous, TreePine, Trophy, Turtle, Users, WandSparkles, Waves,
  Wifi,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { BoardBackground, BoardFont, BoardIconId, BoardSettings, ModerationMode, SortBy, ViewMode } from '../types/board';

export const DEFAULT_SETTINGS: BoardSettings = {
  defaultView: 'grid',
  sortBy: 'newest',
  icon: 'book',
  background: 'default',
  font: 'sans',
  cardSize: 'standard',
  showAuthor: true,
  showTime: true,
  vennLabels: ['Nhóm A', 'Nhóm B'],
  // Mặc định cho bảng MỚI: tắt kiểm duyệt, học sinh nộp là hiện ngay (giáo viên bật kiểm duyệt khi cần).
  moderation: 'off',
  peerStars: true,
  peerComments: true,
  showGrades: false,
};

/** Biểu tượng của bảng, chia theo nhóm để giáo viên tìm nhanh. `id` lưu trong cài đặt bảng nên không đổi tên về sau. */
export const ICON_GROUPS: { title: string; items: [id: string, label: string, Icon: LucideIcon][] }[] = [
  { title: 'Giáo dục', items: [
    ['book', 'Sách', BookOpen], ['cap', 'Mũ tốt nghiệp', GraduationCap], ['school', 'Trường học', School], ['library', 'Thư viện', Library],
    ['award', 'Giải thưởng', Award], ['medal', 'Huy chương', Medal], ['trophy', 'Cúp', Trophy], ['users', 'Nhóm học tập', Users],
    ['present', 'Bài giảng', Presentation], ['lang', 'Ngôn ngữ', Languages], ['notepen', 'Ghi chép', NotebookPen], ['apple', 'Quả táo', Apple],
  ] },
  { title: 'Máy tính & kỹ thuật', items: [
    ['monitor', 'Màn hình', Monitor], ['laptop', 'Máy tính xách tay', Laptop], ['keyboard', 'Bàn phím', Keyboard], ['mouse', 'Chuột', Mouse],
    ['cpu', 'Vi xử lý', Cpu], ['disk', 'Ổ cứng', HardDrive], ['code', 'Lập trình', Code], ['terminal', 'Dòng lệnh', Terminal],
    ['wifi', 'Mạng', Wifi], ['phone', 'Điện thoại', Smartphone], ['database', 'Dữ liệu', Database], ['bot', 'Robot / AI', Bot],
  ] },
  { title: 'Sáng tạo', items: [
    ['idea', 'Ý tưởng', Lightbulb], ['sparkles', 'Lấp lánh', Sparkles], ['wand', 'Đũa phép', WandSparkles], ['rocket', 'Tên lửa', Rocket],
    ['puzzle', 'Trò chơi ghép', Puzzle], ['brush', 'Cọ vẽ', Brush], ['camera', 'Máy ảnh', Camera], ['film', 'Phim', Film],
    ['clap', 'Làm phim', Clapperboard], ['mic', 'Micro', Mic], ['music', 'Âm nhạc', Music], ['game', 'Trò chơi', Gamepad2],
  ] },
  { title: 'Màu sắc', items: [
    ['palette', 'Bảng màu', Palette], ['drops', 'Giọt màu', Droplets], ['bucket', 'Xô sơn', PaintBucket], ['pipette', 'Ống hút màu', Pipette],
    ['rainbow', 'Cầu vồng', Rainbow], ['blend', 'Hòa màu', Blend], ['contrast', 'Tương phản', Contrast], ['sun', 'Mặt trời', Sun],
    ['heart', 'Trái tim', Heart], ['star', 'Ngôi sao', Star], ['smile', 'Mặt cười', Smile], ['bell', 'Chuông', Bell],
  ] },
  { title: 'Khoa học', items: [
    ['flask', 'Bình thí nghiệm', FlaskConical], ['beaker', 'Cốc đong', Beaker], ['atom', 'Nguyên tử', Atom], ['microscope', 'Kính hiển vi', Microscope],
    ['telescope', 'Kính thiên văn', Telescope], ['dna', 'ADN', Dna], ['magnet', 'Nam châm', Magnet], ['orbit', 'Quỹ đạo', Orbit],
    ['calc', 'Toán', Calculator], ['sigma', 'Ký hiệu toán', Sigma], ['globe', 'Địa lý', Globe], ['satellite', 'Vệ tinh', Satellite],
  ] },
  { title: 'Thiên nhiên', items: [
    ['leaf', 'Chiếc lá', Leaf], ['pine', 'Cây thông', TreePine], ['tree', 'Cái cây', TreeDeciduous], ['flower', 'Bông hoa', Flower],
    ['flower2', 'Hoa nhiều cánh', Flower2], ['sprout', 'Mầm cây', Sprout], ['mountain', 'Núi', Mountain], ['waves', 'Sóng nước', Waves],
    ['cloud', 'Mây', Cloud], ['rain', 'Mưa', CloudRain], ['snow', 'Bông tuyết', Snowflake], ['sunrise', 'Bình minh', Sunrise],
  ] },
  { title: 'Động vật', items: [
    ['cat', 'Mèo', Cat], ['dog', 'Chó', Dog], ['bird', 'Chim', Bird], ['fish', 'Cá', Fish],
    ['rabbit', 'Thỏ', Rabbit], ['squirrel', 'Sóc', Squirrel], ['turtle', 'Rùa', Turtle], ['bug', 'Côn trùng', Bug],
    ['rat', 'Chuột nhắt', Rat], ['snail', 'Ốc sên', Snail], ['paw', 'Dấu chân thú', PawPrint], ['bone', 'Khúc xương', Bone],
  ] },
  { title: 'Đồ dùng học tập', items: [
    ['pencil', 'Bút chì', Pencil], ['pentool', 'Bút vẽ', PenTool], ['pen', 'Bút mực', Pen], ['highlighter', 'Bút dạ', Highlighter],
    ['ruler', 'Thước kẻ', Ruler], ['eraser', 'Cục tẩy', Eraser], ['scissors', 'Kéo', Scissors], ['clip', 'Kẹp giấy', Paperclip],
    ['backpack', 'Cặp sách', Backpack], ['notebook', 'Vở', Notebook], ['sticky', 'Giấy nhớ', StickyNote], ['folder', 'Thư mục', Folder],
  ] },
];

export const ICONS: Record<string, { label: string; Icon: LucideIcon }> = Object.fromEntries(
  ICON_GROUPS.flatMap((g) => g.items.map(([id, label, Icon]) => [id, { label, Icon }])),
);

/** `css` là nền của vùng làm việc; chọn màu sáng, nhạt để chữ luôn đạt tương phản khi chiếu. */
export const BACKGROUNDS: Record<string, { label: string; css: string }> = {
  default: { label: 'Xanh băng', css: 'radial-gradient(900px 480px at 8% -8%, #d6e7ff 0%, transparent 60%), radial-gradient(800px 460px at 96% -4%, #c9f3ea 0%, transparent 58%), #f3f8ff' },
  mint: { label: 'Bạc hà', css: 'linear-gradient(160deg, #e6faf6 0%, #f3fbf8 55%, #eaf7ff 100%)' },
  sunset: { label: 'Hoàng hôn', css: 'linear-gradient(160deg, #fff1e6 0%, #fff7f0 50%, #ffeef3 100%)' },
  lavender: { label: 'Oải hương', css: 'linear-gradient(160deg, #f1ecff 0%, #f7f4ff 55%, #eaf1ff 100%)' },
  paper: { label: 'Giấy trắng', css: '#fbfbf8' },
  // Ảnh do giáo viên tải lên: phần ảnh vẽ riêng ở đầu trang (xem BoardWorkspace), nên màu nền bên dưới là màu nhạt.
  custom: { label: 'Ảnh của bạn', css: '#f3f8ff' },
};

export interface FontDef { label: string; family: string; group: 'Hiện đại' | 'Có chân' | 'Nghệ thuật' }
/** Toàn bộ phông chữ dưới đây đều có đủ dấu tiếng Việt (nạp từ Google Fonts trong index.html). */
export const FONTS: Record<string, FontDef> = {
  sans: { label: 'Be Vietnam Pro', family: "'Be Vietnam Pro', system-ui, sans-serif", group: 'Hiện đại' },
  nunito: { label: 'Nunito', family: "'Nunito', 'Be Vietnam Pro', sans-serif", group: 'Hiện đại' },
  quicksand: { label: 'Quicksand', family: "'Quicksand', 'Be Vietnam Pro', sans-serif", group: 'Hiện đại' },
  lexend: { label: 'Lexend', family: "'Lexend', 'Be Vietnam Pro', sans-serif", group: 'Hiện đại' },
  montserrat: { label: 'Montserrat', family: "'Montserrat', 'Be Vietnam Pro', sans-serif", group: 'Hiện đại' },
  roboto: { label: 'Roboto', family: "'Roboto', 'Be Vietnam Pro', sans-serif", group: 'Hiện đại' },
  opensans: { label: 'Open Sans', family: "'Open Sans', 'Be Vietnam Pro', sans-serif", group: 'Hiện đại' },
  serif: { label: 'Lora', family: "'Lora', Georgia, serif", group: 'Có chân' },
  playfair: { label: 'Playfair Display', family: "'Playfair Display', Georgia, serif", group: 'Có chân' },
  hand: { label: 'Patrick Hand', family: "'Patrick Hand', 'Be Vietnam Pro', cursive", group: 'Nghệ thuật' },
  baloo: { label: 'Baloo 2', family: "'Baloo 2', 'Be Vietnam Pro', cursive", group: 'Nghệ thuật' },
  playpen: { label: 'Playpen Sans', family: "'Playpen Sans', 'Be Vietnam Pro', cursive", group: 'Nghệ thuật' },
  sriracha: { label: 'Sriracha', family: "'Sriracha', 'Be Vietnam Pro', cursive", group: 'Nghệ thuật' },
  charm: { label: 'Charm', family: "'Charm', 'Be Vietnam Pro', cursive", group: 'Nghệ thuật' },
  dancing: { label: 'Dancing Script', family: "'Dancing Script', 'Be Vietnam Pro', cursive", group: 'Nghệ thuật' },
  lobster: { label: 'Lobster', family: "'Lobster', 'Be Vietnam Pro', cursive", group: 'Nghệ thuật' },
  pacifico: { label: 'Pacifico', family: "'Pacifico', 'Be Vietnam Pro', cursive", group: 'Nghệ thuật' },
};

export const SORTS: Record<SortBy, string> = {
  newest: 'Mới nhất lên đầu',
  oldest: 'Cũ nhất lên đầu',
  name: 'Theo tên A → Z',
  unit: 'Theo tổ / đơn vị',
};

/** Mười một kiểu bố cục: nhãn, mô tả ngắn và biểu tượng cho menu chọn bố cục. */
export const VIEW_META: Record<ViewMode, { label: string; desc: string; Icon: LucideIcon }> = {
  wall: { label: 'Tường', desc: 'Thẻ xếp khít như gạch', Icon: LayoutDashboard },
  grid: { label: 'Lưới thẻ', desc: 'Thẻ đều nhau, dễ so sánh', Icon: LayoutGrid },
  columns: { label: 'Chia cột', desc: 'Cột theo tiến trình hoặc nhiệm vụ', Icon: Columns3 },
  table: { label: 'Bảng danh sách', desc: 'Đối chiếu sĩ số, ai nộp ai chưa', Icon: Table2 },
  summary: { label: 'Tổng hợp nhóm', desc: 'Tỉ lệ hoàn thành theo tổ / đơn vị', Icon: Layers },
  timeline: { label: 'Dòng thời gian', desc: 'Bài xếp theo ngày nộp', Icon: Clock },
  map: { label: 'Bản đồ', desc: 'Ghim bài lên bản đồ', Icon: MapPin },
  canvas: { label: 'Bảng trắng', desc: 'Kéo thẻ tự do trên mặt phẳng', Icon: Move },
  mindmap: { label: 'Sơ đồ động não', desc: 'Nhánh theo nhiệm vụ', Icon: Network },
  venn: { label: 'Biểu đồ Venn', desc: 'Xếp bài vào hai vòng giao nhau', Icon: Blend },
  slides: { label: 'Thuyết trình', desc: 'Từng bài như một trang chiếu', Icon: Presentation },
};

export const VIEW_LABEL: Record<ViewMode, string> = Object.fromEntries(
  (Object.keys(VIEW_META) as ViewMode[]).map((k) => [k, VIEW_META[k].label]),
) as Record<ViewMode, string>;

function parseVennLabels(v: unknown): [string, string] {
  const d = DEFAULT_SETTINGS.vennLabels;
  if (!Array.isArray(v) || v.length !== 2) return d;
  const clean = (x: unknown, fallback: string): string => (typeof x === 'string' && x.trim() ? x.trim().slice(0, 40) : fallback);
  return [clean(v[0], d[0]), clean(v[1], d[1])];
}

/** Chỉ nhận ảnh nền dạng data URL ảnh, ký tự base64 thuần và không quá lớn: dùng trong CSS url() nên phải chắc chắn không chứa gì khác. */
export const MAX_BG_CHARS = 420_000;
/** Chia sẻ công việc: chỉ nhận chế độ hợp lệ và mã gồm chữ, số, gạch (16–64 ký tự). */
export function parseTaskShare(v: unknown): BoardSettings['taskShare'] | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  if ((r.mode !== 'view' && r.mode !== 'edit') || typeof r.key !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(r.key)) return undefined;
  return { mode: r.mode, key: r.key };
}

export type TitleStyle = NonNullable<BoardSettings['titleStyle']>;
const HEX6 = /^#[0-9a-fA-F]{6}$/;
/** Lọc kiểu chữ tên bảng đọc từ CSDL: chỉ nhận cờ đúng/sai và màu #rrggbb. */
export function parseTitleStyle(v: unknown): TitleStyle | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  const out: TitleStyle = {};
  if (r.b === true) out.b = true;
  if (r.i === true) out.i = true;
  if (r.u === true) out.u = true;
  if (typeof r.color === 'string' && HEX6.test(r.color)) out.color = r.color.toLowerCase();
  return Object.keys(out).length > 0 ? out : undefined;
}
/** CSS cho tên bảng theo kiểu chữ đã chọn (không có thì để mặc định). */
export const titleCss = (t?: TitleStyle): CSSProperties => ({
  ...(t?.b ? { fontWeight: 900 } : {}), ...(t?.i ? { fontStyle: 'italic' } : {}), ...(t?.u ? { textDecoration: 'underline' } : {}),
  // Tên bảng (h1) mặc định tô chữ gradient bằng text-fill trong suốt (index.css); chọn màu thì phải bỏ gradient và đặt cả text-fill.
  ...(t?.color ? { color: t.color, WebkitTextFillColor: t.color, backgroundImage: 'none' } : {}),
});

export const isBgImage = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= MAX_BG_CHARS && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v);

/** Đọc cột JSON từ CSDL: giá trị thiếu hoặc lạ thì dùng mặc định, không bao giờ làm sập giao diện. */
export function parseSettings(raw: unknown): BoardSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof BoardSettings, unknown>>;
  const pick = <T extends string>(v: unknown, allowed: readonly string[], fallback: T): T =>
    typeof v === 'string' && allowed.includes(v) ? (v as T) : fallback;
  return {
    defaultView: pick(r.defaultView, Object.keys(VIEW_LABEL), DEFAULT_SETTINGS.defaultView),
    sortBy: pick(r.sortBy, Object.keys(SORTS), DEFAULT_SETTINGS.sortBy),
    icon: pick(r.icon, Object.keys(ICONS), DEFAULT_SETTINGS.icon),
    background: pick(r.background, Object.keys(BACKGROUNDS), DEFAULT_SETTINGS.background),
    font: pick(r.font, Object.keys(FONTS), DEFAULT_SETTINGS.font),
    cardSize: r.cardSize === 'wide' ? 'wide' : r.cardSize === 'compact' ? 'compact' : 'standard',
    ...(isBgImage(r.bgImage) ? { bgImage: r.bgImage } : {}),
    ...(parseTaskShare(r.taskShare) ? { taskShare: parseTaskShare(r.taskShare) } : {}),
    ...(parseTitleStyle(r.titleStyle) ? { titleStyle: parseTitleStyle(r.titleStyle) } : {}),
    showAuthor: r.showAuthor !== false,
    showTime: r.showTime !== false,
    vennLabels: parseVennLabels(r.vennLabels),
    // Bảng cũ chưa lưu mục này thì máy chủ đang áp 'manual', giữ nguyên để giao diện khớp máy chủ.
    moderation: pick(r.moderation, ['off', 'manual', 'auto'], 'manual'),
    peerStars: r.peerStars !== false,
    peerComments: r.peerComments !== false,
    showGrades: r.showGrades === true,
    ...(r.scope === 'class' || r.scope === 'grade' || r.scope === 'lesson' || r.scope === 'team' ? { scope: r.scope } : {}),
    ...(r.rosterOnly === true ? { rosterOnly: true } : {}),
    ...(r.privateView === true ? { privateView: true } : {}),
    ...(r.personal === true ? { personal: true } : {}),
    ...(typeof r.driveUrl === 'string' && isGatewayUrl(r.driveUrl) && typeof r.driveSecret === 'string' && /^[A-Za-z0-9]{8,80}$/.test(r.driveSecret)
      ? { driveUrl: r.driveUrl, driveSecret: r.driveSecret } : {}),
  };
}

/** Ba chế độ kiểm duyệt: nhãn và mô tả cho hộp chọn. */
export const MODERATION_META: Record<ModerationMode, { label: string; short: string; desc: string }> = {
  off: { label: 'Tắt kiểm duyệt', short: 'Hiện ngay', desc: 'Bài và nhận xét của học sinh hiện ngay. Bộ lọc từ ngữ không lành mạnh trong nhận xét vẫn luôn bật.' },
  manual: { label: 'Giáo viên duyệt', short: 'Giáo viên duyệt', desc: 'Mọi bài và nhận xét của học sinh chờ giáo viên duyệt mới hiện công khai.' },
  auto: { label: 'Hệ thống tự động duyệt', short: 'Hệ thống tự duyệt', desc: 'Hệ thống đọc chữ của bài và nhận xét: sạch thì hiện ngay, nghi ngờ thì giữ lại cho giáo viên xem. Ảnh, video, tệp đính kèm không được quét tự động.' },
};
