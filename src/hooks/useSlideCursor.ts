import { useEffect, useRef, useState } from 'react';
import type { BoardData, SubmissionCard } from '../types/board';

type Item = { card: SubmissionCard };

const who = (c: SubmissionCard): string => c.authorName.trim().toLocaleLowerCase('vi');

/**
 * Con trỏ trang chiếu theo ĐÚNG BÀI đang xem, không theo số thứ tự.
 * Bảng tự làm mới vài giây một lần: bạn khác nộp thêm hoặc thứ tự sắp xếp đổi thì bài đang đọc vẫn đứng yên,
 * chỉ chuyển khi người xem bấm. Thứ tự trang giữ như lúc mở; bài mới nộp được xếp vào cuối.
 * Giáo viên đổi kiểu sắp xếp thì xếp lại theo thứ tự mới.
 */
export function useSlideCursor<T extends Item>(items: T[], board: BoardData, startId?: string) {
  const memory = useRef({ sortBy: board.settings.sortBy, seen: new Map<string, T>() });
  if (memory.current.sortBy !== board.settings.sortBy) memory.current = { sortBy: board.settings.sortBy, seen: new Map() };
  const { seen } = memory.current;

  const byId = new Map(items.map((i) => [i.card.id, i]));
  // Map giữ thứ tự thêm vào; bài đã ẩn vẫn giữ chỗ, hiện lại thì về đúng vị trí cũ.
  for (const i of items) seen.set(i.card.id, i);

  const list = [...seen].flatMap(([id, old]): T[] => {
    const now = byId.get(id);
    if (now) return [now];
    // Danh sách chỉ lấy bài mới nhất của mỗi em: bạn nộp thêm bài khác thì bài cũ đang đọc vẫn phải còn.
    const card = board.cards.find((c) => c.id === id);
    const replaced = card && board.cards.some((c) => c.id !== id && who(c) === who(card) && c.submittedAt > card.submittedAt);
    return card && replaced ? [{ ...old, card }] : [];
  });

  const [currentId, setCurrentId] = useState(startId ?? '');
  const lastIndex = useRef(0);
  const found = list.findIndex((i) => i.card.id === currentId);
  // Bài đang xem bị xóa hoặc ẩn: đứng ở đúng vị trí đó (bài kế bên).
  const index = found >= 0 ? found : Math.min(lastIndex.current, Math.max(0, list.length - 1));
  lastIndex.current = index;
  const item = list[index];

  const shownId = item?.card.id;
  useEffect(() => { if (shownId && shownId !== currentId) setCurrentId(shownId); }, [shownId, currentId]);

  const goTo = (i: number): void => {
    const next = list[Math.min(list.length - 1, Math.max(0, i))];
    if (next) setCurrentId(next.card.id);
  };

  return { list, item, index, total: list.length, goTo, go: (delta: number): void => goTo(index + delta) };
}
