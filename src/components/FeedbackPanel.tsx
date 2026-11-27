import { useMemo, useState } from 'react';
import { Check, EyeOff, Eye, MessageCircle, Send, ShieldCheck, Trash2 } from 'lucide-react';
import type { BoardData, CardComment, SubmissionCard } from '../types/board';
import { checkComment, MAX_COMMENT } from '../lib/moderation';
import { formatRelative } from '../lib/format';
import { formatGrade, parseGrade } from '../lib/grade';
import { formatStars, getMyComments, getMyRatings, ratingAvg } from '../lib/peer';
import { StarsDisplay, StarsInput } from './StarRating';
import { formatEditCode } from '../lib/editCode';
import { normalize, rosterMatcher } from '../lib/boardLogic';

const PROFILE_KEY = 'bt.lastProfile';
const COMMENT_DELETE_MS = 15 * 60_000;

/** Các thao tác Đánh giá & nhận xét do Workspace cấp cho thẻ đang xem. */
export interface FeedbackActions {
  /** Giáo viên (chủ bảng / đồng quản lý): chấm sao, điểm, lời phê, ẩn/xóa nhận xét. */
  canManage: boolean;
  /** Học sinh được tương tác (bảng đang mở, đang xem bằng vai học sinh). */
  canInteract: boolean;
  isMine: (cardId: string) => boolean;
  onRate: (cardId: string, stars: number) => Promise<void>;
  onComment: (cardId: string, author: string, body: string) => Promise<CardComment>;
  onDeleteOwnComment: (cardId: string, commentId: string) => Promise<void>;
  onCommentStatus: (cardId: string, commentId: string, status: 'visible' | 'pending' | 'hidden') => Promise<void>;
  onDeleteComment: (cardId: string, commentId: string) => Promise<void>;
  onTeacherStars: (cardId: string, stars: number | null) => Promise<void>;
  onGrade: (cardId: string, grade: number | null, note: string) => Promise<void>;
  /** Gán bài cho thành viên trong danh sách (khi học sinh gõ sai tên). */
  onReassign: (cardId: string, member: { name: string; unit: string }) => Promise<void>;
}

function loadName(): string {
  try { return (JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '{}') as { name?: string }).name ?? ''; } catch { return ''; }
}

function Section({ title, children, tone = 'bg-white' }: { title: string; children: React.ReactNode; tone?: string }) {
  return (
    <section className={`rounded-2xl border border-brand-100 p-3 ${tone}`}>
      <h3 className="mb-2 text-sm font-extrabold">{title}</h3>
      {children}
    </section>
  );
}

/** Phần giáo viên chấm: sao, điểm số (0–10) và lời phê. Tự lưu khi rời ô. */
/** Tên người nộp chưa có trong danh sách (gõ sai, viết tắt…): giáo viên gán bài cho đúng thành viên chưa nộp nhiệm vụ này. */
function ReassignRow({ card, board, fb }: { card: SubmissionCard; board: BoardData; fb: FeedbackActions }) {
  const [busy, setBusy] = useState(false);
  const match = rosterMatcher(board.roster);
  if (board.roster.length === 0 || match(card)) return null;
  const doneIds = new Set(board.cards.filter((c) => c.taskId === card.taskId && c.id !== card.id).flatMap((c) => { const m = match(c); return m ? [m.id] : []; }));
  const options = board.roster.filter((m) => !doneIds.has(m.id));
  return (
    <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <label htmlFor={`fb-reassign-${card.id}`} className="font-bold">“{card.authorName}” chưa có trong danh sách thành viên. Gán bài này cho:</label>
      <select id={`fb-reassign-${card.id}`} disabled={busy} defaultValue="" className="input mt-1 !min-h-[40px]"
        onChange={(e) => { const m = board.roster.find((x) => x.id === e.target.value); if (!m) return; setBusy(true); void fb.onReassign(card.id, { name: m.name, unit: m.unit }).finally(() => setBusy(false)); }}>
        <option value="">Chọn thành viên…</option>
        {options.map((m) => <option key={m.id} value={m.id}>{m.name}{m.unit ? ` · ${m.unit}` : ''}</option>)}
      </select>
    </div>
  );
}

function TeacherGrading({ card, board, fb }: { card: SubmissionCard; board: BoardData; fb: FeedbackActions }) {
  const [grade, setGrade] = useState(card.grade !== undefined ? formatGrade(card.grade) : '');
  const [note, setNote] = useState(card.teacherNote ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  const save = async (gradeText: string, noteText: string): Promise<void> => {
    const g = parseGrade(gradeText);
    if (!g.ok) { setState('error'); setMsg('Điểm từ 0 đến 10.'); return; }
    if (g.value === (card.grade ?? null) && noteText.trim() === (card.teacherNote ?? '')) return;
    setState('saving');
    try { await fb.onGrade(card.id, g.value, noteText.trim()); setState('saved'); setMsg(''); } catch (e) { setState('error'); setMsg(e instanceof Error ? e.message : 'Không lưu được.'); }
  };

  return (
    <Section title="Chấm bài (chỉ giáo viên)" tone="bg-teal2-50">
      <div className="space-y-3">
        <ReassignRow card={card} board={board} fb={fb} />
        {card.editCode && <p className="rounded-xl bg-white/70 px-3 py-2 text-xs text-ink-2">{board.settings.scope === 'team' ? 'Mã sửa bài của người này' : 'Mã sửa bài của em này'}: <b className="select-all font-mono text-sm tracking-widest text-ink">{formatEditCode(card.editCode)}</b> {board.settings.scope === 'team' ? '(đọc cho đồng nghiệp nếu quên mã)' : '(đọc cho em nếu em quên mã)'}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-bold">Sao</span>
          <StarsInput label="Số sao giáo viên chấm" value={card.teacherStars ?? 0} onChange={(n) => void fb.onTeacherStars(card.id, n === card.teacherStars ? null : n)} />
          {card.teacherStars !== undefined && <button type="button" onClick={() => void fb.onTeacherStars(card.id, null)} className="btn-ghost btn-sm">Bỏ sao</button>}
        </div>
        <div className="grid gap-3 sm:grid-cols-[110px_1fr]">
          <div>
            <label htmlFor={`fb-grade-${card.id}`} className="field-label">Điểm /10</label>
            <input id={`fb-grade-${card.id}`} inputMode="decimal" value={grade} placeholder="—" aria-invalid={state === 'error'}
              onChange={(e) => { setGrade(e.target.value); setState('idle'); }} onBlur={(e) => void save(e.currentTarget.value, note)}
              className="input text-center font-extrabold" />
          </div>
          <div>
            <label htmlFor={`fb-note-${card.id}`} className="field-label">Lời phê</label>
            <textarea id={`fb-note-${card.id}`} rows={2} maxLength={300} value={note} placeholder="Viết lời phê cho bài của bạn…"
              onChange={(e) => { setNote(e.target.value); setState('idle'); }} onBlur={(e) => void save(grade, e.currentTarget.value)}
              className="input min-h-[64px] py-2" />
          </div>
        </div>
        <p className="h-4 text-xs" aria-live="polite">
          {state === 'saving' && <span className="text-ink-3">Đang lưu…</span>}
          {state === 'saved' && <span className="text-emerald-700">Đã lưu. Lời phê hiện cho cả lớp; điểm số chỉ hiện khi bạn bật “Cho học sinh xem điểm” trong Cài đặt.</span>}
          {state === 'error' && <span className="font-bold text-rose-700">{msg}</span>}
        </p>
      </div>
    </Section>
  );
}

function CommentItem({ c, fb, cardId }: { c: CardComment; fb: FeedbackActions; cardId: string }) {
  const mineAt = getMyComments()[c.id];
  const ownDeletable = mineAt !== undefined && Date.now() - mineAt < COMMENT_DELETE_MS;
  const status = c.status ?? 'visible';
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<void>): Promise<void> => { setError(''); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Không thực hiện được.'); } };
  const tone = status === 'hidden' ? 'bg-slate-100 ring-slate-200' : status === 'pending' ? 'bg-amber-50 ring-amber-200' : 'bg-white ring-brand-100';
  return (
    <li className={`rounded-xl p-2.5 ring-1 ${tone}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm font-extrabold">{c.author}{mineAt !== undefined && <span className="ml-1 text-xs font-bold text-brand-700">(bạn)</span>}</span>
        <time dateTime={c.at} className="text-xs text-ink-3">{formatRelative(c.at)}</time>
      </div>
      <p className={`whitespace-pre-line break-words text-sm ${status === 'hidden' ? 'text-ink-3 line-through' : ''}`}>{c.body}</p>
      {status === 'pending' && <p className="text-xs font-bold text-amber-800">{fb.canManage ? 'Đang chờ bạn duyệt: học sinh chưa thấy nhận xét này.' : 'Đang chờ giáo viên duyệt. Chỉ mình bạn thấy lúc này.'}</p>}
      {status === 'hidden' && <p className="text-xs font-bold text-rose-700">Đã ẩn: học sinh không thấy nhận xét này.</p>}
      {(fb.canManage || ownDeletable) && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {fb.canManage && status === 'pending' && (
            <button type="button" onClick={() => void run(() => fb.onCommentStatus(cardId, c.id, 'visible'))} className="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700"><Check className="h-3.5 w-3.5" aria-hidden /> Duyệt</button>
          )}
          {fb.canManage && (
            <button type="button" onClick={() => void run(() => fb.onCommentStatus(cardId, c.id, status === 'hidden' ? 'visible' : 'hidden'))} className="btn-ghost btn-sm">
              {status === 'hidden' ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />} {status === 'hidden' ? 'Hiện lại' : 'Ẩn'}
            </button>
          )}
          {fb.canManage ? (
            <button type="button" onClick={() => void run(() => fb.onDeleteComment(cardId, c.id))} className="btn btn-sm text-rose-700 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" aria-hidden /> Xóa</button>
          ) : (
            <button type="button" onClick={() => void run(() => fb.onDeleteOwnComment(cardId, c.id))} className="btn btn-sm text-rose-700 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" aria-hidden /> Xóa nhận xét của tôi</button>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-1 text-xs font-bold text-rose-700">{error}</p>}
    </li>
  );
}

/**
 * Đánh giá & nhận xét cho một bài: sao và lời phê của giáo viên, sao của các bạn, nhận xét của các bạn.
 * Nhận xét được kiểm tra ngay khi gõ (cảnh báo thân thiện) và kiểm tra lại ở máy chủ; không thể gửi từ ngữ không lành mạnh.
 */
export function FeedbackPanel({ card, board, fb }: { card: SubmissionCard; board: BoardData; fb: FeedbackActions }) {
  const settings = board.settings;
  const mine = fb.isMine(card.id);
  const open = card.status === 'approved' || card.status === 'featured';
  const avg = ratingAvg(card);
  const myStars = getMyRatings()[card.id] ?? 0;
  const [rateMsg, setRateMsg] = useState('');

  const [author, setAuthor] = useState(loadName);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<CardComment['status'] | null>(null);

  const live = useMemo(() => (text.trim() ? checkComment(text) : null), [text]);
  const warn = live && !live.ok && (live.problem === 'profanity' || live.problem === 'contact') ? live.message : '';
  // Giáo viên thấy tất cả; học sinh thấy nhận xét đã hiện + nhận xét đang chờ duyệt của chính mình.
  const shown = (card.comments ?? []).filter((c) => fb.canManage || (c.status ?? 'visible') === 'visible' || (c.status === 'pending' && getMyComments()[c.id] !== undefined));
  const visibleCount = shown.filter((c) => (c.status ?? 'visible') === 'visible').length;
  const pendingCount = fb.canManage ? shown.filter((c) => c.status === 'pending').length : 0;

  const canRate = fb.canInteract && settings.peerStars && open && !mine;
  const canComment = fb.canInteract && settings.peerComments && open;

  const rate = async (n: number): Promise<void> => {
    setRateMsg('');
    try { await fb.onRate(card.id, n); } catch (e) { setRateMsg(e instanceof Error ? e.message : 'Không chấm sao được.'); }
  };

  const send = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError('');
    setSent(null);
    setSending(true);
    try {
      const posted = await fb.onComment(card.id, author, text);
      setText('');
      setSent(posted.status ?? 'visible');
      try { const raw = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '{}') as Record<string, string>; localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...raw, name: author.trim() })); } catch { /* bỏ qua */ }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không gửi được nhận xét.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3 text-left" aria-label="Đánh giá và nhận xét">
      {fb.canManage && <TeacherGrading key={card.id} card={card} board={board} fb={fb} />}

      {(card.teacherStars !== undefined || card.teacherNote || (settings.showGrades && card.grade !== undefined)) && !fb.canManage && (
        <Section title="Đánh giá của giáo viên" tone="bg-teal2-50">
          <div className="flex flex-wrap items-center gap-3">
            {card.teacherStars !== undefined && <StarsDisplay value={card.teacherStars} size={20} label={`Giáo viên chấm ${card.teacherStars} sao`} />}
            {settings.showGrades && card.grade !== undefined && <span className="chip bg-white text-base text-teal2-700 ring-teal2-500/30">Điểm {formatGrade(card.grade)}</span>}
          </div>
          {card.teacherNote && <p className="mt-2 whitespace-pre-line text-sm">“{card.teacherNote}”</p>}
        </Section>
      )}

      {settings.peerStars && (
        <Section title="Các bạn chấm sao">
          <div className="flex flex-wrap items-center gap-3">
            {avg !== null ? (
              <><StarsDisplay value={avg} size={20} label={`Trung bình ${formatStars(avg)} trên 5 sao`} /><span className="text-sm font-extrabold">{formatStars(avg)} <span className="font-normal text-ink-2">({card.ratingCount} lượt)</span></span></>
            ) : <span className="text-sm text-ink-3">Chưa có bạn nào chấm sao.</span>}
          </div>
          {fb.canInteract && (
            <div className="mt-2">
              {mine ? <p className="text-sm text-ink-2">Đây là bài của bạn nên bạn không chấm sao được. Hãy chờ các bạn khác nhé!</p>
                : !open ? <p className="text-sm text-ink-2">Bài đang chờ giáo viên duyệt.</p>
                  : (
                    <>
                      <p className="text-sm font-bold">{myStars ? 'Bạn đã chấm. Bấm sao khác để đổi:' : 'Bạn thấy bài này mấy sao?'}</p>
                      <StarsInput label="Chấm sao cho bài này" value={myStars} onChange={(n) => void rate(n)} disabled={!canRate} />
                    </>
                  )}
              {rateMsg && <p role="alert" className="mt-1 text-sm font-bold text-rose-700">{rateMsg}</p>}
            </div>
          )}
        </Section>
      )}

      {(settings.peerComments || shown.length > 0) && (
        <Section title={`Nhận xét của các bạn (${visibleCount}${pendingCount > 0 ? ` · ${pendingCount} chờ duyệt` : ''})`}>
          {shown.length === 0 ? <p className="text-sm text-ink-3">Chưa có nhận xét nào.</p> : (
            <ul className="space-y-2" aria-label="Danh sách nhận xét">{shown.map((c) => <CommentItem key={c.id} c={c} fb={fb} cardId={card.id} />)}</ul>
          )}

          {canComment && (
            <form onSubmit={(e) => void send(e)} noValidate className="mt-3 space-y-2 border-t border-brand-100 pt-3">
              <p className="flex items-start gap-1.5 text-xs text-ink-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />Hãy góp ý nhẹ nhàng: nêu điều bạn thích và điều có thể làm tốt hơn. Từ ngữ không lành mạnh sẽ bị chặn tự động.{board.settings.moderation === 'manual' ? ' Nhận xét cần giáo viên duyệt mới hiện.' : ''}</p>
              {mine && <p className="text-xs text-ink-2">Đây là bài của bạn: bạn có thể trả lời các bạn ở đây.</p>}
              <div>
                <label htmlFor={`cm-name-${card.id}`} className="field-label">Tên của bạn</label>
                <input id={`cm-name-${card.id}`} className="input" value={author} maxLength={40} onChange={(e) => setAuthor(e.target.value)} placeholder="Ví dụ: Bạn Minh Anh" autoComplete="name" />
              </div>
              <div>
                <label htmlFor={`cm-body-${card.id}`} className="field-label">Nhận xét</label>
                <textarea id={`cm-body-${card.id}`} rows={3} className="input min-h-[80px] py-2" value={text} maxLength={MAX_COMMENT + 50}
                  onChange={(e) => { setText(e.target.value); setSent(null); setError(''); }} aria-invalid={!!warn} aria-describedby={warn ? `cm-warn-${card.id}` : undefined}
                  placeholder="Mình thích… Bạn có thể thử…" />
                <div className="flex items-start justify-between gap-2">
                  <p id={`cm-warn-${card.id}`} role="alert" className="min-h-[1.25rem] text-xs font-bold text-rose-700">{warn}</p>
                  <span className={`shrink-0 text-xs ${text.length > MAX_COMMENT ? 'font-bold text-rose-700' : 'text-ink-3'}`}>{text.length}/{MAX_COMMENT}</span>
                </div>
              </div>
              {error && <p role="alert" className="text-sm font-bold text-rose-700">{error}</p>}
              {sent === 'visible' && <p role="status" className="text-sm font-bold text-emerald-700">Đã gửi nhận xét. Cảm ơn bạn!</p>}
              {sent === 'pending' && <p role="status" className="text-sm font-bold text-amber-800">Đã gửi. Nhận xét sẽ hiện sau khi giáo viên duyệt. Cảm ơn bạn!</p>}
              <button type="submit" disabled={sending || !text.trim() || !!warn || text.length > MAX_COMMENT} className="btn-primary"><Send className="h-4 w-4" aria-hidden /> {sending ? 'Đang gửi…' : 'Gửi nhận xét'}</button>
            </form>
          )}
          {!canComment && fb.canInteract && !settings.peerComments && <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-3"><MessageCircle className="h-4 w-4" aria-hidden /> Giáo viên đang tắt nhận xét giữa các bạn.</p>}
        </Section>
      )}
    </div>
  );
}
