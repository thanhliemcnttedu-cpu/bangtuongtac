import { supabase } from './supabase';
import { baseMime, extensionOf } from './media';

const BUCKET = 'board-files';

export interface UploadedFile {
  url: string;
  path: string;
}

/**
 * Tải tệp lên kho Supabase Storage vào thư mục của bảng: <board_id>/<uuid>.<đuôi>.
 * Tên tệp do trình duyệt sinh ngẫu nhiên nên địa chỉ không đoán được; chính sách kho trong schema.sql
 * chỉ cho phép ghi vào thư mục của bảng đang nhận bài (hoặc của chủ bảng).
 */
export async function uploadAttachment(boardId: string, file: File): Promise<UploadedFile> {
  if (!supabase) throw new Error('Chưa cấu hình Supabase (.env).');
  const path = `${boardId}/${crypto.randomUUID()}.${extensionOf(file)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: baseMime(file), upsert: false });
  if (error) throw new Error(`Không tải được tệp lên: ${error.message}`);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

const PUBLIC_PREFIX = `/storage/v1/object/public/${BUCKET}/`;

/** Đường dẫn trong kho của một địa chỉ công khai; không phải tệp của kho này thì trả về null. */
export function storagePathOf(url: string | undefined): string | null {
  if (!url) return null;
  const i = url.indexOf(PUBLIC_PREFIX);
  if (i < 0) return null;
  return decodeURIComponent(url.slice(i + PUBLIC_PREFIX.length).split('?')[0]);
}

/**
 * Xóa tệp khỏi kho Supabase theo địa chỉ (chỉ chủ bảng / đồng quản lý xóa được nhờ chính sách của kho).
 * Địa chỉ không thuộc kho (liên kết ngoài, địa chỉ tạm của chế độ mẫu, tệp trên Drive) thì bỏ qua.
 */
export async function removeStoredFiles(urls: Array<string | undefined>): Promise<number> {
  if (!supabase) return 0;
  const paths = urls.map(storagePathOf).filter((p): p is string => !!p);
  if (paths.length === 0) return 0;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) throw new Error(`Không xóa được tệp khỏi kho: ${error.message}`);
  return paths.length;
}
