import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Circle, Eye, ListChecks, Pencil } from 'lucide-react';
import type { BoardData, SubmissionCard, TaskItem } from '../types/board';
import { formatDateTime } from '../lib/format';
import { statusOfTask } from '../lib/teamStatus';
import type { MemberStatus, TeamStatusRow } from '../lib/teamStatus';
import { DownloadFiles } from './DownloadFiles';

interface Props {
  board: BoardData;
  roster: { name: string; unit: string }[];
  /** Bài đã nộp từ chính trình duyệt này. */
  mine: ReadonlySet<string>;
  /** Hỏi máy chủ ai đã nộp; null = máy chủ chưa có hàm này. */
  load: () => Promise<TeamStatusRow[] | null>;
  onView: (card: SubmissionCard) => void;
  onEdit: (cardId: string) => void;
}

type Show = 'all' | 'done' | 'missing' | 'mine';
const CHIPS: { id: Show; label: string }[] = [
  { id: 'all', label: 'Tất cả' }, { id: 'done', label: 'Đã nộp' }, { id: 'missing', label: 'Chưa nộp' }, { id: 'mine', label: 'Của tôi' },
];

function stateOf(m: MemberStatus, task: TaskItem): { text: string; tone: string } {
  const r = m.row;
  if (!r) return { text: 'Chưa nộp', tone: 'bg-slate-100 text-slate-700 ring-slate-200' };
  if (r.status === 'needs_edit') return { text: 'Cần sửa', tone: 'bg-rose-100 text-rose-800 ring-rose-200' };
  if (r.status === 'pending') return { text: 'Chờ duyệt', tone: 'bg-amber-100 text-amber-900 ring-amber-200' };
  if (r.late) return { text: 'Nộp muộn', tone: 'bg-orange-100 text-orange-900 ring-orange-200' };
  return { text: task.ackOnly ? 'Đã đọc' : 'Đã nộp', tone: 'bg-emerald-100 text-emerald-900 ring-emerald-200' };
}

/** Thành viên mở link tổ là thấy ngay từng việc: ai đã nộp, ai chưa, lúc nào; được phép thì xem và tải tệp. */
export function TeamStatusPanel({ board, roster, mine, load, onView, onEdit }: Props) {
  const [rows, setRows] = useState<TeamStatusRow[] | null>(null);
  const [show, setShow] = useState<Show>('all');
  const [who, setWho] = useState('');
  const loadRef = useRef(load);
  loadRef.current = load;

  // Hỏi lại khi bài trên bảng đổi và mỗi 20 giây (khi tắt xem bài của nhau, bảng không tự đổi theo bài người khác).
  useEffect(() => {
    let alive = true;
    const run = (): void => {
      if (document.hidden) return;
      void loadRef.current().then((r) => { if (alive) setRows(r); }, () => undefined);
    };
    run();
    const t = window.setInterval(run, 20_000);
    window.addEventListener('focus', run);
    return () => { alive = false; window.clearInterval(t); window.removeEventListener('focus', run); };
  }, [board.id, board.cards]);

  if (!rows || board.tasks.length === 0) return null;
  const cards = new Map(board.cards.map((c) => [c.id, c]));
  const names = [...new Set([...roster.map((m) => m.name), ...rows.map((r) => r.author)])].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));

  return (
    <section aria-label="Tiến độ nộp của tổ" className="glass space-y-3 rounded-3xl p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-extrabold"><ListChecks className="h-5 w-5 text-brand-700" aria-hidden /> Tiến độ nộp của tổ</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {CHIPS.map((c) => (
            <button key={c.id} type="button" aria-pressed={show === c.id} onClick={() => setShow(c.id)}
              className={`btn btn-sm max-lg:min-h-[44px] ${show === c.id ? 'bg-brand-600 text-white' : 'border-[1.5px] border-brand-200 bg-white text-brand-800'}`}>{c.label}</button>
          ))}
          <select aria-label="Lọc theo người nộp" className="input !w-auto" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Mọi người nộp</option>
            {names.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      {board.tasks.map((task) => {
        const all = statusOfTask(task, roster, rows);
        const done = all.filter((m) => m.row).length;
        const isMine = (m: MemberStatus): boolean => m.ids.some((id) => mine.has(id));
        const list = all.filter((m) => (!who || m.name === who)
          && (show === 'all' || (show === 'done' && !!m.row) || (show === 'missing' && !m.row) || (show === 'mine' && isMine(m))));
        return (
          <article key={task.id} className="rounded-2xl border-[1.5px] border-brand-100 bg-white">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-100 px-3 py-2">
              <h3 className="min-w-0 break-words font-extrabold text-brand-800">{task.label}</h3>
              <p className="text-sm font-bold text-ink-2">
                {done}/{all.length} đã nộp{all.length > done ? ` · ${all.length - done} chưa nộp` : ''}{task.dueAt ? ` · Hạn ${formatDateTime(task.dueAt)}` : ''}
              </p>
            </header>
            <ul className="divide-y divide-brand-100">
              {list.length === 0 && <li className="px-3 py-3 text-sm text-ink-2">Không có ai phù hợp bộ lọc.</li>}
              {list.map((m) => {
                const s = stateOf(m, task);
                const card = m.row ? cards.get(m.row.id) : undefined;
                const myId = m.ids.find((id) => mine.has(id));
                return (
                  <li key={m.name} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    {m.row ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden /> : <Circle className="h-5 w-5 shrink-0 text-slate-300" aria-hidden />}
                    <span className="min-w-0 break-words font-bold">{m.name}</span>
                    {myId && <span className="chip bg-amber-100 text-amber-900 ring-amber-200">Của tôi</span>}
                    <span className={`chip ${s.tone}`}>{s.text}</span>
                    {m.row && <span className="text-sm text-ink-2">{m.row.resubmittedAt ? 'Nộp lại' : 'Nộp'} lúc {formatDateTime(m.row.resubmittedAt ?? m.row.submittedAt)}</span>}
                    <span className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
                      {card && <button type="button" onClick={() => onView(card)} className="btn-ghost btn-sm max-lg:min-h-[44px]"><Eye className="h-3.5 w-3.5" aria-hidden /> Xem</button>}
                      {card && <DownloadFiles card={card} className="btn-ghost btn-sm max-lg:min-h-[44px]" />}
                      {myId && <button type="button" onClick={() => onEdit(myId)} className="btn-primary btn-sm max-lg:min-h-[44px]"><Pencil className="h-3.5 w-3.5" aria-hidden /> Sửa bài đã nộp</button>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </article>
        );
      })}
      {board.settings.privateView && <p className="text-xs text-ink-2">Tổ trưởng đang tắt xem tệp của nhau: bạn thấy ai đã nộp và lúc nào, chỉ mở được bài của mình.</p>}
    </section>
  );
}
