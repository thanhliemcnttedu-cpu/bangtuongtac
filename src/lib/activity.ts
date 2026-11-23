import { PROGRESS_LABEL } from './format';
import type { MemberProgress } from '../types/board';

export const ACTIVITY_LABEL: Record<string, string> = {
  nop_bai: 'Nộp bài',
  doi_trang_thai: 'Đổi trạng thái',
  cham_diem: 'Chấm điểm',
  xoa_bai: 'Xóa bài',
  xoa_het: 'Xóa toàn bộ bài',
  cai_dat: 'Đổi cài đặt',
  dong_bang: 'Đóng bảng',
  mo_bang: 'Mở lại bảng',
  nhan_ban: 'Nhân bản bảng',
  thung_rac: 'Chuyển vào thùng rác',
  khoi_phuc: 'Khôi phục bảng',
  danh_dau_mau: 'Đánh dấu mẫu',
  ghim_tai_lieu: 'Ghim tài liệu',

  sua_tai_lieu: 'Sửa tài liệu',
  go_tai_lieu: 'Gỡ tài liệu',
  tao_bai_hoc: 'Tạo bài học',
  sua_bai_hoc: 'Sửa bài học',
  xoa_bai_hoc: 'Xóa bài học',
  giao_bai_tap: 'Giao bài tập',
  sua_bai_tap: 'Sửa bài tập',
  xoa_bai_tap: 'Xóa bài tập',
  nhap_danh_sach: 'Nhập danh sách',
  chia_se: 'Chia sẻ với giáo viên',
  doi_quyen: 'Đổi quyền chia sẻ',
  go_chia_se: 'Gỡ quyền chia sẻ',
};

/** Đổi mã trạng thái trong chi tiết ("pending → approved") thành tiếng Việt. */
export function prettyDetail(detail: string): string {
  return detail.replace(/\b(pending|approved|featured|needs_edit)\b/g, (m) => PROGRESS_LABEL[m as MemberProgress]);
}
