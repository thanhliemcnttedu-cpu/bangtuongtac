import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, KeyRound, X } from 'lucide-react';
import { cleanJoinCode, tokenFromLink } from '../lib/joinCode';

interface Props {
  /** Vào bảng theo mã 6 số; ném lỗi (có câu thông báo) nếu mã không đúng. */
  onJoin: (code: string) => Promise<void>;
  /** Người dùng dán cả link bảng vào ô mã: mở thẳng link đó. */
  onOpenLink: (token: string) => void;
}

/** Nút "Học sinh vào lớp bằng mã" ở trang chủ: bấm ra ô nhập mã 6 số của thầy cô. */
export function JoinByCode({ onJoin, onOpenLink }: Props) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) input.current?.focus(); }, [open]);

  const change = (raw: string): void => {
    setError('');
    const token = tokenFromLink(raw);
    if (token) { onOpenLink(token); return; }
    setCode(cleanJoinCode(raw));
  };

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setError('');
    try { await onJoin(code); }
    catch (err) { setError(err instanceof Error ? err.message : 'Chưa vào được lớp. Em thử lại nhé.'); }
    finally { setBusy(false); }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary !min-h-[56px] w-full text-base" aria-expanded="false">
        <KeyRound className="h-5 w-5" aria-hidden /> Học sinh vào lớp bằng mã
      </button>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="w-full rounded-3xl border-[1.5px] border-brand-200 bg-white p-5 text-left shadow-soft" aria-label="Vào lớp bằng mã">
      <div className="flex items-start justify-between gap-2">
        <label htmlFor="join-code" className="text-lg font-extrabold">Em nhập mã 6 số của cô</label>
        <button type="button" onClick={() => { setOpen(false); setError(''); }} className="btn-ghost btn-sm !min-h-[44px] !min-w-[44px] !px-0" aria-label="Đóng ô nhập mã"><X className="h-4 w-4" aria-hidden /></button>
      </div>
      <p className="mt-1 text-sm text-ink-2">Cô giáo ghi mã trên bảng hoặc gửi trong nhóm lớp. Có thể dán cả đường link của cô vào đây.</p>
      <input id="join-code" ref={input} value={code} onChange={(e) => change(e.target.value)} inputMode="numeric" autoComplete="one-time-code" enterKeyHint="go"
        placeholder="000000" aria-invalid={!!error} aria-describedby={error ? 'join-error' : undefined}
        className="input mt-3 text-center !text-3xl font-extrabold tracking-[0.35em] !min-h-[64px]" />
      {error && <p id="join-error" role="alert" className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p>}
      <button type="submit" disabled={code.length !== 6 || busy} className="btn-primary mt-3 !min-h-[52px] w-full text-base">
        {busy ? 'Đang vào lớp…' : <>Vào lớp <ArrowRight className="h-5 w-5" aria-hidden /></>}
      </button>
    </form>
  );
}
