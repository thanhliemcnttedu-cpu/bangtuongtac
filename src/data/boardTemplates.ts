import type { BoardMode, BoardSettings } from '../types/board';
import { DEFAULT_SETTINGS } from '../lib/boardSettings';

export interface BoardTemplate {
  id: string;
  name: string;
  description: string;
  mode: BoardMode;
  goals: string;
  tasks: string[];
  settings: BoardSettings;
}

/** Mẫu bảng dùng khi bấm "Tạo bảng": chọn một mẫu là có sẵn nhiệm vụ, lời dẫn và kiểu hiển thị phù hợp. */
export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    id: 'lop-hoc', name: 'Lớp học trống', description: 'Học sinh nộp bài theo tổ, giáo viên duyệt và chấm.',
    mode: 'classroom', goals: '', tasks: ['Nhiệm vụ 1', 'Nhiệm vụ 2'],
    settings: { ...DEFAULT_SETTINGS, icon: 'book' },
  },
  {
    id: 'tap-huan', name: 'Tập huấn giáo viên', description: 'Giáo viên nộp sản phẩm theo trường / đơn vị, xuất báo cáo.',
    mode: 'training', goals: '', tasks: ['Nhiệm vụ 1', 'Nhiệm vụ 2'],
    settings: { ...DEFAULT_SETTINGS, icon: 'cap', defaultView: 'table', sortBy: 'unit' },
  },
  {
    id: 'phieu-cuoi-gio', name: 'Phiếu cuối giờ', description: 'Mỗi em ghi điều học được và điều còn thắc mắc.',
    mode: 'classroom', goals: 'Cuối giờ, mỗi em viết 1–2 câu: hôm nay em học được gì, em còn thắc mắc gì.',
    tasks: ['Hôm nay em học được gì?', 'Em còn thắc mắc gì?'],
    settings: { ...DEFAULT_SETTINGS, icon: 'idea', defaultView: 'wall', background: 'sunset', font: 'hand' },
  },
  {
    id: 'thao-luan', name: 'Thảo luận nhóm', description: 'Chia cột theo nhiệm vụ để mỗi nhóm một cột.',
    mode: 'classroom', goals: 'Mỗi nhóm thảo luận và đăng ý kiến vào cột của nhóm mình.',
    tasks: ['Nhóm 1', 'Nhóm 2', 'Nhóm 3', 'Nhóm 4'],
    settings: { ...DEFAULT_SETTINGS, icon: 'globe', defaultView: 'columns', background: 'mint' },
  },
  {
    id: 'trung-bay', name: 'Triển lãm sản phẩm', description: 'Trưng bày ảnh, bài vẽ như một bức tường để trình chiếu.',
    mode: 'classroom', goals: 'Đăng ảnh sản phẩm của em, cả lớp cùng xem và nhận xét.',
    tasks: ['Sản phẩm của em'],
    settings: { ...DEFAULT_SETTINGS, icon: 'palette', defaultView: 'wall', background: 'lavender', cardSize: 'wide', sortBy: 'newest' },
  },
  {
    id: 'dong-thoi-gian', name: 'Dòng thời gian', description: 'Bài xếp theo ngày: nhật ký dự án, tiến trình thí nghiệm.',
    mode: 'classroom', goals: 'Mỗi lần có tiến triển, em đăng một bài; các bài tự xếp theo ngày.',
    tasks: ['Nhật ký của em'],
    settings: { ...DEFAULT_SETTINGS, icon: 'flask', defaultView: 'timeline', background: 'mint', sortBy: 'oldest' },
  },
  {
    id: 'ban-do', name: 'Bản đồ lớp học', description: 'Học sinh ghim bài vào nơi mình nói đến: địa danh, di tích, quê hương.',
    mode: 'classroom', goals: 'Khi nộp bài, bấm “Vị trí” và chọn nơi em muốn giới thiệu trên bản đồ.',
    tasks: ['Nơi em muốn giới thiệu'],
    settings: { ...DEFAULT_SETTINGS, icon: 'globe', defaultView: 'map' },
  },
  {
    id: 'venn', name: 'So sánh bằng Venn', description: 'Giáo viên xếp ý kiến vào vòng A, vòng B hoặc phần giao nhau.',
    mode: 'classroom', goals: 'Mỗi em nêu một đặc điểm; cô sẽ cùng cả lớp xếp vào đúng vòng.',
    tasks: ['Đặc điểm em tìm được'],
    settings: { ...DEFAULT_SETTINGS, icon: 'idea', defaultView: 'venn', background: 'lavender', vennLabels: ['Thành thị', 'Nông thôn'] },
  },
  {
    id: 'so-do', name: 'Sơ đồ ý tưởng', description: 'Các ý tưởng tỏa nhánh theo nhiệm vụ như sơ đồ tư duy.',
    mode: 'classroom', goals: 'Mỗi nhóm đăng ý của mình vào nhánh nhiệm vụ tương ứng.',
    tasks: ['Nguyên nhân', 'Hậu quả', 'Giải pháp'],
    settings: { ...DEFAULT_SETTINGS, icon: 'idea', defaultView: 'mindmap', background: 'paper' },
  },
];
