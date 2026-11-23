// Bộ dữ liệu giả lập một giáo viên quản lý nhiều lớp: 10 lớp học và 5 chương trình tập huấn (13 lớp tập huấn),
// cộng các bảng được chia sẻ. Chỉ dùng khi chạy thử giao diện ở chế độ dữ liệu mẫu và thêm ?demo=full vào địa chỉ.

import type { BoardData, CardStatus } from '../types/board';
import { DEFAULT_SETTINGS } from '../lib/boardSettings';
import { CLASS_BOARD, MOCK_BOARDS, ONE_DAY_MS, TRAIN_BOARD } from './mockBoardData';

const STATUSES: CardStatus[] = ['approved', 'pending', 'approved', 'featured', 'needs_edit', 'approved', 'pending'];
const OWNER = 'co.lan.tieuhoc@gmail.com';

function variant(src: BoardData, id: string, patch: Partial<BoardData>, i: number): BoardData {
  const n = 6 + ((i * 5) % Math.max(1, src.cards.length - 5));
  const shift = (i % 5) * 0.4 * ONE_DAY_MS;
  return {
    ...src,
    id,
    shareToken: `${id.replace(/[^a-z0-9]/g, '')}z9`.slice(0, 10),
    cards: src.cards.slice(0, n).map((c, k) => ({
      ...c, id: `${id}-c${k}`, boardId: id,
      status: STATUSES[(k + i) % STATUSES.length],
      submittedAt: new Date(Date.now() - shift - k * 3_600_000).toISOString(),
    })),
    roster: src.roster.map((m) => ({ ...m, id: `${id}-${m.id}` })),
    pinned: src.pinned.map((r) => ({ ...r, id: `${id}-${r.id}` })),
    tasks: src.tasks.map((t) => ({ ...t, dueAt: t.dueAt ? new Date(new Date(t.dueAt).getTime() + (i % 4) * ONE_DAY_MS).toISOString() : t.dueAt })),
    ownerEmail: OWNER,
    collaborators: [],
    settings: { ...DEFAULT_SETTINGS, icon: src.settings.icon },
    ...patch,
  };
}

const SUBJECTS = ['Tiếng Việt', 'Toán', 'Tin học', 'Khoa học', 'Đạo đức', 'Tiếng Anh', 'Lịch sử và Địa lí', 'Mĩ thuật', 'Âm nhạc', 'Công nghệ'];
const CLASS_NAMES = ['1A', '2B', '3A', '3C', '4A', '4B', '5A', '5B', '5C', '5D'];

const PROGRAMS: Array<{ name: string; boards: string[] }> = [
  { name: 'Bồi dưỡng thường xuyên 2025–2026', boards: ['Thiết kế kế hoạch bài dạy', 'Ứng dụng AI trong dạy học', 'Xây dựng đề kiểm tra'] },
  { name: 'Chương trình GDPT 2018 – Module Tin học', boards: ['Dạy học lập trình Scratch', 'Tìm kiếm thông tin trên internet'] },
  { name: 'Tập huấn chuyển đổi số', boards: ['Học liệu số và bài giảng điện tử', 'Quản lý lớp học trực tuyến', 'An toàn thông tin cho học sinh'] },
  { name: 'Bồi dưỡng giáo viên cốt cán', boards: ['Sinh hoạt chuyên môn theo nghiên cứu bài học', 'Đánh giá năng lực học sinh'] },
  { name: 'Tập huấn kỹ năng mềm cho giáo viên', boards: ['Giao tiếp sư phạm', 'Tư vấn tâm lý học đường', 'Quản lý cảm xúc'] },
];

export function buildLargeDemo(): BoardData[] {
  const classes = CLASS_NAMES.map((cn, i) => variant(CLASS_BOARD, `demo-lop-${i}`, {
    title: `Lớp ${cn} – ${SUBJECTS[i]}`, subtitle: `Trường Tiểu học Kim Đồng · Cô Nguyễn Thị Lan`,
    ...(i === 7 ? { archivedAt: undefined } : {}),
  }, i));
  const trains = PROGRAMS.flatMap((p, pi) => p.boards.map((t, bi) => variant(TRAIN_BOARD, `demo-th-${pi}-${bi}`, {
    title: `Tập huấn: ${t}`, program: p.name, subtitle: 'Phòng GD&ĐT · Báo cáo viên: Thầy Trần Minh Quân',
  }, pi * 3 + bi + 1)));
  const shared = MOCK_BOARDS.filter((b) => (b.access ?? 'owner') !== 'owner' || b.ownerEmail !== OWNER);
  return [...classes, ...trains, ...shared];
}
