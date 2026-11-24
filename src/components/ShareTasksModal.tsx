import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, ExternalLink, Link2, RefreshCw, ShieldAlert } from 'lucide-react';
import type { BoardStore } from '../hooks/useBoardStore';
import { newShareKey, shareUrl } from '../lib/taskShare';
import { ModalShell } from './ModalShell';

type Mode = 'off' | 'view' | 'edit';

/**
 * Chia sẻ "Công việc của tôi" bằng link: tắt, chỉ xem, hoặc xem và sửa. Link chỉ cho ĐỌC; việc sửa chỉ làm được sau khi
 * đăng nhập đúng Gmail chủ tài khoản. Tắt chia sẻ hoặc tạo link mới thì link cũ ngừng hoạt động.
 */
export function ShareTasksModal({ store, onClose, onChanged }: { store: BoardStore; onClose: () => void; onChanged: (msg: string) => void }) {
  const board = store.boards.find((b) => b.settings.personal && !b.deletedAt && (b.access ?? 'owner') === 'owner');
  const share = board?.settings.taskShare;
  const mode: Mode = share?.mode ?? 'off';
  const url = share ? shareUrl(share.key) : '';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState('');

  useEffect(() => {
    let alive = true;
    if (!url) { setQr(''); return; }
    QRCode.toDataURL(url, { width: 360, margin: 1, color: { dark: '#0a1730', light: '#ffffff' } }).then((d) => { if (alive) setQr(d); }).catch(() => { if (alive) setQr(''); });
    return () => { alive = false; };
  }, [url]);

  const save = async (next: Mode, regenerate = false): Promise<void> => {
    setBusy(true); setError('');
    try {
      const b = board ?? await store.ensurePersonalBoard();
      const settings = { ...b.settings };
      if (next === 'off') delete settings.taskShare;
      else settings.taskShare = { mode: next, key: regenerate || !b.settings.taskShare ? newShareKey() : b.settings.taskShare.key };
      await store.updateMeta(b.id, { title: b.title, goals: b.goals, settings });
      onChanged(next === 'off' ? 'Đã tắt chia sẻ. Link cũ không còn dùng được.' : regenerate ? 'Đã tạo link mới. Link cũ không còn dùng được.' : next === 'view' ? 'Đã bật chia sẻ chỉ xem.' : 'Đã bật chia sẻ xem và sửa.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Không lưu được cài đặt chia sẻ.'); } finally { setBusy(false); }
  };

  const copy = async (): Promise<void> => {
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 2500); } catch { setError('Không sao chép tự động được. Hãy bôi đen link và sao chép thủ công.'); }
  };

  const opts = useMemo(() => [
    { id: 'off' as Mode, label: 'Không chia sẻ', hint: 'Chỉ mình tôi xem khi đăng nhập.' },
    { id: 'view' as Mode, label: 'Chỉ xem', hint: 'Ai có link đều xem được, kể cả tôi khi mở link. Phù hợp để xem trên máy tính bảng dùng chung, không sợ sửa nhầm.' },
    { id: 'edit' as Mode, label: 'Xem và sửa (khi đăng nhập đúng Gmail của tôi)', hint: 'Người có link chỉ xem. Riêng tôi, đăng nhập đúng Gmail chủ tài khoản thì có nút “Chỉnh sửa” để sửa.' },
  ], []);

  return (
    <ModalShell title="Chia sẻ Công việc của tôi" onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-4">
        {!store.isReal && <p role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">Bản mẫu: chưa nối máy chủ nên link chỉ để minh họa, chưa mở được.</p>}
        <fieldset className="space-y-2">
          <legend className="field-label">Chế độ chia sẻ</legend>
          {opts.map((o) => (
            <label key={o.id} className={`flex cursor-pointer items-start gap-2 rounded-2xl border-2 p-3 transition ${mode === o.id ? 'border-brand-600 bg-brand-50' : 'border-brand-100 hover:border-brand-300'}`}>
              <input type="radio" name="ts-mode" className="mt-1 h-4 w-4 shrink-0 accent-brand-600" checked={mode === o.id} disabled={busy} onChange={() => void save(o.id)} />
              <span className="min-w-0"><span className="block text-sm font-extrabold">{o.label}</span><span className="block text-xs text-ink-2">{o.hint}</span></span>
            </label>
          ))}
        </fieldset>

        {share && (
          <div className="space-y-3 rounded-2xl border border-brand-100 bg-white p-3">
            <div>
              <label htmlFor="ts-url" className="field-label flex items-center gap-1"><Link2 className="h-4 w-4 text-brand-700" aria-hidden /> Link chia sẻ</label>
              <div className="flex flex-wrap gap-2">
                <input id="ts-url" className="input min-w-0 flex-1 basis-60" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
                <button type="button" onClick={() => void copy()} className="btn-primary max-lg:min-h-[44px]">{copied ? <><Check className="h-4 w-4" aria-hidden /> Đã chép</> : <><Copy className="h-4 w-4" aria-hidden /> Sao chép</>}</button>
                <a href={url} target="_blank" rel="noopener noreferrer" className="btn-ghost max-lg:min-h-[44px]"><ExternalLink className="h-4 w-4" aria-hidden /> Mở thử</a>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {qr && <img src={qr} alt="Mã QR của link chia sẻ" className="h-36 w-36 rounded-xl ring-1 ring-brand-100" />}
              <div className="min-w-0 flex-1 space-y-2 text-xs text-ink-2">
                <p>Quét mã QR bằng điện thoại hoặc máy tính bảng để xem ngay.</p>
                <button type="button" disabled={busy} onClick={() => { if (window.confirm('Tạo link mới? Link và mã QR cũ sẽ ngừng hoạt động ngay.')) void save(mode, true); }} className="btn-ghost btn-sm max-lg:!min-h-[44px]"><RefreshCw className="h-3.5 w-3.5" aria-hidden /> Tạo link mới</button>
              </div>
            </div>
          </div>
        )}

        <p className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-900"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>Ai có link đều xem được toàn bộ công việc riêng, ghi chú, đầu việc, kết quả và tệp đính kèm của bạn. Chỉ gửi cho người tin cậy hoặc thiết bị của bạn. Khi không cần nữa, hãy tắt chia sẻ hoặc tạo link mới.</span></p>
        {error && <p role="alert" className="text-sm font-bold text-rose-700">{error}</p>}
        <div className="flex justify-end"><button type="button" onClick={onClose} className="btn-ghost">Đóng</button></div>
      </div>
    </ModalShell>
  );
}
