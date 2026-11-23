import { useState } from 'react';
import type { FormEvent } from 'react';
import { LogOut, Mail, Trash2, UserPlus } from 'lucide-react';
import type { BoardAccess, BoardData, CollabRole } from '../types/board';

interface Props {
  board: BoardData;
  access: BoardAccess;
  /** Gmail của người đang đăng nhập. */
  myEmail: string;
  onInvite: (email: string, role: CollabRole) => Promise<void>;
  onChangeRole: (email: string, role: CollabRole) => Promise<void>;
  onRemove: (email: string) => Promise<void>;
  onLeave: () => Promise<void>;
}

const ROLE_LABEL: Record<CollabRole, string> = { editor: 'Đồng quản lý', viewer: 'Chỉ xem' };
const ROLE_HINT: Record<CollabRole, string> = {
  editor: 'Duyệt bài, gắn sao, chấm điểm, sửa cài đặt, nhập danh sách, ghim tài liệu. Không đóng, xóa hay chia sẻ bảng.',
  viewer: 'Xem toàn bộ bài nộp, danh sách sĩ số, bảng, báo cáo như giáo viên; không sửa được gì.',
};

function Avatar({ email }: { email: string }) {
  let h = 0;
  for (const ch of email) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white"
      style={{ background: `linear-gradient(135deg, hsl(${h} 75% 55%), hsl(${(h + 35) % 360} 70% 42%))` }} aria-hidden>
      {(email[0] ?? '?').toUpperCase()}
    </span>
  );
}

/** Chia sẻ bảng với giáo viên khác theo Gmail: mời, đổi quyền, gỡ quyền, hoặc tự rời khỏi bảng được chia sẻ. */
export function TeacherSharePanel({ board, access, myEmail, onInvite, onChangeRole, onRemove, onLeave }: Props) {
  const isOwner = access === 'owner';
  const collaborators = board.collaborators ?? [];
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<CollabRole>('editor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [invited, setInvited] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const run = async (fn: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setError('');
    try { await fn(); return true; } catch (e) { setError(e instanceof Error ? e.message : 'Thao tác không thành công.'); return false; } finally { setBusy(false); }
  };

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const target = email.trim();
    if (!target) { setError('Hãy nhập địa chỉ Gmail của đồng nghiệp.'); return; }
    if (await run(() => onInvite(target, role))) { setInvited(target.toLowerCase()); setEmail(''); }
  };

  const mailto = (to: string): string => {
    const subject = `Mời cùng quản lý bảng “${board.title}”`;
    const body = `Chào đồng nghiệp,\n\nTôi vừa chia sẻ bảng “${board.title}” cho bạn trên phần mềm Bảng tương tác lớp học.\n\nCách mở: vào ${window.location.origin}, đăng nhập bằng đúng Gmail ${to}, bảng sẽ có trong mục “Được chia sẻ với tôi”.\n\nQuyền của bạn: ${ROLE_LABEL[collaborators.find((c) => c.email === to)?.role ?? role]}.`;
    return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="space-y-4">
      <p className="rounded-2xl bg-brand-50 px-3 py-2 text-sm text-ink-2">
        Chia sẻ <b className="text-ink">cho giáo viên khác</b> theo Gmail. Người được mời đăng nhập đúng Gmail đó sẽ thấy bảng trong mục “Được chia sẻ với tôi”. Học sinh không cần mục này: dùng tab “Học sinh” để lấy link và mã QR.
      </p>

      <ul className="divide-y divide-brand-100 rounded-2xl border border-brand-100" aria-label="Những người có quyền với bảng">
        <li className="flex items-center gap-3 px-3 py-2">
          <Avatar email={board.ownerEmail ?? myEmail} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold">{board.ownerEmail ?? myEmail}{(board.ownerEmail ?? myEmail).toLowerCase() === myEmail.toLowerCase() ? ' (bạn)' : ''}</span>
            <span className="block text-xs text-ink-2">Chủ bảng</span>
          </span>
        </li>
        {collaborators.map((c) => {
          const me = c.email === myEmail.toLowerCase();
          return (
            <li key={c.email} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <Avatar email={c.email} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{c.email}{me ? ' (bạn)' : ''}</span>
                {!isOwner && <span className="block text-xs text-ink-2">{ROLE_LABEL[c.role]}</span>}
              </span>
              {isOwner && (
                <>
                  <select aria-label={`Quyền của ${c.email}`} value={c.role} disabled={busy} className="input !min-h-[40px] !w-auto"
                    onChange={(e) => void run(() => onChangeRole(c.email, e.target.value as CollabRole))}>
                    <option value="editor">{ROLE_LABEL.editor}</option>
                    <option value="viewer">{ROLE_LABEL.viewer}</option>
                  </select>
                  <a href={mailto(c.email)} className="btn-ghost btn-sm !px-2.5" aria-label={`Gửi thư cho ${c.email}`} title="Gửi thư mời"><Mail className="h-4 w-4" aria-hidden /></a>
                  <button type="button" disabled={busy} onClick={() => void run(() => onRemove(c.email))} className="btn btn-sm text-rose-700 hover:bg-rose-50" aria-label={`Gỡ quyền của ${c.email}`}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </>
              )}
            </li>
          );
        })}
        {collaborators.length === 0 && <li className="px-3 py-3 text-sm text-ink-3">Chưa chia sẻ với ai.</li>}
      </ul>

      {isOwner ? (
        <form onSubmit={(e) => void submit(e)} noValidate className="space-y-2 rounded-2xl bg-brand-50/60 p-3">
          <label htmlFor="inv-email" className="field-label">Mời giáo viên bằng Gmail</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input id="inv-email" type="email" inputMode="email" autoComplete="off" className="input" value={email} onChange={(e) => { setEmail(e.target.value); setInvited(null); }} placeholder="ten.giaovien@gmail.com" aria-invalid={!!error} />
            <select aria-label="Quyền" value={role} onChange={(e) => setRole(e.target.value as CollabRole)} className="input sm:!w-44">
              <option value="editor">{ROLE_LABEL.editor}</option>
              <option value="viewer">{ROLE_LABEL.viewer}</option>
            </select>
            <button type="submit" disabled={busy} className="btn-primary shrink-0"><UserPlus className="h-4 w-4" aria-hidden /> Mời</button>
          </div>
          <p className="text-xs text-ink-2">{ROLE_HINT[role]}</p>
          {error && <p role="alert" className="text-sm font-bold text-rose-700">{error}</p>}
          {invited && (
            <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Đã chia sẻ cho <b>{invited}</b>. Phần mềm không tự gửi thư; hãy báo cho đồng nghiệp:{' '}
              <a href={mailto(invited)} className="font-bold underline">gửi thư mời bằng email của bạn</a>.
            </p>
          )}
        </form>
      ) : (
        <div className="space-y-2">
          <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Bạn có quyền <b>{access === 'editor' ? ROLE_LABEL.editor : ROLE_LABEL.viewer}</b> với bảng này. Chỉ chủ bảng mời hoặc gỡ quyền người khác.
          </p>
          {error && <p role="alert" className="text-sm font-bold text-rose-700">{error}</p>}
          {!confirmLeave ? (
            <button type="button" onClick={() => setConfirmLeave(true)} className="btn-ghost"><LogOut className="h-4 w-4" aria-hidden /> Rời khỏi bảng này</button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-900">
              Bảng sẽ biến mất khỏi danh sách của bạn; chủ bảng có thể mời lại.
              <button type="button" disabled={busy} onClick={() => void run(onLeave)} className="btn btn-sm bg-rose-600 text-white hover:bg-rose-700">Rời khỏi bảng</button>
              <button type="button" onClick={() => setConfirmLeave(false)} className="btn-ghost btn-sm">Hủy</button>
            </div>
          )}
        </div>
      )}

      <dl className="grid gap-2 text-xs text-ink-2 sm:grid-cols-2">
        {(['editor', 'viewer'] as const).map((r) => (
          <div key={r} className="rounded-xl bg-white p-2 ring-1 ring-brand-100"><dt className="font-extrabold text-ink">{ROLE_LABEL[r]}</dt><dd>{ROLE_HINT[r]}</dd></div>
        ))}
      </dl>
    </div>
  );
}
