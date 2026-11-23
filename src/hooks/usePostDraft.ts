import { useCallback, useRef, useState } from 'react';
import type { CardLocation } from '../types/board';
import { linkToAttachment } from '../lib/embeds';
import { MAX_TOTAL_BYTES, formatSize, validateFile } from '../lib/media';

export const MAX_ATTACHMENTS = 10;

export interface PostDraft {
  authorName: string;
  unit: string;
  title: string;
  taskId: string;
  body: string;
  /** Nhiều tệp cùng lúc: ảnh, video, âm thanh, tài liệu, ảnh chụp, hình vẽ… */
  files: File[];
  links: string[];
  /** Vị trí trên bản đồ (không bắt buộc). */
  location: CardLocation | null;
  /** Nhãn các lựa chọn thăm dò, hoặc null. */
  poll: string[] | null;
}

const URL_LINE = /^https?:\/\/\S+$/i;

/** Ảnh dán từ clipboard thường tên "image.png" cho mọi lần dán: đặt tên riêng để không trùng. */
function uniqueName(file: File, index: number): File {
  if (!/^image\.(png|jpe?g|gif|webp)$/i.test(file.name)) return file;
  const ext = file.name.split('.').pop() ?? 'png';
  return new File([file], `anh-dan-${Date.now()}-${index}.${ext}`, { type: file.type });
}

const sameFile = (a: File, b: File): boolean => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

/**
 * Trạng thái form nộp bài + toàn bộ logic thêm/bớt đính kèm, dán từ clipboard, kiểm tra giới hạn.
 * Mọi đường vào (nút chọn tệp, kéo thả, Ctrl+V, nút Dán, máy ảnh, ghi hình, bảng vẽ) đều đi qua addFiles/addLinks.
 */
export function usePostDraft(initial: PostDraft) {
  const [draft, setDraftState] = useState<PostDraft>(initial);
  const [attachError, setAttachError] = useState('');
  const ref = useRef<PostDraft>(initial);

  const commit = useCallback((next: PostDraft): void => {
    ref.current = next;
    setDraftState(next);
  }, []);

  const set = useCallback(<K extends keyof PostDraft>(key: K, value: PostDraft[K]): void => {
    commit({ ...ref.current, [key]: value });
  }, [commit]);

  const addFiles = useCallback((incoming: File[]): void => {
    const problems: string[] = [];
    const cur = ref.current;
    const files = [...cur.files];
    let total = files.reduce((n, f) => n + f.size, 0);
    incoming.map(uniqueName).forEach((f) => {
      const problem = validateFile(f);
      if (problem) { problems.push(`${f.name}: ${problem}`); return; }
      if (files.some((x) => sameFile(x, f))) return;
      if (files.length + cur.links.length >= MAX_ATTACHMENTS) { problems.push(`Mỗi bài tối đa ${MAX_ATTACHMENTS} đính kèm.`); return; }
      if (total + f.size > MAX_TOTAL_BYTES) { problems.push(`${f.name}: tổng dung lượng một bài tối đa ${formatSize(MAX_TOTAL_BYTES)}.`); return; }
      files.push(f);
      total += f.size;
    });
    setAttachError([...new Set(problems)].join(' '));
    if (files.length !== cur.files.length) commit({ ...cur, files });
  }, [commit]);

  const addLinks = useCallback((urls: string[]): void => {
    const cur = ref.current;
    const links = [...cur.links];
    const problems: string[] = [];
    urls.map((u) => u.trim()).filter(Boolean).forEach((u) => {
      const a = linkToAttachment(u);
      if (a.type === 'link' && !a.url) { problems.push(`“${u.slice(0, 40)}” chưa phải liên kết (cần bắt đầu bằng https://).`); return; }
      if (links.includes(u)) return;
      if (cur.files.length + links.length >= MAX_ATTACHMENTS) { problems.push(`Mỗi bài tối đa ${MAX_ATTACHMENTS} đính kèm.`); return; }
      links.push(u);
    });
    setAttachError(problems.join(' '));
    if (links.length !== cur.links.length) commit({ ...cur, links });
  }, [commit]);

  const removeFile = useCallback((i: number): void => {
    commit({ ...ref.current, files: ref.current.files.filter((_, j) => j !== i) });
    setAttachError('');
  }, [commit]);

  const removeLink = useCallback((i: number): void => {
    commit({ ...ref.current, links: ref.current.links.filter((_, j) => j !== i) });
    setAttachError('');
  }, [commit]);

  const appendText = useCallback((text: string): void => {
    const cur = ref.current;
    commit({ ...cur, body: cur.body ? `${cur.body}\n${text}` : text });
  }, [commit]);

  /**
   * Xử lý dữ liệu dán: tệp/ảnh → đính kèm; mỗi dòng đều là liên kết → đính kèm liên kết;
   * còn lại → thêm vào ô Nội dung. Nhờ vậy dán đồng thời được ảnh, link và đoạn văn.
   */
  const ingest = useCallback((files: File[], text: string): void => {
    if (files.length > 0) addFiles(files);
    const t = text.trim();
    if (!t) return;
    const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.every((l) => URL_LINE.test(l))) addLinks(lines);
    else appendText(t);
  }, [addFiles, addLinks, appendText]);

  return { draft, set, addFiles, addLinks, removeFile, removeLink, appendText, ingest, attachError, setAttachError };
}
