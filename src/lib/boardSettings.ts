import { isGatewayUrl } from './drive';
import {
  BookOpen, Calculator, Clock, Columns3, FlaskConical, Globe, GraduationCap, Layers, LayoutDashboard, LayoutGrid, Lightbulb,
  MapPin, Move, Music, Network, Palette, Presentation, Table2, Blend,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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

export const ICONS: Record<BoardIconId, { label: string; Icon: LucideIcon }> = {
  book: { label: 'Sách', Icon: BookOpen },
  cap: { label: 'Mũ tốt nghiệp', Icon: GraduationCap },
  idea: { label: 'Ý tưởng', Icon: Lightbulb },
  palette: { label: 'Mỹ thuật', Icon: Palette },
  flask: { label: 'Khoa học', Icon: FlaskConical },
  calc: { label: 'Toán', Icon: Calculator },
  music: { label: 'Âm nhạc', Icon: Music },
  globe: { label: 'Địa lý', Icon: Globe },
};

/** `css` là nền của vùng làm việc; chọn màu sáng, nhạt để chữ luôn đạt tương phản khi chiếu. */
export const BACKGROUNDS: Record<BoardBackground, { label: string; css: string }> = {
  default: { label: 'Xanh băng', css: 'radial-gradient(900px 480px at 8% -8%, #d6e7ff 0%, transparent 60%), radial-gradient(800px 460px at 96% -4%, #c9f3ea 0%, transparent 58%), #f3f8ff' },
  mint: { label: 'Bạc hà', css: 'linear-gradient(160deg, #e6faf6 0%, #f3fbf8 55%, #eaf7ff 100%)' },
  sunset: { label: 'Hoàng hôn', css: 'linear-gradient(160deg, #fff1e6 0%, #fff7f0 50%, #ffeef3 100%)' },
  lavender: { label: 'Oải hương', css: 'linear-gradient(160deg, #f1ecff 0%, #f7f4ff 55%, #eaf1ff 100%)' },
  paper: { label: 'Giấy trắng', css: '#fbfbf8' },
};

export const FONTS: Record<BoardFont, { label: string; family: string }> = {
  sans: { label: 'Hiện đại', family: "'Be Vietnam Pro', system-ui, sans-serif" },
  serif: { label: 'Có chân', family: "'Lora', Georgia, serif" },
  hand: { label: 'Viết tay', family: "'Patrick Hand', 'Be Vietnam Pro', cursive" },
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
    cardSize: r.cardSize === 'wide' ? 'wide' : 'standard',
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
