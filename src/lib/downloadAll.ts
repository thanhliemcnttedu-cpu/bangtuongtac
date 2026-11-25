import type { Attachment } from '../types/board';
import { buildZip } from './zip';
import type { ZipEntry } from './zip';

/** Tệp tải gộp được: có địa chỉ, không phải liên kết / nội dung nhúng; tệp đã chuyển sang Google Drive thì trình duyệt không đọc trực tiếp được. */
export const zippable = (a: Attachment): boolean => !!a.url && a.type !== 'link' && a.type !== 'embed' && a.type !== 'text' && !a.driveId;

/** Gói mọi tệp của một bài vào một tệp ZIP rồi tải về. Trả về số tệp đã gói; tệp tải lỗi được báo trong thông điệp lỗi. */
export async function downloadAllAsZip(list: Attachment[], zipName: string): Promise<number> {
  const files = list.filter(zippable);
  const used = new Set<string>();
  const failed: string[] = [];
  const entries: ZipEntry[] = [];
  for (const a of files) {
    try {
      const res = await fetch(a.url as string);
      if (!res.ok) throw new Error(String(res.status));
      let name = (a.name || 'tep').replace(/[\\/:*?"<>|]+/g, '_');
      for (let i = 2; used.has(name.toLowerCase()); i += 1) name = (a.name || 'tep').replace(/(\.[^.]*)?$/, (ext) => ` (${i})${ext}`);
      used.add(name.toLowerCase());
      entries.push({ name, data: new Uint8Array(await res.arrayBuffer()) });
    } catch { failed.push(a.name); }
  }
  if (entries.length === 0) throw new Error('Không tải được tệp nào. Hãy thử tải từng tệp.');
  const url = URL.createObjectURL(buildZip(entries));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${zipName.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || 'bai-nop'}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  if (failed.length > 0) throw new Error(`Đã tải ${entries.length} tệp; chưa tải được: ${failed.join(', ')}.`);
  return entries.length;
}
