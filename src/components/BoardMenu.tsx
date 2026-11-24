import { useEffect, useRef, useState } from 'react';
import {
  Activity, Archive, ArchiveRestore, BookmarkCheck, BookmarkPlus, ClipboardList, CloudUpload, Copy, Download, Eraser, Info,
  Award, CalendarCheck, ListChecks, Maximize, Medal, Trophy, MoreHorizontal, Printer, Settings, Trash2, Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { BoardData } from '../types/board';

export interface BoardMenuActions {
  onDuplicate: () => void;
  onActivity: () => void;
  onSettings: () => void;
  onGradebook: () => void;
  onRoster: () => void;
  onDetails: () => void;
  onToggleTemplate: () => void;
  onExport: () => void;
  onPrint: () => void;
  onFullscreen: () => void;
  onToggleArchive: () => void;
  onClear: () => void;
  onTrash: () => void;
  onShareTeachers: () => void;
  /** Lưu bản sao bảng và tệp bài nộp lên Google Drive của giáo viên. */
  onDrive: () => void;
  /** Lớp tập huấn: mở công cụ điểm danh / chứng nhận / triển lãm / tổng kết. */
  onTraining?: (tab: 'attendance' | 'certificate' | 'showcase' | 'summary') => void;
}

interface Props {
  board: BoardData;
  /** Đồng quản lý hoặc chủ bảng. */
  canManage: boolean;
  /** Chủ bảng: đóng, xóa, chia sẻ, nhân bản, đánh dấu mẫu. */
  isOwner: boolean;
  /** Xem được toàn bộ dữ liệu (chủ bảng, đồng quản lý, người chỉ xem). */
  canView: boolean;
  actions: BoardMenuActions;
}

interface Item { label: string; Icon: LucideIcon; run: () => void; danger?: boolean }

/** Menu "Thêm": mọi thao tác ít dùng gom một chỗ để thanh công cụ của bảng luôn gọn. */
export function BoardMenu({ board, canManage, isOwner, canView, actions }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent): void => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const go = (fn: () => void) => (): void => { setOpen(false); fn(); };
  const closed = !!board.archivedAt;

  const quick: Item[] = canManage ? [
    { label: 'Cài đặt', Icon: Settings, run: actions.onSettings },
    { label: 'Sổ điểm', Icon: ClipboardList, run: actions.onGradebook },
    { label: 'Danh sách', Icon: ListChecks, run: actions.onRoster },
    ...(isOwner ? [{ label: 'Nhân bản', Icon: Copy, run: actions.onDuplicate }] : [{ label: 'Chia sẻ', Icon: Users, run: actions.onShareTeachers }]),
    { label: 'Hoạt động', Icon: Activity, run: actions.onActivity },
  ] : [];

  // Lớp tập huấn (không phải tổ công tác): điểm danh, giấy chứng nhận, triển lãm, tổng kết khóa.
  const training: Item[] = canManage && board.mode === 'training' && board.settings.scope !== 'team' && actions.onTraining ? [
    { label: 'Điểm danh từng buổi', Icon: CalendarCheck, run: () => actions.onTraining?.('attendance') },
    { label: 'Giấy chứng nhận hoàn thành', Icon: Award, run: () => actions.onTraining?.('certificate') },
    { label: 'Triển lãm sản phẩm theo bình chọn', Icon: Trophy, run: () => actions.onTraining?.('showcase') },
    { label: 'Tổng kết khóa tập huấn', Icon: Medal, run: () => actions.onTraining?.('summary') },
  ] : [];

  const general: Item[] = [
    { label: 'Chi tiết bảng', Icon: Info, run: actions.onDetails },
    ...(canView ? [{ label: 'Giáo viên cùng bảng', Icon: Users, run: actions.onShareTeachers }] : []),
    ...(isOwner ? [{ label: board.isTemplate ? 'Bỏ đánh dấu mẫu' : 'Đánh dấu là mẫu', Icon: board.isTemplate ? BookmarkCheck : BookmarkPlus, run: actions.onToggleTemplate }] : []),
    ...(canView ? [{ label: 'Xuất báo cáo (CSV, mở bằng Excel)', Icon: Download, run: actions.onExport }] : []),
    ...(canManage ? [{ label: 'Lưu lên Google Drive của tôi…', Icon: CloudUpload, run: actions.onDrive }] : []),
    { label: 'In / Lưu thành PDF', Icon: Printer, run: actions.onPrint },
    { label: 'Toàn màn hình', Icon: Maximize, run: actions.onFullscreen },
  ];

  const danger: Item[] = isOwner ? [
    { label: closed ? 'Mở lại bảng' : 'Đóng bảng', Icon: closed ? ArchiveRestore : Archive, run: actions.onToggleArchive },
    { label: 'Xóa hết bài nộp', Icon: Eraser, run: actions.onClear, danger: true },
    { label: 'Chuyển bảng vào thùng rác', Icon: Trash2, run: actions.onTrash, danger: true },
  ] : [];

  const row = (it: Item) => (
    <li key={it.label}>
      <button type="button" role="menuitem" onClick={go(it.run)}
        className={`flex min-h-[44px] w-full items-center gap-3 px-4 text-left text-sm font-bold transition-colors duration-150 hover:bg-brand-50 ${it.danger ? 'text-rose-700 hover:!bg-rose-50' : ''}`}>
        <it.Icon className="h-4 w-4 shrink-0" aria-hidden /> {it.label}
      </button>
    </li>
  );

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu" className="btn-ghost">
        <MoreHorizontal className="h-4 w-4" aria-hidden /> Thêm
      </button>
      {open && (
        <div role="menu" aria-label="Tùy chọn bổ sung" className="pop-in fixed inset-x-3 bottom-3 z-40 max-h-[75vh] overflow-y-auto rounded-3xl border border-brand-200 bg-white shadow-lift sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:mt-2 sm:w-[360px]">
          <div className="border-b border-brand-100 px-4 py-2.5 text-sm font-extrabold">Tùy chọn bổ sung</div>
          {quick.length > 0 && (
            <ul className="grid grid-cols-5 gap-1 border-b border-brand-100 p-2">
              {quick.map((q) => (
                <li key={q.label}>
                  <button type="button" role="menuitem" onClick={go(q.run)} className="flex min-h-[64px] w-full flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-bold text-brand-800 transition duration-150 hover:bg-brand-50">
                    <q.Icon className="h-5 w-5" aria-hidden /> {q.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {training.length > 0 && <ul className="border-b border-brand-100 py-1" aria-label="Lớp tập huấn">{training.map(row)}</ul>}
          <ul className="py-1">{general.map(row)}</ul>
          {danger.length > 0 && <ul className="border-t border-brand-100 py-1">{danger.map(row)}</ul>}
        </div>
      )}
    </div>
  );
}
