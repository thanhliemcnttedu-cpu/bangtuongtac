import { useState } from 'react';
import { CloudUpload, ExternalLink } from 'lucide-react';
import type { Attachment, BoardData } from '../types/board';
import { GOOGLE_CLIENT_ID, getDrive, requestDriveToken } from '../lib/drive';
import { backupBoardToDrive, pendingFiles } from '../lib/driveBackup';
import type { BackupOptions, BackupProgress, BackupResult } from '../lib/driveBackup';
import { formatSize } from '../lib/media';
import { ModalShell } from './ModalShell';

interface Props {
  board: BoardData;
  /** true = dữ liệu thật (Supabase); false = chế độ mẫu dùng Drive giả lập. */
  real: boolean;
  onUpdateAttachments: (cardId: string, attachments: Attachment[]) => Promise<void>;
  onRemoveStored: (attachments: Attachment[]) => Promise<void>;
  onClose: () => void;
}

/**
 * Lưu bảng lên Google Drive của chính giáo viên: một tệp JSON gọn (bang.json) và thư mục tệp bài nộp.
 * Có thể chọn chuyển hẳn tệp sang Drive để giải phóng dung lượng của hệ thống.
 */
export function DriveBackupModal({ board, real, onUpdateAttachments, onRemoveStored, onClose }: Props) {
  const pending = pendingFiles(board);
  const [opts, setOpts] = useState<BackupOptions>({ saveBoard: true, saveFiles: pending.count > 0, removeAfter: false });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [result, setResult] = useState<BackupResult | null>(null);
  const [error, setError] = useState('');
  const setup = real && !GOOGLE_CLIENT_ID;

  const run = async (): Promise<void> => {
    setBusy(true); setError(''); setResult(null);
    try {
      if (real) await requestDriveToken(); // xin quyền ngay khi bấm để trình duyệt không chặn cửa sổ của Google
      const drive = getDrive(!real);
      const res = await backupBoardToDrive(board, drive, opts, setProgress, onRemoveStored);
      for (const u of res.updates) await onUpdateAttachments(u.cardId, u.attachments);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được lên Google Drive.');
    } finally { setBusy(false); }
  };

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <ModalShell title="Lưu lên Google Drive của tôi" onClose={onClose} maxWidth="max-w-2xl" large>
      <div className="space-y-4">
        {!real && <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">Chế độ thử: đang dùng Google Drive giả lập trong trình duyệt, không đụng tới Drive thật.</p>}
        {setup && (
          <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
            Chưa cấu hình Google Drive cho trang này (thiếu <code>VITE_GOOGLE_CLIENT_ID</code>). Người quản trị làm theo <b>docs/HUONG-DAN-GOOGLE-DRIVE.md</b> rồi triển khai lại.
          </p>
        )}
        <p className="text-sm leading-relaxed text-ink-2">
          Dữ liệu được ghi vào Drive của <b className="text-ink">tài khoản Google bạn đăng nhập</b>, trong thư mục <b className="text-ink">Bảng tương tác lớp học / {board.title}</b>. Ứng dụng chỉ thấy các tệp do chính nó tạo, không đọc được phần còn lại của Drive.
        </p>

        <fieldset className="space-y-2.5">
          <legend className="mb-1 text-base font-extrabold">Lưu gì?</legend>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-brand-100 p-3 hover:border-brand-300">
            <input type="checkbox" checked={opts.saveBoard} onChange={(e) => setOpts({ ...opts, saveBoard: e.target.checked })} className="mt-1 h-5 w-5" />
            <span><span className="block font-extrabold">Bản sao bảng (tệp JSON gọn)</span><span className="block text-sm text-ink-2">Lớp, bài học, bài tập, danh sách, điểm, nhận xét và danh sách bài nộp ({board.cards.length} bài). Chỉ chữ nên rất nhẹ.</span></span>
          </label>
          <label className={`flex items-start gap-3 rounded-2xl border-2 p-3 ${pending.count > 0 ? 'cursor-pointer border-brand-100 hover:border-brand-300' : 'border-slate-100 opacity-60'}`}>
            <input type="checkbox" disabled={pending.count === 0} checked={opts.saveFiles} onChange={(e) => setOpts({ ...opts, saveFiles: e.target.checked, removeAfter: e.target.checked ? opts.removeAfter : false })} className="mt-1 h-5 w-5" />
            <span><span className="block font-extrabold">Tệp bài nộp (ảnh, PDF, PowerPoint…)</span>
              <span className="block text-sm text-ink-2">{pending.count > 0 ? `${pending.count} tệp chưa lưu${pending.bytes ? `, khoảng ${formatSize(pending.bytes)}` : ''}.` : 'Chưa có tệp nào cần lưu (đã lưu hết hoặc bài chỉ có chữ).'}</span></span>
          </label>
          <label className={`flex items-start gap-3 rounded-2xl border-2 p-3 ${opts.saveFiles ? 'cursor-pointer border-rose-100 hover:border-rose-300' : 'border-slate-100 opacity-60'}`}>
            <input type="checkbox" disabled={!opts.saveFiles} checked={opts.removeAfter} onChange={(e) => setOpts({ ...opts, removeAfter: e.target.checked })} className="mt-1 h-5 w-5" />
            <span><span className="block font-extrabold text-rose-800">Chuyển hẳn sang Drive, xóa khỏi hệ thống sau khi lưu</span>
              <span className="block text-sm text-ink-2">Giải phóng dung lượng của hệ thống. Sau đó các tệp chỉ nằm trên Drive của bạn: bài nộp vẫn hiện tên tệp và nút “Mở trên Drive”, nhưng học sinh không xem được nội dung tệp trong trang. Khi bạn xóa bài, tệp trên Drive cũng được xóa theo.</span></span>
          </label>
        </fieldset>

        {busy && progress && (
          <div role="status" aria-live="polite">
            <p className="mb-1 text-sm font-bold">{progress.phase}</p>
            <div className="h-3 overflow-hidden rounded-full bg-brand-100"><div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-teal2-500 transition-all duration-300" style={{ width: `${pct}%` }} /></div>
          </div>
        )}
        {error && <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p>}

        {result && (
          <div role="status" className="space-y-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <p className="font-extrabold">Đã lưu xong.</p>
            <ul className="list-inside list-disc">
              {result.jsonSaved && <li>Bản sao bảng: <b>bang.json</b></li>}
              <li>Tệp đã chép: <b>{result.filesSaved}</b> ({formatSize(result.bytesSaved)}){result.filesFailed > 0 ? `, lỗi ${result.filesFailed}` : ''}</li>
              {result.bytesFreed > 0 && <li>Đã giải phóng khỏi hệ thống: <b>{formatSize(result.bytesFreed)}</b></li>}
            </ul>
            {result.errors.length > 0 && <ul className="list-inside list-disc text-rose-800">{result.errors.slice(0, 4).map((m, i) => <li key={i}>{m}</li>)}</ul>}
            {!real ? <p className="text-xs">Drive giả lập: không có đường dẫn thật.</p> : (
              <a href={result.folderUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm w-fit"><ExternalLink className="h-4 w-4" aria-hidden /> Mở thư mục trên Drive</a>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost !min-h-[48px]">{result ? 'Đóng' : 'Hủy'}</button>
          <button type="button" onClick={() => void run()} disabled={busy || setup || (!opts.saveBoard && !opts.saveFiles)} className="btn-primary !min-h-[48px]">
            <CloudUpload className="h-5 w-5" aria-hidden /> {busy ? 'Đang lưu…' : result ? 'Lưu lại lần nữa' : 'Lưu lên Google Drive'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
