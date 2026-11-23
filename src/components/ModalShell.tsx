import { useEffect, useRef } from 'react';
import type { ClipboardEvent, ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
  /** Bắt thao tác dán (Ctrl+V) ở bất cứ đâu trong hộp thoại, kể cả khi con trỏ chưa nằm trong ô nhập. */
  onPaste?: (e: ClipboardEvent<HTMLElement>) => void;
}

/** Khung hộp thoại dùng chung: Esc để đóng, bấm nền để đóng, đưa tiêu điểm vào hộp thoại. */
export function ModalShell({ title, onClose, children, maxWidth = 'max-w-lg', onPaste }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onPaste={onPaste}
        className={`pop-in max-h-[92vh] w-full ${maxWidth} overflow-y-auto rounded-t-3xl bg-white p-5 shadow-lift outline-none sm:rounded-3xl`}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Đóng" className="btn-ghost btn-sm !px-2.5">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
