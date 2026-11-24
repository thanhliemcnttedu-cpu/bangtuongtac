/**
 * Danh sách việc nhỏ (checklist) của một công việc, lưu ngay trong ô "ghi chú / hướng dẫn" sẵn có (không đổi cơ sở dữ liệu):
 * mỗi việc nhỏ là một dòng `- [ ] nội dung` hoặc `- [x] nội dung`; các dòng còn lại là ghi chú.
 */
export interface CheckItem { text: string; done: boolean }

const ITEM = /^\s*[-*]\s*\[([ xX])\]\s?(.*)$/;

/** Tách văn bản thành ghi chú và danh sách việc nhỏ. */
export function splitChecklist(src: string): { note: string; items: CheckItem[] } {
  const items: CheckItem[] = [];
  const note: string[] = [];
  for (const line of (src ?? '').replace(/\r\n/g, '\n').split('\n')) {
    const m = ITEM.exec(line);
    if (m) { if (m[2].trim()) items.push({ text: m[2].trim(), done: m[1] !== ' ' }); } else note.push(line);
  }
  return { note: note.join('\n').trim(), items };
}

/** Ghép lại: ghi chú trước, rồi các việc nhỏ. */
export function buildChecklist(note: string, items: CheckItem[]): string {
  return [note.trim(), ...items.filter((i) => i.text.trim()).map((i) => `- [${i.done ? 'x' : ' '}] ${i.text.trim()}`)].filter(Boolean).join('\n');
}

/** Đổi trạng thái xong / chưa của việc nhỏ thứ `index`. */
export function toggleChecklistItem(src: string, index: number): string {
  const { note, items } = splitChecklist(src);
  return buildChecklist(note, items.map((it, i) => (i === index ? { ...it, done: !it.done } : it)));
}

/** Kỳ mới của việc lặp: bỏ dấu đã xong của các việc nhỏ. */
export const resetChecklist = (src: string): string => (src ?? '').replace(/^(\s*[-*]\s*)\[[xX]\]/gm, '$1[ ]');
