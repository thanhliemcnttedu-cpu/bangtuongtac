import type { ReactNode } from 'react';

/**
 * Định dạng nhẹ cho mô tả và các bước: **chữ đậm** và `mã / tên tệp`. Dựng bằng phần tử React nên không chèn HTML thô
 * và không có nguy cơ mã độc; mọi ký tự khác hiện nguyên văn.
 */
export function renderMarkup(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<b key={i} className="font-extrabold text-ink">{m[1]}</b>);
    else out.push(<code key={i} className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-ink">{m[2]}</code>);
    last = m.index + m[0].length;
    i += 1;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
