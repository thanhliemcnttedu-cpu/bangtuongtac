// Dữ liệu mẫu cho bản giao diện thử nghiệm.
// NỐI SUPABASE SAU: thay các hằng số này bằng truy vấn trong src/lib/boardApi.ts
//   - MOCK_ACCOUNTS  → danh sách tài khoản đã đăng nhập (supabase.auth + localStorage)
//   - MOCK_BOARDS    → bảng `boards` (+ `cards`, `board_collaborators`) lọc theo owner_email / cộng tác
// Thời gian bài nộp tính lùi từ lúc mở trang để bộ lọc "Hôm nay / 24h / 7 ngày" luôn có dữ liệu.

import type {
  Attachment,
  BoardData,
  Lesson,
  TaskItem,
  CardStatus,
  GmailAccount,
  RosterMember,
  SessionSlot,
  SubmissionCard,
} from '../types/board';
import { DEFAULT_SETTINGS } from '../lib/boardSettings';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const NOW = Date.now();
const ago = (minutes: number): string => new Date(NOW - minutes * MIN).toISOString();

export const MOCK_ACCOUNTS: GmailAccount[] = [
  { id: 'acc-1', email: 'co.lan.tieuhoc@gmail.com', name: 'Cô Nguyễn Thị Lan', hue: 215 },
  { id: 'acc-2', email: 'baocaovien.taphuan@gmail.com', name: 'Thầy Trần Minh Quân (báo cáo viên)', hue: 170 },
  { id: 'acc-3', email: 'to.truong.chuyenmon@gmail.com', name: 'Cô Lê Hoài Thu (tổ trưởng)', hue: 280 },
];

const img = (name: string, hue: number): Attachment => ({ type: 'image', name, hue });
const file = (name: string): Attachment => ({ type: 'file', name });
const link = (name: string, url: string): Attachment => ({ type: 'link', name, url });

interface CardSeed {
  member: number; // chỉ số trong roster
  title: string;
  task: string;
  body: string;
  att: Attachment | null;
  status: CardStatus;
  minutesAgo: number;
  note?: string;
}

function buildCards(boardId: string, roster: RosterMember[], seeds: CardSeed[]): SubmissionCard[] {
  return seeds.map((s, i) => ({
    id: `${boardId}-c${i + 1}`,
    boardId,
    authorName: roster[s.member].name,
    unit: roster[s.member].unit,
    title: s.title,
    taskId: s.task,
    body: s.body,
    attachments: s.att ? [s.att] : [],
    status: s.status,
    submittedAt: ago(s.minutesAgo),
    teacherNote: s.note,
  }));
}

/* ===================== BẢNG 1: LỚP HỌC (tiểu học) ===================== */

const classRoster: RosterMember[] = [
  ['Nguyễn Gia Bảo', 'Tổ 1'], ['Trần Khánh An', 'Tổ 1'], ['Lê Minh Châu', 'Tổ 1'],
  ['Phạm Đức Dũng', 'Tổ 1'], ['Hoàng Bảo Ngọc', 'Tổ 1'], ['Vũ Thanh Hà', 'Tổ 1'],
  ['Đặng Quốc Huy', 'Tổ 2'], ['Bùi Diệp Chi', 'Tổ 2'], ['Ngô Hải Đăng', 'Tổ 2'],
  ['Phan Mai Anh', 'Tổ 2'], ['Đỗ Tuấn Kiệt', 'Tổ 2'], ['Lý Hà My', 'Tổ 2'],
  ['Trịnh Gia Hân', 'Tổ 3'], ['Dương Anh Khoa', 'Tổ 3'], ['Võ Thảo Nguyên', 'Tổ 3'],
  ['Mai Nhật Minh', 'Tổ 3'], ['Cao Bảo Châu', 'Tổ 3'], ['Tạ Quang Vinh', 'Tổ 3'],
  ['Hồ Phương Thảo', 'Tổ 4'], ['Lương Tuệ Lâm', 'Tổ 4'], ['Đinh Khải Hưng', 'Tổ 4'],
  ['Chu Ngọc Diệp', 'Tổ 4'], ['Kiều Anh Thư', 'Tổ 4'], ['Nghiêm Hoàng Long', 'Tổ 4'],
].map(([name, unit], i) => ({
  id: `hs-${i + 1}`,
  name,
  unit,
  startedWorking: i === 5 || i === 17 || i === 21,
}));

const classSessions: SessionSlot[] = [
  { id: 'lop-b1', label: 'Buổi 1 · 3 ngày trước', fromIso: ago(4 * 24 * 60), toIso: ago(2.5 * 24 * 60) },
  { id: 'lop-b2', label: 'Buổi 2 · hôm qua', fromIso: ago(2 * 24 * 60), toIso: ago(20 * 60) },
  { id: 'lop-b3', label: 'Buổi 3 · hôm nay', fromIso: ago(20 * 60), toIso: ago(-60) },
];

const classCards = buildCards('lop-4a', classRoster, [
  { member: 0, title: 'Sơ đồ tư duy: Mùa xuân', task: 'nv1', body: 'Em vẽ cây hoa đào và các bạn đi chúc Tết.', att: img('so-do-mua-xuan.jpg', 200), status: 'featured', minutesAgo: 25, note: 'Màu sắc hài hòa, trình bày gọn.' },
  { member: 1, title: 'Sơ đồ tư duy: Mùa xuân', task: 'nv1', body: 'Sơ đồ có 4 nhánh: cây, hoa, chim, người.', att: img('anh-an.jpg', 150), status: 'approved', minutesAgo: 50 },
  { member: 2, title: 'Sơ đồ tư duy: Mùa xuân', task: 'nv1', body: 'Em tô màu bằng bút sáp.', att: img('chau.jpg', 320), status: 'pending', minutesAgo: 8 },
  { member: 3, title: 'Năm câu về gia đình', task: 'nv2', body: 'Gia đình em có bốn người. Bố em làm thợ điện. Mẹ em là cô giáo. Em có một em gái. Em rất yêu gia đình.', att: null, status: 'approved', minutesAgo: 190 },
  { member: 4, title: 'Sơ đồ tư duy: Mùa xuân', task: 'nv1', body: 'Bài làm lần 1.', att: img('ngoc.jpg', 20), status: 'needs_edit', minutesAgo: 300, note: 'Em ghi thêm tên các nhánh nhé.' },
  { member: 6, title: 'Năm câu về gia đình', task: 'nv2', body: 'Nhà em ở gần trường. Em hay giúp mẹ nấu cơm.', att: null, status: 'pending', minutesAgo: 35 },
  { member: 7, title: 'Sơ đồ tư duy: Mùa xuân', task: 'nv1', body: 'Em vẽ vườn rau mùa xuân.', att: img('chi.jpg', 120), status: 'approved', minutesAgo: 70 },
  { member: 8, title: 'Sơ đồ tư duy: Mùa xuân', task: 'nv1', body: 'Sơ đồ nhóm có ảnh chụp.', att: file('dang-so-do.pdf'), status: 'approved', minutesAgo: 1500 },
  { member: 9, title: 'Năm câu về gia đình', task: 'nv2', body: 'Em tên là Mai Anh. Em học lớp 4A. Em thích đọc truyện.', att: null, status: 'featured', minutesAgo: 1700, note: 'Câu văn rõ ràng, đúng chính tả.' },
  { member: 10, title: 'Năm câu về gia đình', task: 'nv2', body: 'Em kể về bà ngoại của em.', att: link('Video đọc bài', 'https://example.com/kiet'), status: 'approved', minutesAgo: 1900 },
  { member: 12, title: 'Sơ đồ tư duy: Mùa xuân', task: 'nv1', body: 'Em làm cùng chị gái.', att: img('han.jpg', 260), status: 'pending', minutesAgo: 14 },
  { member: 13, title: 'Năm câu về gia đình', task: 'nv2', body: 'Chủ nhật em đi công viên cùng cả nhà.', att: null, status: 'approved', minutesAgo: 4000 },
  { member: 14, title: 'Sơ đồ tư duy: Mùa xuân', task: 'nv1', body: 'Em vẽ bằng máy tính bảng.', att: img('nguyen.jpg', 190), status: 'approved', minutesAgo: 5200 },
  { member: 15, title: 'Năm câu về gia đình', task: 'nv2', body: 'Em có một chú chó tên là Mực.', att: null, status: 'needs_edit', minutesAgo: 95, note: 'Viết hoa tên riêng và kết bài thêm một câu.' },
  { member: 16, title: 'Sơ đồ tư duy: Mùa xuân', task: 'nv1', body: 'Em xin nộp bài.', att: img('chau-bc.jpg', 90), status: 'approved', minutesAgo: 3100 },
  { member: 18, title: 'Năm câu về gia đình', task: 'nv2', body: 'Gia đình em đi du lịch Đà Lạt.', att: img('thao-dalat.jpg', 340), status: 'featured', minutesAgo: 120 },
  { member: 19, title: 'Sơ đồ tư duy: Mùa xuân', task: 'nv1', body: 'Em tô màu rất cẩn thận.', att: img('lam.jpg', 60), status: 'approved', minutesAgo: 1450 },
  { member: 20, title: 'Năm câu về gia đình', task: 'nv2', body: 'Bài viết của em.', att: null, status: 'pending', minutesAgo: 3 },
]);

// Dữ liệu mẫu cho đánh giá giữa các bạn: một số bài đã có sao, nhận xét và sao của giáo viên.
classCards.forEach((c, i) => {
  if (c.status === 'approved' || c.status === 'featured') {
    c.ratingCount = 3 + (i % 4);
    c.ratingSum = c.ratingCount * (3 + (i % 3));
    if (i % 2 === 0) c.teacherStars = 3 + (i % 3);
  }
  if (i % 3 === 0 && (c.status === 'approved' || c.status === 'featured')) {
    c.comments = [
      { id: `${c.id}-cm1`, cardId: c.id, author: 'Bạn Minh Anh', body: 'Mình thích màu sắc của bạn, rất hài hòa!', at: ago(40 + i * 5) },
      { id: `${c.id}-cm2`, cardId: c.id, author: 'Bạn Gia Huy', body: 'Bài làm gọn gàng. Bạn có thể ghi thêm tên các nhánh nữa nhé.', at: ago(20 + i * 5) },
    ];
  }
});

/** Bài học và bài tập mẫu của Lớp 4A: có hạn đã qua (cho nộp muộn), sắp đến hạn, giao riêng cho tổ, và bài hẹn giờ giao. */
const classLessons: Lesson[] = [
  { id: 'bh1', title: 'Bài 1 · Mùa xuân', description: 'Quan sát tranh, nói về mùa xuân và vẽ sơ đồ tư duy.', startsAt: ago(4 * 24 * 60), endsAt: ago(2.5 * 24 * 60) },
  { id: 'bh2', title: 'Bài 2 · Gia đình em', description: 'Viết đoạn văn ngắn giới thiệu gia đình; đọc diễn cảm bài thơ.', startsAt: ago(2 * 24 * 60), endsAt: ago(-24 * 60) },
  { id: 'bh3', title: 'Bài 3 · Em yêu thiên nhiên', description: 'Bài sẽ mở vào tuần sau.', startsAt: ago(-3 * 24 * 60), endsAt: null },
];

const classTasks: TaskItem[] = [
  { id: 'nv1', label: 'Nhiệm vụ 1 · Sơ đồ tư duy', lessonId: 'bh1', kind: 'assignment', instructions: 'Vẽ sơ đồ tư duy về mùa xuân, có ít nhất 4 nhánh. Nộp ảnh chụp hoặc tệp.', assignedAt: ago(4 * 24 * 60), dueAt: ago(6 * 60), allowLate: true, targetUnits: [] },
  { id: 'nv2', label: 'Nhiệm vụ 2 · Viết 5 câu', lessonId: 'bh2', kind: 'assignment', instructions: 'Viết 5 câu giới thiệu về gia đình em.', assignedAt: ago(2 * 24 * 60), dueAt: ago(-20 * 60), allowLate: false, targetUnits: [] },
  { id: 'nv3', label: 'Yêu cầu · Đọc diễn cảm bài thơ', lessonId: 'bh2', kind: 'requirement', instructions: 'Quay video em đọc diễn cảm khổ thơ đầu. Chỉ giao cho Tổ 3 và Tổ 4.', assignedAt: ago(24 * 60), dueAt: ago(-3 * 24 * 60), allowLate: false, targetUnits: ['Tổ 3', 'Tổ 4'] },
  { id: 'nv4', label: 'Nhiệm vụ 3 · Ảnh thiên nhiên quanh em', lessonId: 'bh3', kind: 'assignment', instructions: 'Chụp một bức ảnh thiên nhiên gần nhà em.', assignedAt: ago(-3 * 24 * 60), dueAt: ago(-6 * 24 * 60), allowLate: false, targetUnits: [] },
];

export const CLASS_BOARD: BoardData = {
  id: 'lop-4a',
  mode: 'classroom',
  title: 'Lớp 4A – Tiếng Việt tuần 20',
  subtitle: 'Trường Tiểu học Kim Đồng · Cô Nguyễn Thị Lan',
  goals:
    'Mục tiêu: học sinh vẽ được sơ đồ tư duy về mùa xuân và viết 5 câu về gia đình. Nộp bài bằng nút + ở góc phải, nhớ ghi họ tên và tổ.',
  shareToken: 'k7p2x9lq4m',
  linkMode: 'guest_post',
  lessons: classLessons,
  pinned: [
    { id: 'p1', kind: 'pdf', title: 'Phiếu bài tập tuần 20', description: 'Đề bài và gợi ý cách làm sơ đồ.', url: '#', sizeLabel: '1,2 MB' },
    { id: 'p2', kind: 'slide', title: 'Slide bài giảng: Mùa xuân', description: '12 trang, có hình minh họa.', url: '#', sizeLabel: '12 trang', lessonId: 'bh1' },
    { id: 'p3', kind: 'video', title: 'Video hướng dẫn vẽ sơ đồ tư duy', description: 'Xem trước khi làm, dài 4 phút.', url: '#', sizeLabel: '4:12', lessonId: 'bh1' },
    { id: 'p4', kind: 'sample', title: 'Bài mẫu của cô', description: 'Sơ đồ tư duy mẫu để các em tham khảo.', url: '#', sizeLabel: 'Ảnh', lessonId: 'bh1' },
    { id: 'p5', kind: 'link', title: 'Bài đọc: Gia đình em', description: 'Đọc trước khi viết 5 câu.', url: 'https://example.com/gia-dinh', lessonId: 'bh2' },
  ],
  tasks: classTasks,
  sessions: classSessions,
  // Không tạo sẵn danh sách học sinh: tên chỉ xuất hiện khi học sinh nộp bài (giáo viên có thể nhập danh sách lớp nếu muốn theo dõi ai chưa nộp).
  roster: [],
  cards: classCards,
  settings: { ...DEFAULT_SETTINGS, icon: 'book' },
  ownerEmail: 'co.lan.tieuhoc@gmail.com',
  collaborators: [
    { email: 'to.truong.chuyenmon@gmail.com', role: 'editor' },
    { email: 'baocaovien.taphuan@gmail.com', role: 'viewer' },
  ],
};

/* ===================== BẢNG 2: TẬP HUẤN GIÁO VIÊN ===================== */

const trainRoster: RosterMember[] = [
  ['Nguyễn Thị Hằng', 'TH Kim Đồng'], ['Trần Văn Hải', 'TH Kim Đồng'], ['Lê Thị Mai', 'TH Kim Đồng'],
  ['Phạm Thu Trang', 'TH Lê Quý Đôn'], ['Hoàng Văn Nam', 'TH Lê Quý Đôn'], ['Vũ Thị Hoa', 'TH Lê Quý Đôn'],
  ['Đặng Minh Tuấn', 'TH Nguyễn Du'], ['Bùi Thị Lệ', 'TH Nguyễn Du'], ['Ngô Thanh Sơn', 'TH Nguyễn Du'],
  ['Phan Thị Yến', 'TH Trần Phú'], ['Đỗ Quốc Việt', 'TH Trần Phú'], ['Lý Thị Hương', 'TH Trần Phú'],
  ['Trịnh Văn Long', 'THCS Chu Văn An'], ['Dương Thị Nga', 'THCS Chu Văn An'], ['Võ Hồng Phúc', 'THCS Chu Văn An'],
  ['Mai Thị Thanh', 'THCS Chu Văn An'], ['Cao Văn Thắng', 'THCS Lý Tự Trọng'], ['Tạ Thị Kim', 'THCS Lý Tự Trọng'],
  ['Hồ Văn Đạt', 'THCS Lý Tự Trọng'], ['Lương Thị Dung', 'THCS Lý Tự Trọng'],
].map(([name, unit], i) => ({
  id: `gv-${i + 1}`,
  name,
  unit,
  startedWorking: i === 8 || i === 15,
}));

const trainSessions: SessionSlot[] = [
  { id: 'th-b1', label: 'Buổi 1 · 3 ngày trước', fromIso: ago(4 * 24 * 60), toIso: ago(2.5 * 24 * 60) },
  { id: 'th-b2', label: 'Buổi 2 · hôm qua', fromIso: ago(2 * 24 * 60), toIso: ago(20 * 60) },
  { id: 'th-b3', label: 'Buổi 3 · hôm nay', fromIso: ago(20 * 60), toIso: ago(-60) },
];

const trainCards = buildCards('tap-huan', trainRoster, [
  { member: 0, title: 'Kế hoạch bài dạy: Phân số', task: 'tnv1', body: 'Kế hoạch bài dạy 2 tiết có hoạt động nhóm.', att: file('kh-phan-so.docx'), status: 'featured', minutesAgo: 40, note: 'Hoạt động khởi động hay, có thể nhân rộng.' },
  { member: 1, title: 'Kế hoạch bài dạy: Hình chữ nhật', task: 'tnv1', body: 'Ứng dụng phần mềm GeoGebra.', att: file('kh-hcn.docx'), status: 'approved', minutesAgo: 90 },
  { member: 2, title: 'Đề kiểm tra giữa kỳ Toán 4', task: 'tnv2', body: 'Ma trận đề và đáp án chi tiết.', att: file('de-kt.pdf'), status: 'pending', minutesAgo: 12 },
  { member: 3, title: 'Kế hoạch bài dạy: Truyện cổ tích', task: 'tnv1', body: 'Tích hợp đọc diễn cảm.', att: link('Slide bài dạy', 'https://example.com/trang'), status: 'approved', minutesAgo: 240 },
  { member: 4, title: 'Đề kiểm tra giữa kỳ KHTN 5', task: 'tnv2', body: 'Đề 3 mức độ.', att: file('de-khtn.docx'), status: 'needs_edit', minutesAgo: 600, note: 'Bổ sung bảng ma trận theo mẫu.' },
  { member: 6, title: 'Kế hoạch bài dạy: Vật chất và năng lượng', task: 'tnv1', body: 'Thí nghiệm đơn giản.', att: img('thi-nghiem.jpg', 170), status: 'approved', minutesAgo: 1600 },
  { member: 7, title: 'Đề kiểm tra giữa kỳ Tiếng Việt 3', task: 'tnv2', body: 'Có phần đọc hiểu mở rộng.', att: file('de-tv3.pdf'), status: 'approved', minutesAgo: 1450 },
  { member: 9, title: 'Kế hoạch bài dạy: Chu vi và diện tích', task: 'tnv1', body: 'Dạy học dự án mini.', att: file('kh-chu-vi.docx'), status: 'pending', minutesAgo: 22 },
  { member: 10, title: 'Đề kiểm tra giữa kỳ Toán 5', task: 'tnv2', body: 'Đề có 2 phiên bản.', att: file('de-toan5.pdf'), status: 'approved', minutesAgo: 3000 },
  { member: 12, title: 'Kế hoạch bài dạy: Văn bản nghị luận', task: 'tnv1', body: 'Phiếu học tập 3 bước.', att: file('kh-nghi-luan.docx'), status: 'featured', minutesAgo: 130, note: 'Phiếu học tập rõ ràng, sát năng lực.' },
  { member: 13, title: 'Đề kiểm tra giữa kỳ Ngữ văn 7', task: 'tnv2', body: 'Có rubric chấm bài viết.', att: file('de-van7.pdf'), status: 'approved', minutesAgo: 2400 },
  { member: 14, title: 'Kế hoạch bài dạy: Định lý Pythagore', task: 'tnv1', body: 'Dùng mô hình giấy.', att: img('pythagore.jpg', 240), status: 'pending', minutesAgo: 5 },
  { member: 16, title: 'Đề kiểm tra giữa kỳ Lịch sử 8', task: 'tnv2', body: 'Đề kết hợp bản đồ.', att: file('de-su8.docx'), status: 'approved', minutesAgo: 4400 },
  { member: 17, title: 'Kế hoạch bài dạy: Hệ mặt trời', task: 'tnv1', body: 'Mô phỏng 3D.', att: link('Mô phỏng', 'https://example.com/kim'), status: 'approved', minutesAgo: 700 },
  { member: 18, title: 'Đề kiểm tra giữa kỳ Địa lý 9', task: 'tnv2', body: 'Bản nháp.', att: file('de-dia9.docx'), status: 'needs_edit', minutesAgo: 60, note: 'Thiếu đáp án phần tự luận.' },
]);

const TRAIN_PROGRAM = 'Bồi dưỡng thường xuyên 2025–2026';

/** Mỗi buổi tập huấn là một "bài học" có thời gian; yêu cầu của buổi có hạn nộp riêng. */
const trainLessons: Lesson[] = [
  { id: 'tb1', title: 'Buổi 1 · Thiết kế kế hoạch bài dạy', description: 'Báo cáo viên hướng dẫn khung kế hoạch bài dạy, thực hành theo nhóm.', startsAt: ago(4 * 24 * 60), endsAt: ago(4 * 24 * 60 - 180) },
  { id: 'tb2', title: 'Buổi 2 · Xây dựng đề kiểm tra', description: 'Ma trận, đặc tả và viết đề giữa kỳ.', startsAt: ago(2 * 24 * 60), endsAt: ago(2 * 24 * 60 - 180) },
  { id: 'tb3', title: 'Buổi 3 · Báo cáo và đánh giá', description: 'Trình bày sản phẩm, góp ý chéo.', startsAt: ago(-2 * 24 * 60), endsAt: ago(-2 * 24 * 60 + 180) },
];

const trainTasks: TaskItem[] = [
  { id: 'tnv1', label: 'NV1 · Kế hoạch bài dạy', lessonId: 'tb1', kind: 'assignment', instructions: 'Nộp 01 kế hoạch bài dạy (Word hoặc PDF) theo khung đã hướng dẫn.', assignedAt: ago(4 * 24 * 60), dueAt: ago(10 * 60), allowLate: true, targetUnits: [] },
  { id: 'tnv2', label: 'NV2 · Đề kiểm tra giữa kỳ', lessonId: 'tb2', kind: 'assignment', instructions: 'Nộp đề kiểm tra giữa kỳ kèm ma trận và đáp án.', assignedAt: ago(2 * 24 * 60), dueAt: ago(-30 * 60), allowLate: false, targetUnits: [] },
  { id: 'tnv3', label: 'Yêu cầu · Phiếu phản hồi cuối buổi', lessonId: 'tb3', kind: 'requirement', instructions: 'Hoàn thành phiếu phản hồi và gửi bản trình bày 5 phút.', assignedAt: ago(-2 * 24 * 60), dueAt: ago(-3 * 24 * 60), allowLate: false, targetUnits: [] },
];

export const TRAIN_BOARD: BoardData = {
  id: 'tap-huan',
  mode: 'training',
  title: 'Tập huấn: Thiết kế kế hoạch bài dạy & đề kiểm tra',
  subtitle: 'Phòng GD&ĐT · Báo cáo viên: Thầy Trần Minh Quân',
  goals:
    'Mục tiêu: mỗi giáo viên nộp 1 kế hoạch bài dạy và 1 đề kiểm tra giữa kỳ. Ghi rõ họ tên và trường/đơn vị khi nộp. Bài tiêu biểu sẽ được trình chiếu cuối buổi.',
  shareToken: 'th83ndh2ab',
  linkMode: 'guest_post',
  program: TRAIN_PROGRAM,
  lessons: trainLessons,
  pinned: [
    { id: 't1', kind: 'pdf', title: 'Hướng dẫn thiết kế kế hoạch bài dạy', description: 'Khung kế hoạch bài dạy theo công văn hiện hành.', url: '#', sizeLabel: '2,4 MB' },
    { id: 't2', kind: 'slide', title: 'Slide tập huấn buổi 1', description: 'Nội dung báo cáo của báo cáo viên.', url: '#', sizeLabel: '36 trang', lessonId: 'tb1' },
    { id: 't3', kind: 'link', title: 'Thư viện đề kiểm tra mẫu', description: 'Tham khảo ma trận và đặc tả đề.', url: '#', sizeLabel: 'Trực tuyến', lessonId: 'tb2' },
    { id: 't4', kind: 'sample', title: 'Kế hoạch bài dạy mẫu', description: 'Bài mẫu đã được thẩm định.', url: '#', sizeLabel: 'Word', lessonId: 'tb1' },
  ],
  tasks: trainTasks,
  sessions: trainSessions,
  roster: [],
  cards: trainCards,
  settings: { ...DEFAULT_SETTINGS, icon: 'cap' },
  ownerEmail: 'co.lan.tieuhoc@gmail.com',
  collaborators: [],
};

/** Nhân bản một bảng mẫu để dựng các bảng do giáo viên khác sở hữu (dùng thử chia sẻ). */
function cloneBoard(src: BoardData, id: string, patch: Partial<BoardData>, nCards: number): BoardData {
  return {
    ...src,
    id,
    shareToken: `${id.replace(/[^a-z0-9]/g, '')}x9`.slice(0, 10),
    cards: src.cards.slice(0, nCards).map((c) => ({ ...c, id: `${id}-${c.id}`, boardId: id })),
    roster: src.roster.map((m) => ({ ...m, id: `${id}-${m.id}` })),
    pinned: src.pinned.map((r) => ({ ...r, id: `${id}-${r.id}` })),
    ...patch,
  };
}

/** Bảng của cô Hoài Thu, chia sẻ cho cô Lan làm đồng quản lý. */
const SHARED_EDITOR_BOARD = cloneBoard(CLASS_BOARD, 'lop-5b', {
  title: 'Lớp 5B – Khoa học tuần 12',
  subtitle: 'Trường Tiểu học Hòa Bình · Cô Lê Hoài Thu',
  ownerEmail: 'to.truong.chuyenmon@gmail.com',
  collaborators: [{ email: 'co.lan.tieuhoc@gmail.com', role: 'editor' }],
  settings: { ...DEFAULT_SETTINGS, icon: 'flask', background: 'mint' },
}, 8);

/** Bảng tập huấn của thầy Quân: cô Lan chỉ xem, cô Thu đồng quản lý. */
const SHARED_VIEWER_BOARD = cloneBoard(TRAIN_BOARD, 'th-tin-hoc', {
  title: 'Tập huấn Tin học: AI trong dạy học',
  subtitle: 'Báo cáo viên: Thầy Trần Minh Quân',
  ownerEmail: 'baocaovien.taphuan@gmail.com',
  collaborators: [
    { email: 'co.lan.tieuhoc@gmail.com', role: 'viewer' },
    { email: 'to.truong.chuyenmon@gmail.com', role: 'editor' },
  ],
}, 12);

/** Lớp tập huấn thứ hai cùng chương trình: có tài liệu và yêu cầu riêng. */
const TRAIN_AI_BOARD = cloneBoard(TRAIN_BOARD, 'th-ai', {
  title: 'Tập huấn: Ứng dụng AI trong dạy học',
  subtitle: 'Phòng GD&ĐT · Báo cáo viên: Thầy Trần Minh Quân',
  goals: 'Mục tiêu: giáo viên biết dùng công cụ AI an toàn để soạn bài và thiết kế hoạt động, nộp sản phẩm theo từng buổi.',
  lessons: [{ id: 'ai1', title: 'Buổi 1 · Làm quen công cụ AI', description: 'Nguyên tắc dùng AI an toàn trong nhà trường.', startsAt: ago(-24 * 60), endsAt: ago(-24 * 60 + 150) }],
  tasks: [{ id: 'ainv1', label: 'Yêu cầu · Prompt soạn bài của thầy cô', lessonId: 'ai1', kind: 'requirement', instructions: 'Nộp 01 câu lệnh (prompt) và kết quả chỉnh sửa.', assignedAt: ago(-24 * 60), dueAt: ago(-4 * 24 * 60), allowLate: false, targetUnits: [] }],
  pinned: [{ id: 'ai-t1', kind: 'pdf', title: 'Khung năng lực số của giáo viên', description: 'Tài liệu đọc trước buổi 1.', url: '#', sizeLabel: '1,1 MB', lessonId: 'ai1' }],
  cards: [],
}, 0);

export const MOCK_BOARDS: BoardData[] = [CLASS_BOARD, TRAIN_BOARD, TRAIN_AI_BOARD, SHARED_EDITOR_BOARD, SHARED_VIEWER_BOARD];
export const ONE_DAY_MS = DAY;
