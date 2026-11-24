import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Minus, Plus } from 'lucide-react';
import type { PinnedResource } from '../types/board';
import { safeHref } from '../lib/safeUrl';
import { AttachmentView } from './AttachmentView';

const SCALES = [0.85, 1, 1.2, 1.45, 1.8];

/**
 * Màn đọc tài liệu toàn màn hình, thiết kế cho học sinh tiểu học:
 * nút to dễ chạm, chữ to có thể phóng thêm, mỗi lúc chỉ một tệp, chỉ một thanh cuộn,
 * nút "Quay lại" luôn ở góc trên bên trái và nút "Tệp trước / Tệp sau" ở dưới cùng.
 */
export function MaterialReader({ resource, startIndex = 0, onClose }: { resource: PinnedResource; /** Mở sẵn ở tệp thứ mấy (từ 0). */ startIndex?: number; onClose: () => void }) {
  const files = resource.attachments ?? [];
  const [index, setIndex] = useState(startIndex);
  const [scale, setScale] = useState(1);
  const body = useRef<HTMLDivElement>(null);
  const href = safeHref(resource.url);
  const current = files[index];
  const multi = files.length > 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // Nằm trong hộp nộp bài thì Esc chỉ đóng màn đọc, không đóng luôn hộp bên dưới (nghe ở giai đoạn bắt sớm rồi chặn lan truyền).
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (multi && e.key === 'ArrowRight') setIndex((i) => Math.min(files.length - 1, i + 1));
      if (multi && e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // chỉ cuộn trong màn đọc
    return () => { window.removeEventListener('keydown', onKey, true); document.body.style.overflow = prev; };
  }, [onClose, multi, files.length]);

  // Đổi tệp thì cuộn về đầu trang.
  useEffect(() => { body.current?.scrollTo({ top: 0 }); }, [index]);

  const zoom = (dir: 1 | -1): void => {
    const i = SCALES.indexOf(scale);
    setScale(SCALES[Math.max(0, Math.min(SCALES.length - 1, i + dir))]);
  };

  // Portal ra <body>: nếu để trong khung có backdrop-blur thì `fixed` bị nhốt trong khung đó, không toàn màn hình được.
  return createPortal(
    <div className="reader fixed inset-0 z-[60] flex flex-col bg-gradient-to-b from-brand-50 to-white" role="dialog" aria-modal="true" aria-label={resource.title}
      style={{ ['--reader-scale' as string]: String(scale) }}>
      <header className="flex flex-wrap items-center gap-2 border-b border-brand-200 bg-white/95 px-3 py-2 shadow-soft sm:gap-3 sm:px-5">
        <button type="button" onClick={onClose} className="btn-primary !min-h-[52px] !px-5 text-base"><ArrowLeft className="h-5 w-5" aria-hidden /> Quay lại</button>
        <div className="order-last min-w-0 basis-full sm:order-none sm:basis-auto sm:flex-1">
          <h2 className="truncate text-lg font-extrabold leading-tight sm:text-2xl">{resource.title}</h2>
          {(resource.description || current) && <p className="truncate text-xs text-ink-2 sm:text-sm">{resource.description || current?.name}</p>}
        </div>
        <div className="ml-auto flex items-center gap-1.5 sm:ml-0" role="group" aria-label="Cỡ chữ">
          <button type="button" onClick={() => zoom(-1)} disabled={scale === SCALES[0]} aria-label="Chữ nhỏ lại" className="btn-ghost !min-h-[48px] !min-w-[48px] !px-0 text-lg"><Minus className="h-5 w-5" aria-hidden /></button>
          <span className="w-10 text-center text-xl font-extrabold text-brand-700" aria-hidden>Aa</span>
          <button type="button" onClick={() => zoom(1)} disabled={scale === SCALES[SCALES.length - 1]} aria-label="Chữ to lên" className="btn-ghost !min-h-[48px] !min-w-[48px] !px-0 text-lg"><Plus className="h-5 w-5" aria-hidden /></button>
        </div>
      </header>

      <div ref={body} className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6 sm:py-6">
        <div className="mx-auto w-full max-w-5xl space-y-4">
          {current ? (
            <>
              {multi && <p className="text-center text-sm font-bold text-ink-2">Tệp {index + 1} / {files.length}: {current.name}</p>}
              <AttachmentView key={`${current.name}-${index}`} attachment={current} />
            </>
          ) : href && href !== '#' ? (
            <div className="rounded-3xl bg-white p-8 text-center shadow-soft">
              <p className="mb-4 text-lg text-ink-2">Tài liệu này nằm ở một trang web khác.</p>
              <a href={href} target="_blank" rel="noopener noreferrer" className="btn-primary !min-h-[56px] text-lg"><ExternalLink className="h-5 w-5" aria-hidden /> Mở tài liệu</a>
            </div>
          ) : (
            <p className="rounded-3xl bg-white p-8 text-center text-lg text-ink-2 shadow-soft">Tài liệu mẫu, chưa có tệp đính kèm.</p>
          )}
        </div>
      </div>

      {multi && (
        <footer className="flex items-center justify-between gap-3 border-t border-brand-200 bg-white/95 px-3 py-2 sm:px-5">
          <button type="button" onClick={() => setIndex(index - 1)} disabled={index === 0} className="btn-ghost !min-h-[52px] flex-1 text-base sm:flex-none sm:!px-8"><ChevronLeft className="h-5 w-5" aria-hidden /> Tệp trước</button>
          <span className="text-sm font-extrabold text-ink-2">{index + 1} / {files.length}</span>
          <button type="button" onClick={() => setIndex(index + 1)} disabled={index === files.length - 1} className="btn-primary !min-h-[52px] flex-1 text-base sm:flex-none sm:!px-8">Tệp sau <ChevronRight className="h-5 w-5" aria-hidden /></button>
        </footer>
      )}
    </div>,
    document.body,
  );
}
