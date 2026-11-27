import { useMemo, useState } from 'react';
import { BellRing, Check, ClipboardCopy, Download, FileSpreadsheet, FileText, Image as ImageIcon, Mail, Printer } from 'lucide-react';
import type { BoardData, TaskItem } from '../types/board';
import { formatDateTime } from '../lib/lessons';
import { buildTaskReport, dueDiffText, printHtml, reportHtml, reportRows, reportText } from '../lib/taskReport';
import { downloadCsv } from '../lib/csv';
import { downloadEvidenceZip } from '../lib/zipEvidence';
import { gatewayMail, gatewayOf } from '../lib/drive';
import type { EvidenceResult } from '../lib/zipEvidence';
import { ModalShell } from './ModalShell';

interface Props {
  board: BoardData;
  task: TaskItem;
  onClose: () => void;
}

const slug = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'cong-viec';

/** Báo cáo ngắn của một công việc: ai đã nộp (sớm / muộn), ai chưa (kèm nút Nhắc), xuất chữ, CSV, PDF và gói minh chứng. */
export function TaskReportModal({ board, task, onClose }: Props) {
  const report = useMemo(() => buildTaskReport(board, task), [board, task]);
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [zipResult, setZipResult] = useState<EvidenceResult | null>(null);
  const [zipError, setZipError] = useState('');
  // Email nhắc: cần cổng Drive v4 và Gmail của người chưa nộp; luôn hỏi lại trước khi gửi vì thư đi từ Gmail của bạn.
  const [mailStep, setMailStep] = useState<'idle' | 'confirm' | 'sending'>('idle');
  const [mailMsg, setMailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const cfg = gatewayOf(board.settings);
  const mailable = report.missing.filter((m) => m.email);

  const copy = async (key: string, text: string): Promise<void> => {
    try { await navigator.clipboard.writeText(text); setCopied(key); window.setTimeout(() => setCopied(''), 1800); } catch { /* không chép được */ }
  };
  const remind = (name: string): string => `Chào ${name}, bạn chưa hoàn thành công việc “${task.label}”${task.dueAt ? ` (hạn ${formatDateTime(task.dueAt)})` : ''}. Bạn mở link sau để nộp giúp mình nhé: ${window.location.origin}/b/${board.shareToken}?task=${encodeURIComponent(task.id)}`;
  const remindAll = `Nhắc cả tổ: còn ${report.missing.length} người chưa hoàn thành “${task.label}”${task.dueAt ? ` (hạn ${formatDateTime(task.dueAt)})` : ''}:\n${report.missing.map((m) => `- ${m.name}`).join('\n')}\nLink nộp: ${window.location.origin}/b/${board.shareToken}?task=${encodeURIComponent(task.id)}`;

  const sendMails = async (): Promise<void> => {
    if (!cfg) return;
    setMailStep('sending'); setMailMsg(null);
    try {
      const link = `${window.location.origin}/b/${board.shareToken}?task=${encodeURIComponent(task.id)}`;
      const r = await gatewayMail(cfg, mailable.map((m) => ({
        to: m.email as string, subject: `Nhắc việc: ${task.label}`,
        body: `Chào ${m.name},

Bạn chưa hoàn thành công việc “${task.label}”${task.dueAt ? ` (hạn ${formatDateTime(task.dueAt)})` : ''}.
Mở link để nộp: ${link}

Cảm ơn bạn.`,
      })));
      setMailMsg({ ok: true, text: `Đã gửi ${r.sent}/${mailable.length} email. Hôm nay còn gửi được khoảng ${r.remaining} email nữa.` });
    } catch (e) { setMailMsg({ ok: false, text: e instanceof Error ? e.message : 'Không gửi được email.' }); }
    setMailStep('idle');
  };

  const zip = async (): Promise<void> => {
    setBusy(true); setZipError(''); setZipResult(null); setProgress('Đang gom minh chứng…');
    try {
      const r = await downloadEvidenceZip(board, task, (d, t) => setProgress(`Đang tải tệp ${d}/${t}…`));
      setZipResult(r);
    } catch (e) { setZipError(e instanceof Error ? e.message : 'Không gói được minh chứng.'); }
    setBusy(false); setProgress('');
  };

  const stat = 'rounded-2xl border-[1.5px] border-brand-100 bg-white px-3 py-2 text-center';
  return (
    <ModalShell title={`Báo cáo: ${task.label}`} onClose={onClose} maxWidth="max-w-4xl">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <p className={stat}><b className="block text-2xl">{report.done.length}/{report.total}</b><span className="text-xs text-ink-2">đã nộp ({report.pct}%)</span></p>
          <p className={stat}><b className="block text-2xl text-rose-700">{report.missing.length}</b><span className="text-xs text-ink-2">chưa nộp</span></p>
          <p className={stat}><b className="block text-2xl text-emerald-700">{report.onTime}</b><span className="text-xs text-ink-2">{task.dueAt ? 'đúng hạn / sớm' : 'đã nộp'}</span></p>
          <p className={stat}><b className="block text-2xl text-orange-700">{report.lateCount}</b><span className="text-xs text-ink-2">nộp muộn</span></p>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={report.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Tỉ lệ đã nộp">
          <div className={`h-full rounded-full ${report.pct === 100 ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${report.pct}%` }} />
        </div>
        {report.total === 0 && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">Bảng chưa có danh sách thành viên. Hãy bấm “Danh sách” để dán danh sách tổ.</p>}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void copy('report', reportText(board, report))} className="btn-ghost btn-sm">{copied === 'report' ? <Check className="h-3.5 w-3.5" aria-hidden /> : <ClipboardCopy className="h-3.5 w-3.5" aria-hidden />} {copied === 'report' ? 'Đã chép báo cáo' : 'Chép báo cáo'}</button>
          <button type="button" onClick={() => downloadCsv(`bao-cao-${slug(task.label)}.csv`, reportRows(board, report))} className="btn-ghost btn-sm"><FileSpreadsheet className="h-3.5 w-3.5" aria-hidden /> Tải CSV</button>
          <button type="button" onClick={() => printHtml(reportHtml(board, report))} className="btn-ghost btn-sm"><Printer className="h-3.5 w-3.5" aria-hidden /> In / lưu PDF (1 trang)</button>
          <button type="button" onClick={() => void zip()} disabled={busy || report.done.length === 0} className="btn-primary btn-sm"><Download className="h-3.5 w-3.5" aria-hidden /> {busy ? progress || 'Đang gói…' : 'Tải tất cả minh chứng (ZIP)'}</button>
        </div>
        {mailStep === 'confirm' && (
          <div className="rounded-2xl border-[1.5px] border-amber-300 bg-amber-50 p-3 text-sm" role="alertdialog" aria-label="Xác nhận gửi email nhắc">
            <p className="font-extrabold text-amber-900">Gửi email nhắc tới {mailable.length} người?</p>
            <p className="mt-1 text-amber-900">Thư đi từ Gmail đã triển khai cổng Drive của bạn, gửi đi rồi không thu hồi được. Google giới hạn khoảng 100 thư mỗi ngày.</p>
            <p className="mt-1 break-words text-xs text-ink-2">{mailable.map((m) => `${m.name} <${m.email}>`).join('; ')}</p>
            <div className="mt-2 flex gap-2"><button type="button" onClick={() => void sendMails()} className="btn-primary btn-sm"><Mail className="h-3.5 w-3.5" aria-hidden /> Gửi {mailable.length} email</button><button type="button" onClick={() => setMailStep('idle')} className="btn-ghost btn-sm">Hủy</button></div>
          </div>
        )}
        {mailMsg && <p role={mailMsg.ok ? 'status' : 'alert'} className={`rounded-xl px-3 py-2 text-sm ${mailMsg.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 font-bold text-rose-700'}`}>{mailMsg.text}</p>}
        {zipResult && (
          <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
            Đã tải gói {zipResult.files} tệp của {zipResult.people} người. Giải nén ra sẽ có thư mục, mỗi tệp tên dạng “01-Họ-tên-minh-chung”.
            {zipResult.skipped.length > 0 && <details className="mt-1"><summary className="cursor-pointer font-bold text-amber-900">{zipResult.skipped.length} tệp chưa đưa vào được</summary><ul className="mt-1 list-disc pl-5 text-xs">{zipResult.skipped.map((s) => <li key={s}>{s}</li>)}</ul></details>}
          </div>
        )}
        {zipError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700" role="alert">{zipError}</p>}

        <section aria-label="Đã nộp">
          <h3 className="mb-1.5 text-sm font-extrabold">Đã nộp ({report.done.length})</h3>
          {report.done.length === 0 ? <p className="text-sm text-ink-2">Chưa có ai nộp.</p> : (
            <ul className="divide-y divide-brand-100 overflow-hidden rounded-2xl border-[1.5px] border-brand-100 bg-white">
              {report.done.map((d) => {
                const img = d.card.attachments.find((a) => a.type === 'image' && a.url && !a.driveId);
                return (
                  <li key={d.member.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-50 text-brand-700">
                      {img ? <img src={img.url} alt="" loading="lazy" className="h-full w-full object-cover" /> : d.card.attachments.length > 0 ? <ImageIcon className="h-5 w-5" aria-hidden /> : <FileText className="h-5 w-5" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{d.member.name}{d.member.role ? <span className="ml-1.5 text-xs font-semibold text-indigo-700">{d.member.role}</span> : null}</span>
                      <span className="block text-xs text-ink-2">{formatDateTime(d.card.submittedAt)}{d.card.resubmittedAt ? ` · nộp lại ${formatDateTime(d.card.resubmittedAt)}` : ''}{d.card.attachments.length > 0 ? ` · ${d.card.attachments.length} tệp` : task.ackOnly ? ' · đã đọc' : ''}</span>
                    </span>
                    <span className={`chip shrink-0 ${d.late ? 'bg-orange-100 text-orange-900 ring-orange-200' : 'bg-emerald-100 text-emerald-900 ring-emerald-200'}`}>{d.late ? 'Muộn' : 'Đúng hạn'}{d.minutesFromDue !== null ? ` · ${dueDiffText(d.minutesFromDue)}` : ''}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-label="Chưa nộp">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold text-rose-700">Chưa nộp ({report.missing.length})</h3>
            {cfg && mailable.length > 0 && <button type="button" disabled={mailStep !== 'idle'} onClick={() => { setMailMsg(null); setMailStep('confirm'); }} className="btn-ghost btn-sm"><Mail className="h-3.5 w-3.5" aria-hidden /> {mailStep === 'sending' ? 'Đang gửi…' : `Gửi email nhắc (${mailable.length})`}</button>}
            {report.missing.length > 0 && <button type="button" onClick={() => void copy('all', remindAll)} className="btn-ghost btn-sm">{copied === 'all' ? <Check className="h-3.5 w-3.5" aria-hidden /> : <BellRing className="h-3.5 w-3.5" aria-hidden />} {copied === 'all' ? 'Đã chép lời nhắc' : 'Nhắc cả nhóm (chép cho Zalo)'}</button>}
          </div>
          {report.missing.length === 0 ? <p className="text-sm font-bold text-emerald-700">Tất cả đã nộp đủ.</p> : (
            <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {report.missing.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50/60 px-3 py-1.5">
                  <span className="min-w-0 truncate text-sm font-semibold text-rose-900">{m.name}{m.role ? <span className="ml-1.5 text-xs font-semibold text-indigo-700">{m.role}</span> : null}</span>
                  <button type="button" onClick={() => void copy(m.id, remind(m.name))} className="btn-ghost btn-sm shrink-0 !min-h-[34px]">{copied === m.id ? <Check className="h-3.5 w-3.5" aria-hidden /> : <BellRing className="h-3.5 w-3.5" aria-hidden />} {copied === m.id ? 'Đã chép' : 'Nhắc'}</button>
                </li>
              ))}
            </ul>
          )}
          {report.outside > 0 && <p className="mt-2 text-xs text-ink-2">Có {report.outside} bài nộp mang tên không có trong danh sách (không tính vào tiến độ).</p>}
        </section>
      </div>
    </ModalShell>
  );
}
