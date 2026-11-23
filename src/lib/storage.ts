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
