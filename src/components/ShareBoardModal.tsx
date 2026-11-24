import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, Eye, KeyRound, Lock, Maximize2, PlusCircle, RefreshCw } from 'lucide-react';
import type { BoardAccess, BoardData, CollabRole, LinkMode, ModerationMode } from '../types/board';
import { ModalShell } from './ModalShell';
import { TeacherSharePanel } from './TeacherSharePanel';
import { ModerationPicker } from './ModerationPicker';
import { formatJoinCode } from '../lib/joinCode';

interface Props {
  board: BoardData;
  canManage: boolean;
  onChangeLinkMode: (mode: LinkMode) => void;
  /** Đổi link chia sẻ: link và QR cũ ngừng hoạt động. */
  onRegenerateLink?: () => Promise<void>;
  /** Mã vào lớp 6 số: đổi sang mã mới, bật / tắt việc vào bằng mã. */
  onChangeJoinCode?: () => Promise<void>;
  onToggleJoin?: (enabled: boolean) => Promise<void>;
  onChangeModeration: (mode: ModerationMode) => void;
  onClose: () => void;
  /** Quyền của người đăng nhập với bảng và các thao tác chia sẻ với giáo viên khác. */
  access: BoardAccess;
  myEmail: string;
  initialTab?: 'students' | 'teachers';
  onInvite: (email: string, role: CollabRole) => Promise<void>;
  onChangeRole: (email: string, role: CollabRole) => Promise<void>;
  onRemove: (email: string) => Promise<void>;
  onLeave: () => Promise<void>;
}

const MODES: { id: LinkMode; title: string; desc: string; icon: typeof Eye }[] = [
  { id: 'view', title: 'Chỉ xem', desc: 'Khách và phụ huynh chỉ xem tài liệu và bài đã duyệt, không có nút +.', icon: Eye },
  { id: 'guest_post', title: 'Mở link là nộp bài', desc: 'Bấm + đăng bài ngay, không cần tài khoản hay đăng nhập.', icon: PlusCircle },
  { id: 'locked', title: 'Khóa nộp bài', desc: 'Hết giờ: giữ nguyên bài đã nộp, không nhận thêm.', icon: Lock },
];

export function ShareBoardModal({ board, canManage, onChangeLinkMode, onRegenerateLink, onChangeJoinCode, onToggleJoin, onChangeModeration, onClose, access, myEmail, initialTab = 'students', onInvite, onChangeRole, onRemove, onLeave }: Props) {
  const [tab, setTab] = useState<'students' | 'teachers'>(initialTab);
  const url = `${window.location.origin}/b/${board.shareToken}`;
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [askNew, setAskNew] = useState(false);
  const [newMsg, setNewMsg] = useState('');
  const [big, setBig] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [askNewCode, setAskNewCode] = useState(false);
  const [codeMsg, setCodeMsg] = useState('');
  const joinOn = board.joinEnabled !== false;
  const joinShown = board.joinCode && joinOn ? formatJoinCode(board.joinCode) : '';

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { width: 640, margin: 1, color: { dark: '#0a1730', light: '#ffffff' } })
      .then((data) => { if (alive) setQr(data); })
      .catch(() => { if (alive) setQr(''); });
    return () => { alive = false; };
  }, [url]);

  const copyCode = async (): Promise<void> => {
    if (!board.joinCode) return;
    try { await navigator.clipboard.writeText(board.joinCode); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000); }
    catch { window.prompt('Sao chép mã vào lớp:', board.joinCode ?? ''); }
  };

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Sao chép liên kết:', url);
    }
  };

  /** Tải mã QR về máy: ảnh PNG 1200×1400 có tên bảng ở trên và link ở dưới, in ra dán lớp được ngay. */
  const downloadQr = async (): Promise<void> => {
    const data = await QRCode.toDataURL(url, { width: 1000, margin: 1, color: { dark: '#0a1730', light: '#ffffff' } });
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('qr')); img.src = data; });
    try { await document.fonts.load('700 56px "Be Vietnam Pro"'); } catch { /* dùng phông dự phòng */ }
    const W = 1200; const H = joinShown ? 1545 : 1450;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    if (!g) return;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#0a1730'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '800 58px "Be Vietnam Pro", system-ui, sans-serif';
    const words = board.title.split(' '); const lines: string[] = []; let cur = '';
    for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (g.measureText(t).width > W - 160 && cur) { lines.push(cur); cur = w; } else cur = t; }
    lines.push(cur);
    lines.slice(0, 3).forEach((l, i) => g.fillText(l, W / 2, 110 + i * 72));
    g.drawImage(img, 100, 290, 1000, 1000);
    g.fillStyle = '#1668f2'; g.font = '700 40px "Be Vietnam Pro", system-ui, sans-serif';
    g.fillText('Quét mã để mở bảng và nộp bài', W / 2, 1345);
    g.fillStyle = '#46556e'; g.font = '500 30px "Be Vietnam Pro", system-ui, sans-serif';
    g.fillText(url, W / 2, 1395, W - 120);
    if (joinShown) { g.fillStyle = '#0a1730'; g.font = '800 46px "Be Vietnam Pro", system-ui, sans-serif'; g.fillText(`Hoặc nhập mã vào lớp: ${joinShown}`, W / 2, 1480, W - 120); }
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
    if (!blob) return;
    const slug = board.title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'bang';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `ma-qr-${slug}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  if (big) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-white p-6" role="dialog" aria-modal="true" aria-label="Mã QR toàn màn hình" onClick={() => setBig(false)}>
        <h2 className="text-center text-2xl font-extrabold sm:text-4xl">{board.title}</h2>
        {qr && <img src={qr} alt="Mã QR vào bảng" className="aspect-square w-[min(70vh,86vw)]" />}
        <p className="break-all text-center text-lg font-bold text-brand-700 sm:text-2xl">{url}</p>
        {joinShown && <p className="text-center text-xl font-extrabold sm:text-3xl">Hoặc nhập mã vào lớp: <span className="rounded-2xl bg-brand-50 px-4 py-1 tracking-[0.12em] text-brand-700">{joinShown}</span></p>}
        <p className="text-sm text-ink-2">Bấm bất kỳ đâu để thu nhỏ</p>
      </div>
    );
  }

  return (
    <ModalShell title="Chia sẻ bảng" onClose={onClose} maxWidth="max-w-5xl">
      <div role="tablist" aria-label="Chia sẻ với ai" className="mb-4 grid grid-cols-2 gap-1 rounded-full bg-brand-50 p-1">
        {([['students', 'Học sinh · Link & QR'], ['teachers', `Giáo viên · ${(board.collaborators?.length ?? 0) + 1} người`]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`btn btn-sm !min-h-[40px] max-lg:!min-h-[44px] ${tab === id ? 'bg-white text-brand-700 shadow-soft' : 'text-ink-2'}`}>{label}</button>
        ))}
      </div>
      {tab === 'teachers' && <TeacherSharePanel board={board} access={access} myEmail={myEmail} onInvite={onInvite} onChangeRole={onChangeRole} onRemove={onRemove} onLeave={onLeave} />}
      {tab === 'students' && (
      <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
        <div className="flex flex-col items-center gap-2">
          {/* Rê chuột vào mã QR thì phóng to ngay tại chỗ; bấm vào thì chiếu toàn màn hình. */}
          <button type="button" onClick={() => setBig(true)} aria-label="Phóng to mã QR" title="Rê chuột để phóng to · bấm để chiếu toàn màn hình"
            className="group relative flex aspect-square w-full max-w-[200px] items-center justify-center rounded-2xl border-[1.5px] border-brand-200 bg-white p-2 hover:z-20 focus-visible:z-20">
            {qr ? <img src={qr} alt="Mã QR vào bảng" className="h-full w-full origin-top-left rounded-lg bg-white transition duration-200 ease-out group-hover:scale-[1.9] group-hover:shadow-lift group-hover:ring-4 group-hover:ring-brand-200 group-focus-visible:scale-[1.9]" /> : <span className="text-xs text-ink-3">Đang tạo mã QR…</span>}
          </button>
          <button type="button" onClick={() => setBig(true)} className="btn-ghost btn-sm w-full max-w-[200px]">
            <Maximize2 className="h-3.5 w-3.5" aria-hidden /> Chiếu mã QR lớn
          </button>
          <button type="button" onClick={() => void downloadQr()} disabled={!qr} className="btn-primary btn-sm w-full max-w-[200px]">
            <Download className="h-3.5 w-3.5" aria-hidden /> Tải mã QR về máy
          </button>
        </div>

        <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <div>
            <label htmlFor="share-url" className="field-label">Liên kết của bảng</label>
            <div className="flex gap-2">
              <input id="share-url" readOnly value={url} className="input min-w-0" onFocus={(e) => e.currentTarget.select()} />
              <button type="button" onClick={copy} className="btn-primary shrink-0">
                {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                {copied ? 'Đã chép' : 'Sao chép'}
              </button>
            </div>
            {canManage && onRegenerateLink && (
              <div className="mt-2">
                {!askNew ? (
                  <button type="button" onClick={() => { setNewMsg(''); setAskNew(true); }} className="btn-ghost btn-sm">Đổi link khác (khi link bị lộ)</button>
                ) : (
                  <div role="alertdialog" aria-label="Đổi link" className="rounded-2xl border-[1.5px] border-amber-300 bg-amber-50 p-3 text-sm">
                    <p className="font-extrabold text-amber-900">Đổi sang link mới?</p>
                    <p className="mt-1 text-amber-900">Link và mã QR đang dùng (kể cả QR của từng công việc) sẽ ngừng hoạt động ngay. Bạn cần gửi lại link mới cho mọi người.</p>
                    <div className="mt-2 flex gap-2">
                      <button type="button" className="btn-primary btn-sm" onClick={() => { void onRegenerateLink().then(() => { setAskNew(false); setNewMsg('Đã đổi link. Hãy gửi link mới cho mọi người.'); }).catch((e: unknown) => setNewMsg(e instanceof Error ? e.message : 'Không đổi được link.')); }}>Đổi link</button>
                      <button type="button" className="btn-ghost btn-sm" onClick={() => setAskNew(false)}>Hủy</button>
                    </div>
                  </div>
                )}
                {newMsg && <p role="status" className="mt-1 text-xs font-bold text-emerald-700">{newMsg}</p>}
              </div>
            )}
          </div>

          <fieldset disabled={!canManage} className="space-y-2">
            <legend className="field-label">Quyền của người mở link</legend>
            {MODES.map((m) => {
              const Icon = m.icon;
              const on = board.linkMode === m.id;
              return (
                <label key={m.id} className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3 transition duration-200 ${on ? 'border-brand-600 bg-brand-50' : 'border-brand-100 hover:border-brand-300'}`}>
                  <input type="radio" name="link-mode" className="mt-1 h-4 w-4 accent-brand-600" checked={on} onChange={() => onChangeLinkMode(m.id)} />
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
                  <span>
                    <span className="block text-sm font-extrabold">{m.title}</span>
                    <span className="block text-xs text-ink-2">{m.desc}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>
        </div>
        <div className="min-w-0 space-y-4">
          {board.joinCode && (
            <div className="rounded-2xl border-[1.5px] border-brand-200 bg-brand-50/60 p-3" aria-label="Mã vào lớp">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="field-label !mb-0 inline-flex items-center gap-1.5"><KeyRound className="h-4 w-4 text-brand-700" aria-hidden /> Mã vào lớp (6 số)</span>
                {canManage && onToggleJoin && (
                  <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 text-xs font-extrabold max-lg:min-h-[44px]">
                    <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={joinOn} onChange={(e) => void onToggleJoin(e.target.checked).catch((er: unknown) => setCodeMsg(er instanceof Error ? er.message : 'Không lưu được.'))} />
                    Cho vào bằng mã
                  </label>
                )}
              </div>
              <p className={`my-2 text-center text-4xl font-extrabold tracking-[0.18em] ${joinOn ? 'text-ink' : 'text-ink-3 line-through'}`} aria-label={`Mã vào lớp ${board.joinCode.split('').join(' ')}`}>{formatJoinCode(board.joinCode)}</p>
              {joinOn ? (
                <p className="text-xs text-ink-2">Học sinh mở trang chủ, bấm <b>“Học sinh vào lớp bằng mã”</b> rồi nhập mã này. Mã cũng hiện trên màn hình “Chiếu mã QR lớn”.</p>
              ) : (
                <p className="text-xs font-bold text-amber-800">Đang tắt: học sinh nhập mã sẽ không vào được. Link và mã QR vẫn dùng bình thường.</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => void copyCode()} className="btn-primary btn-sm">
                  {codeCopied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} {codeCopied ? 'Đã chép mã' : 'Sao chép mã'}
                </button>
                {canManage && onChangeJoinCode && !askNewCode && (
                  <button type="button" onClick={() => { setCodeMsg(''); setAskNewCode(true); }} className="btn-ghost btn-sm"><RefreshCw className="h-3.5 w-3.5" aria-hidden /> Đổi mã khác</button>
                )}
              </div>
              {askNewCode && onChangeJoinCode && (
                <div role="alertdialog" aria-label="Đổi mã vào lớp" className="mt-2 rounded-2xl border-[1.5px] border-amber-300 bg-amber-50 p-3 text-sm">
                  <p className="font-extrabold text-amber-900">Đổi sang mã mới?</p>
                  <p className="mt-1 text-amber-900">Mã đang dùng ngừng hoạt động ngay. Học sinh đã vào lớp rồi thì không bị ảnh hưởng.</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="btn-primary btn-sm" onClick={() => { void onChangeJoinCode().then(() => { setAskNewCode(false); setCodeMsg('Đã đổi mã. Hãy báo mã mới cho học sinh.'); }).catch((e: unknown) => setCodeMsg(e instanceof Error ? e.message : 'Không đổi được mã.')); }}>Đổi mã</button>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setAskNewCode(false)}>Hủy</button>
                  </div>
                </div>
              )}
              {codeMsg && <p role="status" className="mt-1 text-xs font-bold text-emerald-700">{codeMsg}</p>}
            </div>
          )}
          <ModerationPicker name="share-moderation" value={board.settings.moderation} disabled={!canManage} onChange={onChangeModeration} />
          <p className="text-xs text-ink-2">Giới hạn chống spam: tối đa 5 bài / 10 phút mỗi trình duyệt.</p>
          {!canManage && <p className="text-xs text-ink-2">Chỉ chủ bảng và đồng quản lý mới đổi được quyền của link.</p>}
        </div>
        </div>
      </div>
      )}
    </ModalShell>
  );
}
