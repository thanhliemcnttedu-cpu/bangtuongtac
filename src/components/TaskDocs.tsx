import { useState } from 'react';
import { Eye, FileText, Link2 } from 'lucide-react';
import type { Attachment, PinnedResource, TaskItem } from '../types/board';
import { MaterialReader } from './MaterialReader';

/** Tệp, video, âm thanh, ảnh, tài liệu nhúng (Drive, YouTube…) xem được ngay trong trang; liên kết web thường thì mở tab mới. */
const viewable = (a: Attachment): boolean => !!a.url && a.type !== 'link';

/**
 * Tài liệu và liên kết đính kèm của một công việc: bấm vào tệp PDF, Word, Excel, PowerPoint… là xem trực tuyến
 * ngay trong trang (không mở tab mới); nhiều tệp thì lật qua lại bằng "Tệp trước / Tệp sau".
 */
export function TaskDocs({ task, className = 'mt-2' }: { task: TaskItem; className?: string }) {
  const docs = (task.attachments ?? []).filter((a) => a.url);
  const [start, setStart] = useState<number | null>(null);
  if (docs.length === 0) return null;
  const files = docs.filter(viewable);
  const reading: PinnedResource | null = start === null ? null : { id: `task-${task.id}`, kind: 'file', title: task.label, description: '', url: '', attachments: files };

  return (
    <>
      <ul className={`flex flex-wrap gap-1.5 ${className}`} aria-label="Tài liệu và liên kết của công việc">
        {docs.map((a, i) => {
          const name = a.label || a.name;
          if (!viewable(a)) {
            return (
              <li key={`${a.url}-${i}`}>
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="chip bg-white text-brand-800 ring-brand-200 hover:bg-brand-50 max-lg:!min-h-[44px] max-lg:px-3 max-lg:text-sm"><Link2 className="h-3.5 w-3.5" aria-hidden /> {name}</a>
              </li>
            );
          }
          const at = files.indexOf(a);
          return (
            <li key={`${a.url}-${i}`}>
              <button type="button" onClick={() => setStart(at)} title="Xem ngay trong trang" aria-label={`Xem ${name}`}
                className="chip min-h-[32px] bg-white text-brand-800 ring-brand-200 hover:bg-brand-50 max-lg:!min-h-[44px] max-lg:px-3 max-lg:text-sm">
                <FileText className="h-3.5 w-3.5" aria-hidden /> {name} <Eye className="ml-0.5 h-3.5 w-3.5 text-brand-600" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
      {reading && <MaterialReader resource={reading} startIndex={start ?? 0} onClose={() => setStart(null)} />}
    </>
  );
}
