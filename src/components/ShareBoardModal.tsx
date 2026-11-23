import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Eye, Lock, Maximize2, PlusCircle } from 'lucide-react';
import type { BoardAccess, BoardData, CollabRole, LinkMode, ModerationMode } from '../types/board';
import { ModalShell } from './ModalShell';
import { TeacherSharePanel } from './TeacherSharePanel';
import { ModerationPicker } from './ModerationPicker';

interface Props {
  board: BoardData;
  canManage: boolean;
  onChangeLinkMode: (mode: LinkMode) => void;
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

export function ShareBoardModal({ board, canManage, onChangeLinkMode, onChangeModeration, onClose, access, myEmail, initialTab = 'students', onInvite, onChangeRole, onRemove, onLeave }: Props) {
  const [tab, setTab] = useState<'students' | 'teachers'>(initialTab);
  const url = `${window.location.origin}/b/${board.shareToken}`;
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [big, setBig] = useState(false);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { width: 640, margin: 1, color: { dark: '#0a1730', light: '#ffffff' } })
      .then((data) => { if (alive) setQr(data); })
      .catch(() => { if (alive) setQr(''); });
    return () => { alive = false; };
  }, [url]);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Sao chép liên kết:', url);
    }
  };

  if (big) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-white p-6" role="dialog" aria-modal="true" aria-label="Mã QR toàn màn hình" onClick={() => setBig(false)}>
        <h2 className="text-center text-2xl font-extrabold sm:text-4xl">{board.title}</h2>
        {qr && <img src={qr} alt="Mã QR vào bảng" className="aspect-square w-[min(70vh,86vw)]" />}
        <p className="break-all text-center text-lg font-bold text-brand-700 sm:text-2xl">{url}</p>
        <p className="text-sm text-ink-2">Bấm bất kỳ đâu để thu nhỏ</p>
      </div>
    );
  }

  return (
    <ModalShell title="Chia sẻ bảng" onClose={onClose} maxWidth="max-w-2xl">
      <div role="tablist" aria-label="Chia sẻ với ai" className="mb-4 grid grid-cols-2 gap-1 rounded-full bg-brand-50 p-1">
        {([['students', 'Học sinh · Link & QR'], ['teachers', `Giáo viên · ${(board.collaborators?.length ?? 0) + 1} người`]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`btn btn-sm !min-h-[40px] ${tab === id ? 'bg-white text-brand-700 shadow-soft' : 'text-ink-2'}`}>{label}</button>
        ))}
      </div>
      {tab === 'teachers' && <TeacherSharePanel board={board} access={access} myEmail={myEmail} onInvite={onInvite} onChangeRole={onChangeRole} onRemove={onRemove} onLeave={onLeave} />}
      {tab === 'students' && (
      <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
        <div className="flex flex-col items-center gap-2">
          <div className="flex aspect-square w-full max-w-[200px] items-center justify-center overflow-hidden rounded-2xl border-[1.5px] border-brand-200 bg-white p-2">
            {qr ? <img src={qr} alt="Mã QR vào bảng" className="h-full w-full" /> : <span className="text-xs text-ink-3">Đang tạo mã QR…</span>}
          </div>
          <button type="button" onClick={() => setBig(true)} className="btn-ghost btn-sm w-full max-w-[200px]">
            <Maximize2 className="h-3.5 w-3.5" aria-hidden /> Chiếu mã QR lớn
          </button>
        </div>

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

          <ModerationPicker name="share-moderation" value={board.settings.moderation} disabled={!canManage} onChange={onChangeModeration} />
          <p className="text-xs text-ink-2">Giới hạn chống spam: tối đa 5 bài / 10 phút mỗi trình duyệt.</p>
          {!canManage && <p className="text-xs text-ink-2">Chỉ chủ bảng và đồng quản lý mới đổi được quyền của link.</p>}
        </div>
      </div>
      )}
    </ModalShell>
  );
}
