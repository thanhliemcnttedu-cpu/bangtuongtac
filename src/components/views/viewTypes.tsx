import type { BoardData, BoardRow, CardLayoutPatch } from '../../types/board';
import type { RowActions } from '../GridAndColumnsView';

export interface LayoutViewProps extends RowActions {
  rows: BoardRow[];
  board: BoardData;
  /** Lưu vị trí bản đồ / toạ độ Bảng trắng / vùng Venn của một thẻ (chỉ giáo viên). */
  onLayout: (cardId: string, patch: CardLayoutPatch) => void;
}

export type CardRow = BoardRow & { card: NonNullable<BoardRow['card']> };

/** Các kiểu bố cục mới chỉ vẽ dòng đã có bài nộp. */
export const withCards = (rows: BoardRow[]): CardRow[] => rows.filter((r): r is CardRow => r.card !== null);

export function EmptyLayout({ children }: { children?: React.ReactNode }) {
  return (
    <div className="glass rounded-3xl p-10 text-center">
      <p className="text-lg font-extrabold">Chưa có bài nào để hiển thị</p>
      <p className="mt-1 text-sm text-ink-2">{children ?? 'Thử xóa bớt bộ lọc, hoặc chờ học sinh nộp bài.'}</p>
    </div>
  );
}
