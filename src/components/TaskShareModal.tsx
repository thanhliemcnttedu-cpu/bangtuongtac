import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download } from 'lucide-react';
import type { BoardData, TaskItem } from '../types/board';
import { formatDateTime } from '../lib/lessons';
import { ModalShell } from './ModalShell';

interface Props {
  board: BoardData;
  task: TaskItem;
  onClose: () => void;
}

/** Link và mã QR riêng của một công việc: thành viên mở là vào thẳng form nộp của việc này. Kèm mẫu tin để dán vào Zalo. */
export function TaskShareModal({ board, task, onClose }: Props) {
  const url = `${window.location.origin}/b/${board.shareToken}?task=${encodeURIComponent(task.id)}`;
  const [qr, setQr] = useState('');
  const [done, setDone] = useState<'link' | 'msg' | ''>('');
  const message = useMemo(() => [
    `📌 ${board.title}`,
    `Việc: ${task.label}`,
    task.dueAt ? `Hạn: ${formatDateTime(task.dueAt)}` : '',
    task.ackOnly ? 'Mở link, chọn tên của mình rồi bấm “Tôi đã đọc”:' : 'Mở link, chọn tên của mình rồi gửi minh chứng:',
    url,
  ].filter(Boolean).join('\n'), [board.title, task, url]);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { width: 640, margin: 1, color: { dark: '#0a1730', light: '#ffffff' } }).then((d) => { if (alive) setQr(d); }).catch(() => { /* không tạo được QR */ });
    return () => { alive = false; };
  }, [url]);

  const copy = async (text: string, which: 'link' | 'msg'): Promise<void> => {
    try { await navigator.clipboard.writeText(text); setDone(which); window.setTimeout(() => setDone(''), 2000); } catch { /* không chép được: tự bôi đen chép tay */ }
  };

  /** Tải ảnh QR có tên việc ở trên để in dán hoặc gửi nhóm. */
  const download = async (): Promise<void> => {
    const data = await QRCode.toDataURL(url, { width: 1000, margin: 1, color: { dark: '#0a1730', light: '#ffffff' } });
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('qr')); img.src = data; });
    const c = document.createElement('canvas');
    c.width = 1200; c.height = 1400;
    const g = c.getContext('2d');
    if (!g) return;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#0a1730'; g.textAlign = 'center';
    g.font = '800 54px "Be Vietnam Pro", system-ui, sans-serif';
    g.fillText(task.label.length > 34 ? `${task.label.slice(0, 33)}…` : task.label, 600, 120);
    g.font = '600 34px "Be Vietnam Pro", system-ui, sans-serif';
    g.fillStyle = '#46556e';
    g.fillText(board.title.length > 46 ? `${board.title.slice(0, 45)}…` : board.title, 600, 180);
    g.drawImage(img, 100, 240, 1000, 1000);
    g.font = '600 28px "Be Vietnam Pro", system-ui, sans-serif';
    g.fillText('Quét mã, chọn tên của mình rồi nộp', 600, 1300);
    const blob: Blob | null = await new Promise((res) => c.toBlob(res, 'image/png'));
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ma-qr-${task.label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'cong-viec'}.png`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  return (
    <ModalShell title="Link và mã QR của công việc" onClose={onClose} maxWidth="max-w-3xl">
      <p className="mb-3 text-sm text-ink-2">Thành viên mở link hoặc quét mã là vào thẳng form nộp của việc <b className="text-ink">{task.label}</b>, không cần đăng nhập.</p>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[220px_1fr]">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-[200px] w-[200px] items-center justify-center rounded-2xl border-[1.5px] border-brand-200 bg-white p-2">
            {qr ? <img src={qr} alt="Mã QR của công việc" className="h-full w-full rounded-lg" /> : <span className="text-xs text-ink-3">Đang tạo mã QR…</span>}
          </div>
          <button type="button" onClick={() => void download()} disabled={!qr} className="btn-primary btn-sm w-full max-w-[200px]"><Download className="h-3.5 w-3.5" aria-hidden /> Tải mã QR về máy</button>
        </div>
        <div className="min-w-0 space-y-3">
          <div>
            <label htmlFor="ts-url" className="field-label">Link công việc</label>
            <div className="flex gap-2">
              <input id="ts-url" readOnly value={url} className="input min-w-0 flex-1 text-base" onFocus={(e) => e.currentTarget.select()} />
              <button type="button" onClick={() => void copy(url, 'link')} className="btn-ghost shrink-0">{done === 'link' ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} {done === 'link' ? 'Đã chép' : 'Chép'}</button>
            </div>
          </div>
          <div>
            <label htmlFor="ts-msg" className="field-label">Tin nhắn mẫu để dán vào Zalo</label>
            <textarea id="ts-msg" readOnly value={message} rows={6} className="input min-h-[140px] py-2 text-base" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" onClick={() => void copy(message, 'msg')} className="btn-ghost btn-sm mt-1.5">{done === 'msg' ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />} {done === 'msg' ? 'Đã chép tin nhắn' : 'Chép tin nhắn'}</button>
          </div>
          {board.linkMode === 'locked' && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">Bảng đang khóa nộp bài nên link này chưa nhận bài. Mở lại ở nút Chia sẻ.</p>}
        </div>
      </div>
    </ModalShell>
  );
}
