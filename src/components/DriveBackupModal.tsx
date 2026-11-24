import { useMemo, useState } from 'react';
import { Check, CloudUpload, Copy, ExternalLink } from 'lucide-react';
import type { Attachment, BoardData } from '../types/board';
import { gatewayOf, gatewayPing, getDrive, isGatewayUrl, loadDefaultGateway, saveDefaultGateway } from '../lib/drive';
import type { GatewayConfig } from '../lib/drive';
import { buildGatewayScript, newGatewaySecret } from '../lib/driveScript';
import { backupBoardToDrive, pendingFiles } from '../lib/driveBackup';
import type { BackupOptions, BackupProgress, BackupResult } from '../lib/driveBackup';
import { formatSize } from '../lib/media';
import { ModalShell } from './ModalShell';

interface Props {
  board: BoardData;
  /** true = dữ liệu thật (Supabase); false = chế độ mẫu (có thể dùng Drive giả lập). */
  real: boolean;
  /** Ghi cổng vào cài đặt của bảng này (và các bảng khác của giáo viên nếu chọn) để học sinh nộp thẳng vào Drive. */
  onSaveGateway: (cfg: GatewayConfig, allBoards: boolean) => Promise<void>;
  onUpdateAttachments: (cardId: string, attachments: Attachment[]) => Promise<void>;
  onRemoveStored: (attachments: Attachment[]) => Promise<void>;
  onClose: () => void;
}

/**
 * Cổng Google Drive của giáo viên: kết nối một lần (dán mã vào Apps Script, triển khai, dán địa chỉ), sau đó học sinh nộp tệp
 * thẳng vào Drive của giáo viên, và giáo viên có thể sao lưu bảng (JSON gọn) hoặc chuyển tệp cũ từ hệ thống sang Drive.
 */
export function DriveBackupModal({ board, real, onSaveGateway, onUpdateAttachments, onRemoveStored, onClose }: Props) {
  const current = gatewayOf(board.settings);
  const [editing, setEditing] = useState(!current && real);
  const secret = useMemo(() => current?.secret ?? loadDefaultGateway()?.secret ?? newGatewaySecret(), [current]);
  const script = useMemo(() => buildGatewayScript(secret), [secret]);
  const [url, setUrl] = useState('');
  const [allBoards, setAllBoards] = useState(true);
  const [copied, setCopied] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const pending = pendingFiles(board);
  const [opts, setOpts] = useState<BackupOptions>({ saveBoard: true, saveFiles: pending.count > 0, removeAfter: false });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [result, setResult] = useState<BackupResult | null>(null);
  const [error, setError] = useState('');

  const copyScript = async (): Promise<void> => {
    try { await navigator.clipboard.writeText(script); setCopied(true); window.setTimeout(() => setCopied(false), 2500); }
    catch { setError('Trình duyệt không cho sao chép tự động. Hãy bôi đen đoạn mã trong khung rồi nhấn Ctrl+C.'); }
  };

  const connect = async (): Promise<void> => {
    setError('');
    const clean = url.trim();
    if (!isGatewayUrl(clean)) { setError('Địa chỉ chưa đúng. Đó là địa chỉ bắt đầu bằng https://script.google.com/macros/s/ và kết thúc bằng /exec.'); return; }
    setConnecting(true);
    try {
      const cfg: GatewayConfig = { url: clean, secret };
      await gatewayPing(cfg); // thử gọi cổng: sai địa chỉ, sai quyền hoặc chưa triển khai đều báo ngay tại đây
      saveDefaultGateway(cfg);
      await onSaveGateway(cfg, allBoards);
      setEditing(false);
    } catch (e) {
      setError(`${e instanceof Error ? e.message : 'Không kết nối được.'} Hãy kiểm tra lại bước 2 (Ai có quyền truy cập: Bất kỳ ai) rồi thử lại.`);
    } finally { setConnecting(false); }
  };

  const run = async (): Promise<void> => {
    setBusy(true); setError(''); setResult(null);
    try {
      const drive = getDrive(!real, current);
      const res = await backupBoardToDrive(board, drive, opts, setProgress, onRemoveStored);
      for (const u of res.updates) await onUpdateAttachments(u.cardId, u.attachments);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được lên Google Drive.');
    } finally { setBusy(false); }
  };

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <ModalShell title="Google Drive của tôi" onClose={onClose} maxWidth="max-w-2xl" large>
      <div className="space-y-4">
        {!real && !current && !editing && (
          <p className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
            <span>Chế độ thử: đang dùng Google Drive giả lập trong trình duyệt, không đụng tới Drive thật.</span>
            <button type="button" onClick={() => setEditing(true)} className="btn-ghost btn-sm">Kết nối cổng thật</button>
          </p>
        )}

        {editing ? (
          <section aria-label="Kết nối cổng Google Drive" className="space-y-3">
            <p className="text-sm leading-relaxed text-ink-2">
              Làm <b className="text-ink">một lần, khoảng 3 phút</b>. Sau đó học sinh nộp tệp (ảnh, PDF, PowerPoint…) sẽ vào thẳng <b className="text-ink">Drive của bạn</b>, trong thư mục <b className="text-ink">Bảng tương tác lớp học / {board.title}</b>. Không cần Google Cloud.
            </p>

            <div className="rounded-2xl border-2 border-brand-100 p-3">
              <p className="mb-2 font-extrabold"><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-sm text-white">1</span>Sao chép mã này</p>
              <textarea readOnly value={script} rows={5} aria-label="Mã cổng Drive" onFocus={(e) => e.currentTarget.select()} className="input !min-h-0 font-mono !text-xs" />
              <button type="button" onClick={() => void copyScript()} className="btn-primary mt-2 w-full">{copied ? <><Check className="h-4 w-4" aria-hidden /> Đã sao chép</> : <><Copy className="h-4 w-4" aria-hidden /> Sao chép mã</>}</button>
            </div>

            <div className="rounded-2xl border-2 border-brand-100 p-3">
              <p className="mb-2 font-extrabold"><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-sm text-white">2</span>Dán vào Google và triển khai</p>
              <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed">
                <li>Mở <a href="https://script.google.com/home/projects/create" target="_blank" rel="noopener noreferrer" className="font-bold text-brand-700 underline">script.google.com</a> (đăng nhập đúng Gmail của bạn) → <b>Dự án mới</b>.</li>
                <li>Xóa hết chữ trong khung soạn thảo, <b>dán mã</b> vừa sao chép (Ctrl+V), bấm biểu tượng <b>Lưu</b>.</li>
                <li>Bấm nút xanh <b>Triển khai</b> (Deploy) → <b>Lượt triển khai mới</b> (New deployment) → bấm biểu tượng bánh răng, chọn <b>Ứng dụng web</b> (Web app).</li>
                <li>Mục <b>Thực thi với tư cách</b>: chọn <b>Tôi</b>. Mục <b>Ai có quyền truy cập</b>: chọn <b>Bất kỳ ai</b>. Bấm <b>Triển khai</b>.</li>
                <li>Google hỏi quyền: bấm <b>Cho phép truy cập</b> → chọn Gmail của bạn → nếu thấy "Google chưa xác minh ứng dụng" thì bấm <b>Nâng cao</b> → <b>Chuyển tới … (không an toàn)</b> → <b>Cho phép</b>. (Đây là mã của chính bạn.)</li>
                <li>Bấm <b>Sao chép</b> ở dòng <b>URL ứng dụng web</b>.</li>
              </ol>
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900"><b>Đã có cổng cũ?</b> Dán mã mới đè lên mã cũ trong Apps Script, bấm <b>Triển khai → Quản lý lượt triển khai</b> → biểu tượng bút chì → mục <b>Phiên bản</b> chọn <b>Phiên bản mới</b> → <b>Triển khai</b> (Google hỏi cấp thêm quyền thì bấm Cho phép). Địa chỉ giữ nguyên, không cần dán lại. Cần làm vậy để nhận tệp lớn trên 30 MB, gửi email nhắc việc và tải ZIP minh chứng lưu trên Drive (mã cổng phiên bản 4).</p>
            </div>

            <div className="rounded-2xl border-2 border-brand-100 p-3">
              <p className="mb-2 font-extrabold"><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-sm text-white">3</span>Dán địa chỉ vừa sao chép vào đây</p>
              <label htmlFor="gw-url" className="sr-only">Địa chỉ cổng Drive</label>
              <input id="gw-url" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" />
              <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={allBoards} onChange={(e) => setAllBoards(e.target.checked)} className="h-4 w-4" /> Dùng cho mọi bảng của tôi (và các bảng tạo sau)</label>
              <button type="button" onClick={() => void connect()} disabled={connecting || !url.trim()} className="btn-primary mt-2 w-full"><CloudUpload className="h-4 w-4" aria-hidden /> {connecting ? 'Đang thử kết nối…' : 'Kết nối'}</button>
            </div>
            {(current || !real) && <button type="button" onClick={() => setEditing(false)} className="btn-ghost btn-sm">Quay lại</button>}
          </section>
        ) : (
          <>
            {current && (
              <p className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <span><b>Đã kết nối cổng Google Drive.</b> Học sinh nộp tệp sẽ vào thẳng Drive của bạn.</span>
                <button type="button" onClick={() => setEditing(true)} className="btn-ghost btn-sm">Đổi cổng</button>
              </p>
            )}
            <p className="text-sm leading-relaxed text-ink-2">Nút bên dưới sao lưu bảng này (và chuyển tệp cũ đang nằm trong hệ thống) sang thư mục <b className="text-ink">Bảng tương tác lớp học / {board.title}</b> trên Drive của bạn.</p>

            <fieldset className="space-y-2.5">
              <legend className="mb-1 text-base font-extrabold">Lưu gì?</legend>
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-brand-100 p-3 hover:border-brand-300">
                <input type="checkbox" checked={opts.saveBoard} onChange={(e) => setOpts({ ...opts, saveBoard: e.target.checked })} className="mt-1 h-5 w-5" />
                <span><span className="block font-extrabold">Bản sao bảng (tệp JSON gọn)</span><span className="block text-sm text-ink-2">Lớp, bài học, bài tập, danh sách, điểm, nhận xét và {board.cards.length} bài nộp. Chỉ chữ nên rất nhẹ.</span></span>
              </label>
              <label className={`flex items-start gap-3 rounded-2xl border-2 p-3 ${pending.count > 0 ? 'cursor-pointer border-brand-100 hover:border-brand-300' : 'border-slate-100 opacity-60'}`}>
                <input type="checkbox" disabled={pending.count === 0} checked={opts.saveFiles} onChange={(e) => setOpts({ ...opts, saveFiles: e.target.checked, removeAfter: e.target.checked ? opts.removeAfter : false })} className="mt-1 h-5 w-5" />
                <span><span className="block font-extrabold">Tệp bài nộp còn nằm trong hệ thống</span>
                  <span className="block text-sm text-ink-2">{pending.count > 0 ? `${pending.count} tệp${pending.bytes ? `, khoảng ${formatSize(pending.bytes)}` : ''}.` : 'Không còn tệp nào (đã ở trên Drive hoặc bài chỉ có chữ).'}</span></span>
              </label>
              <label className={`flex items-start gap-3 rounded-2xl border-2 p-3 ${opts.saveFiles ? 'cursor-pointer border-rose-100 hover:border-rose-300' : 'border-slate-100 opacity-60'}`}>
                <input type="checkbox" disabled={!opts.saveFiles} checked={opts.removeAfter} onChange={(e) => setOpts({ ...opts, removeAfter: e.target.checked })} className="mt-1 h-5 w-5" />
                <span><span className="block font-extrabold text-rose-800">Chuyển hẳn sang Drive, xóa khỏi hệ thống sau khi lưu</span>
                  <span className="block text-sm text-ink-2">Giải phóng dung lượng hệ thống. Bài nộp vẫn xem được ngay trong trang (xem qua Drive). Khi bạn xóa bài, tệp trên Drive cũng được xóa theo (chuyển vào thùng rác của Drive).</span></span>
              </label>
            </fieldset>

            {busy && progress && (
              <div role="status" aria-live="polite">
                <p className="mb-1 text-sm font-bold">{progress.phase}</p>
                <div className="h-3 overflow-hidden rounded-full bg-brand-100"><div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-teal2-500 transition-all duration-300" style={{ width: `${pct}%` }} /></div>
              </div>
            )}

            {result && (
              <div role="status" className="space-y-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <p className="font-extrabold">Đã lưu xong.</p>
                <ul className="list-inside list-disc">
                  {result.jsonSaved && <li>Bản sao bảng: <b>bang.json</b></li>}
                  <li>Tệp đã chép: <b>{result.filesSaved}</b> ({formatSize(result.bytesSaved)}){result.filesFailed > 0 ? `, lỗi ${result.filesFailed}` : ''}</li>
                  {result.bytesFreed > 0 && <li>Đã giải phóng khỏi hệ thống: <b>{formatSize(result.bytesFreed)}</b></li>}
                </ul>
                {result.errors.length > 0 && <ul className="list-inside list-disc text-rose-800">{result.errors.slice(0, 4).map((m, i) => <li key={i}>{m}</li>)}</ul>}
                {result.folderUrl && !result.folderUrl.startsWith('#') && <a href={result.folderUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm w-fit"><ExternalLink className="h-4 w-4" aria-hidden /> Mở thư mục trên Drive</a>}
              </div>
            )}
          </>
        )}

        {error && <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p>}

        {!editing && (
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost !min-h-[48px]">{result ? 'Đóng' : 'Hủy'}</button>
            <button type="button" onClick={() => void run()} disabled={busy || (!opts.saveBoard && !opts.saveFiles) || (real && !current)} className="btn-primary !min-h-[48px]">
              <CloudUpload className="h-5 w-5" aria-hidden /> {busy ? 'Đang lưu…' : result ? 'Lưu lại lần nữa' : 'Lưu lên Google Drive'}
            </button>
          </div>
        )}
        {editing && !current && <div className="flex justify-end"><button type="button" onClick={onClose} className="btn-ghost">Để sau</button></div>}
      </div>
    </ModalShell>
  );
}
