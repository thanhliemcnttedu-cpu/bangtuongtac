import type { Attachment } from '../types/board';

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
/** 50 MB: mức tối đa của gói Supabase miễn phí. Gói trả phí tăng được (đổi cả hằng số này, kho tệp và cài đặt Storage). */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
/** Tổng dung lượng các đính kèm của MỘT bài (tối đa 10 tệp). */
export const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

/** Loại MIME kho tệp chấp nhận (khớp allowed_mime_types trong schema.sql). */
export const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/avif',
  'video/webm', 'video/mp4', 'video/quicktime',
  'audio/webm', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv',
];

/** Tệp nén (zip, rar, 7z): chỉ giáo viên được đính kèm vào tài liệu; học sinh không nộp được để tránh tệp lạ. */
export const ARCHIVE_MIME = ['application/zip', 'application/vnd.rar', 'application/x-7z-compressed'];

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain', csv: 'text/csv',
  zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif',
};

/** Các trình duyệt/hệ điều hành đặt tên MIME khác nhau cho cùng một định dạng: đưa về một tên chuẩn. */
const MIME_ALIAS: Record<string, string> = {
  'audio/x-m4a': 'audio/mp4', 'audio/m4a': 'audio/mp4', 'audio/mp3': 'audio/mpeg', 'audio/x-mpeg': 'audio/mpeg',
  'audio/x-wav': 'audio/wav', 'audio/wave': 'audio/wav', 'video/x-m4v': 'video/mp4', 'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg',
  'application/x-zip-compressed': 'application/zip', 'application/x-rar-compressed': 'application/vnd.rar', 'application/x-rar': 'application/vnd.rar',
  'application/x-pdf': 'application/pdf', 'text/x-csv': 'text/csv', 'application/csv': 'text/csv',
};

/** Loại tệp chuẩn hóa. Trình duyệt không báo loại (hoặc báo octet-stream) thì suy ra từ đuôi tên tệp. */
export function baseMime(file: File): string {
  const declared = file.type.split(';')[0].trim().toLowerCase();
  if (declared && declared !== 'application/octet-stream') return MIME_ALIAS[declared] ?? declared;
  const ext = file.name.match(/\.([A-Za-z0-9]+)$/)?.[1]?.toLowerCase();
  return (ext && EXT_MIME[ext]) || declared;
}

/** Phần mở rộng cho thuộc tính accept của ô chọn tệp (một số máy không gán MIME cho .docx, .m4a…). */
export const ACCEPT_ATTR = [...ALLOWED_MIME, ...Object.keys(EXT_MIME).filter((e) => !['zip', 'rar', '7z'].includes(e)).map((e) => `.${e}`)].join(',');
/** Danh sách cho giáo viên: thêm tệp nén. */
export const ACCEPT_ATTR_TEACHER = [...ALLOWED_MIME, ...ARCHIVE_MIME, ...Object.keys(EXT_MIME).map((e) => `.${e}`)].join(',');

export type DocKind = 'pdf' | 'word' | 'excel' | 'powerpoint' | 'text' | 'csv' | 'archive' | 'other';

export const DOC_LABEL: Record<DocKind, string> = {
  pdf: 'PDF', word: 'Word', excel: 'Excel', powerpoint: 'PowerPoint', text: 'Văn bản', csv: 'CSV', archive: 'Tệp nén', other: 'Tệp',
};
/** Màu nhận diện theo loại tệp (giống thói quen: PDF đỏ, Word xanh dương, Excel xanh lá, PowerPoint cam). */
export const DOC_HUE: Record<DocKind, number> = { pdf: 355, word: 215, excel: 145, powerpoint: 22, text: 200, csv: 160, archive: 30, other: 210 };

/** Phân loại tài liệu theo MIME hoặc đuôi tên tệp. Dùng cho thẻ, trình xem và danh sách đính kèm. */
export function docKindOf(a: { mime?: string; name: string }): DocKind {
  const mime = (a.mime ?? '').toLowerCase();
  const ext = a.name.match(/\.([A-Za-z0-9]+)$/)?.[1]?.toLowerCase() ?? '';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.includes('wordprocessingml') || mime === 'application/msword' || ext === 'doc' || ext === 'docx') return 'word';
  if (mime.includes('spreadsheetml') || mime === 'application/vnd.ms-excel' || ext === 'xls' || ext === 'xlsx') return 'excel';
  if (mime.includes('presentationml') || mime === 'application/vnd.ms-powerpoint' || ext === 'ppt' || ext === 'pptx') return 'powerpoint';
  if (mime === 'text/csv' || ext === 'csv') return 'csv';
  if (mime === 'text/plain' || ext === 'txt') return 'text';
  if (ARCHIVE_MIME.includes(mime) || ['zip', 'rar', '7z'].includes(ext)) return 'archive';
  return 'other';
}

/** Trả về thông báo lỗi tiếng Việt, hoặc null nếu tệp hợp lệ. */
export function validateFile(file: File, allowArchive = false, maxBytes?: number): string | null {
  const mime = baseMime(file);
  if (!ALLOWED_MIME.includes(mime) && !(allowArchive && ARCHIVE_MIME.includes(mime))) return `Loại tệp "${mime || 'không rõ'}" chưa được hỗ trợ. Dùng ảnh, video, âm thanh, PDF, Word, Excel, PowerPoint hoặc văn bản.`;
  const limit = maxBytes ?? (mime.startsWith('image/') ? MAX_IMAGE_BYTES : MAX_FILE_BYTES);
  if (file.size > limit) return `Tệp ${formatSize(file.size)} vượt giới hạn ${formatSize(limit)}. Tệp lớn hơn: kết nối cổng Google Drive (Thêm → Lưu lên Google Drive của tôi) để nhận tệp tới 1 GB, hoặc tải lên Drive / YouTube rồi dán liên kết vào ô “Liên kết”.`;
  return null;
}

export function attachmentTypeOf(file: File): Attachment['type'] {
  const mime = baseMime(file);
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

/** Thu nhỏ ảnh về tối đa 1600px, JPEG 82%: ảnh điện thoại 5–8 MB còn khoảng 300–500 KB, tiết kiệm dung lượng kho. */
export async function compressImage(file: File, maxSide = 1600, quality = 0.82): Promise<File> {
  const mime = baseMime(file);
  if (!mime.startsWith('image/') || mime === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#ffffff'; // ảnh PNG trong suốt không bị nền đen khi sang JPEG
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file; // trình duyệt không giải mã được: gửi nguyên bản
  }
}

export function extensionOf(file: File): string {
  const fromName = file.name.match(/\.([A-Za-z0-9]{1,8})$/)?.[1];
  if (fromName) return fromName.toLowerCase();
  const mime = baseMime(file).split('/')[1] ?? 'bin';
  return mime.replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
}

/** Đổi lỗi getUserMedia / getDisplayMedia thành câu tiếng Việt dễ hiểu cho giáo viên và học sinh. */
export function describeMediaError(e: unknown, device: string): string {
  const name = e instanceof DOMException ? e.name : e instanceof Error ? e.message : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return `Bạn chưa cho phép trình duyệt dùng ${device}. Bấm biểu tượng ổ khóa cạnh thanh địa chỉ, chọn Cho phép rồi thử lại.`;
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return `Không tìm thấy ${device} trên thiết bị này.`;
  if (name === 'NotReadableError' || name === 'TrackStartError') return `${device[0].toUpperCase()}${device.slice(1)} đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó rồi thử lại.`;
  if (name === 'SecurityError' || name === 'insecure') return `Trình duyệt chỉ cho dùng ${device} trên trang https hoặc localhost.`;
  if (name === 'AbortError') return `Đã hủy chọn ${device}.`;
  return `Không dùng được ${device}: ${e instanceof Error ? e.message : 'lỗi không rõ'}.`;
}

/** Chọn định dạng ghi mà trình duyệt hỗ trợ (Chrome/Edge/Firefox: webm; Safari: mp4). */
export function pickRecorderMime(candidates: string[]): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return candidates.find((m) => MediaRecorder.isTypeSupported(m));
}
