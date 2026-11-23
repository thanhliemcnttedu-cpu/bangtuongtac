import { useState } from 'react';
import type { ReactNode } from 'react';
import { ModalShell } from './ModalShell';

interface Props {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  /** Hành động nguy hiểm: nút đỏ. */
  danger?: boolean;
  /** Bắt người dùng gõ đúng chữ này mới cho xác nhận (dùng cho thao tác không hoàn tác được). */
  requireText?: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/** Hộp xác nhận dùng chung cho các thao tác phá hủy: nói rõ hậu quả, nút ghi rõ việc, có thể bắt gõ chữ xác nhận. */
export function ConfirmModal({ title, children, confirmLabel, danger = false, requireText, onConfirm, onClose }: Props) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ok = !requireText || typed.trim().toLowerCase() === requireText.toLowerCase();

  const go = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try { await onConfirm(); } catch (e) { setError(e instanceof Error ? e.message : 'Thao tác không thành công.'); setBusy(false); }
  };

  return (
    <ModalShell title={title} onClose={onClose}>
      <div className="space-y-3 text-sm text-ink-2">{children}</div>
      {requireText && (
        <div className="mt-3">
          <label htmlFor="cf-text" className="field-label">Gõ “{requireText}” để xác nhận</label>
          <input id="cf-text" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm font-bold text-rose-700">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-ghost">Hủy</button>
        <button type="button" disabled={!ok || busy} onClick={() => void go()}
          className={danger ? 'btn bg-rose-600 text-white shadow-soft hover:bg-rose-700' : 'btn-primary'}>
          {busy ? 'Đang thực hiện…' : confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}
