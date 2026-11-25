import { supabase } from './supabase';
import type { Attachment } from '../types/board';
import { buildXlsx } from './xlsxWrite';

/**
 * Hồ sơ chuyên môn của giáo viên: kế hoạch, giáo án, biên bản, báo cáo, minh chứng… mỗi hồ sơ có nhóm, năm học, thẻ và nhiều tệp / liên kết.
 * Dữ liệu thật ở bảng profile_docs (Supabase); chưa cấu hình Supabase (bản mẫu) thì giữ trong bộ nhớ trang để thử giao diện.
 */
export const PROFILE_CATEGORIES: { id: string; label: string }[] = [
  { id: 'ke_hoach', label: 'Kế hoạch giáo dục' },
  { id: 'giao_an', label: 'Giáo án, bài giảng' },
  { id: 'bien_ban', label: 'Biên bản, sổ sách' },
  { id: 'bao_cao', label: 'Báo cáo' },
  { id: 'minh_chung', label: 'Minh chứng, thi đua' },
  { id: 'boi_duong', label: 'Tập huấn, bồi dưỡng' },
  { id: 'skkn', label: 'Sáng kiến kinh nghiệm' },
  { id: 'van_ban', label: 'Công văn, văn bản' },
  { id: 'khac', label: 'Khác' },
];
export const categoryLabel = (id: string): string => PROFILE_CATEGORIES.find((c) => c.id === id)?.label ?? 'Khác';

export interface ProfileDoc {
  id: string;
  boardId: string;
  title: string;
  category: string;
  schoolYear: string;
  /** Ngày của tài liệu, dạng YYYY-MM-DD ('' nếu chưa ghi). */
  docDate: string;
  tags: string[];
  description: string;
  attachments: Attachment[];
}
export type ProfileDocData = Omit<ProfileDoc, 'id' | 'boardId'>;

interface Db { id: string; board_id: string; title: string; category: string; school_year: string | null; doc_date: string | null; tags: string[] | null; description: string | null; attachments: Attachment[] | null }
const toDoc = (r: Db): ProfileDoc => ({ id: r.id, boardId: r.board_id, title: r.title, category: r.category, schoolYear: r.school_year ?? '', docDate: r.doc_date ?? '', tags: r.tags ?? [], description: r.description ?? '', attachments: r.attachments ?? [] });
const toRow = (d: ProfileDocData) => ({ title: d.title, category: d.category, school_year: d.schoolYear, doc_date: d.docDate || null, tags: d.tags, description: d.description, attachments: d.attachments, updated_at: new Date().toISOString() });

const fail = (action: string, message: string): never => {
  throw new Error(/profile_docs|schema cache|does not exist/i.test(message)
    ? `${action}: máy chủ chưa có bảng hồ sơ. Hãy chạy tệp docs/cap-nhat-ho-so.sql trong Supabase (SQL Editor) rồi thử lại.`
    : `${action}: ${message}`);
};
const db = () => { if (!supabase) throw new Error('Chưa cấu hình Supabase.'); return supabase; };
const mem: ProfileDoc[] = [];

export async function listProfileDocs(boardId: string): Promise<ProfileDoc[]> {
  if (!supabase) return mem.filter((d) => d.boardId === boardId);
  const { data, error } = await db().from('profile_docs').select('*').eq('board_id', boardId).order('doc_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
  if (error) fail('Không tải được hồ sơ', error.message);
  return ((data ?? []) as Db[]).map(toDoc);
}

export async function saveProfileDoc(boardId: string, id: string | null, data: ProfileDocData): Promise<ProfileDoc> {
  if (!supabase) {
    const doc: ProfileDoc = { id: id ?? `pd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, boardId, ...data };
    const i = mem.findIndex((d) => d.id === doc.id);
    if (i >= 0) mem[i] = doc; else mem.unshift(doc);
    return doc;
  }
  const q = id ? db().from('profile_docs').update(toRow(data)).eq('id', id) : db().from('profile_docs').insert({ ...toRow(data), board_id: boardId });
  const { data: row, error } = await q.select('*').single();
  if (error) fail('Không lưu được hồ sơ', error.message);
  return toDoc(row as Db);
}

export async function deleteProfileDoc(id: string): Promise<void> {
  if (!supabase) { const i = mem.findIndex((d) => d.id === id); if (i >= 0) mem.splice(i, 1); return; }
  const { error } = await db().from('profile_docs').delete().eq('id', id);
  if (error) fail('Không xóa được hồ sơ', error.message);
}

/** Danh mục hồ sơ ra Excel: để nộp mục lục minh chứng hoặc lưu bản sao. */
export function exportProfileCatalog(docs: ProfileDoc[]): Blob {
  const rows: (string | number)[][] = [['STT', 'Tên hồ sơ', 'Nhóm', 'Năm học', 'Ngày', 'Thẻ', 'Mô tả', 'Số tệp', 'Liên kết, tệp']];
  docs.forEach((d, i) => rows.push([i + 1, d.title, categoryLabel(d.category), d.schoolYear, d.docDate, d.tags.join(', '), d.description, d.attachments.length, d.attachments.map((a) => a.url ?? '').filter(Boolean).join('\n')]));
  return buildXlsx([{ name: 'Mục lục hồ sơ', rows, widths: [6, 38, 22, 12, 12, 22, 40, 8, 50] }]);
}
