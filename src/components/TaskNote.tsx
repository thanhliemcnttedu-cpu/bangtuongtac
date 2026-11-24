import { splitChecklist } from '../lib/checklist';
import { renderRich } from '../lib/richText';

/**
 * Ghi chú / hướng dẫn của một công việc để người khác đọc: phần chữ hiện đúng định dạng (đậm, nghiêng, màu, căn lề, biểu tượng),
 * các việc nhỏ (checklist) hiện dạng danh sách chỉ đọc thay vì dòng "- [ ]" thô.
 */
export function TaskNote({ text, className = '' }: { text: string; className?: string }) {
  const { note, items } = splitChecklist(text ?? '');
  if (!note && items.length === 0) return null;
  return (
    <div className={className}>
      {note && <div>{renderRich(note)}</div>}
      {items.length > 0 && (
        <ul className={`${note ? 'mt-1.5' : ''} space-y-0.5`} aria-label="Các việc nhỏ">
          {items.map((it, i) => (
            <li key={`${it.text}-${i}`} className="flex items-start gap-2"><span aria-hidden>{it.done ? '☑' : '☐'}</span><span className={it.done ? 'line-through opacity-70' : ''}>{it.text}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}
