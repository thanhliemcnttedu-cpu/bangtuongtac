import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Plus, Trash2, Upload } from 'lucide-react';
import { WEEKDAYS, buildTemplate, draftToEntry, emptyDraft, parseSheet, validateDrafts } from '../lib/timetable';
import type { DraftRow } from '../lib/timetable';
import type { EntryData } from '../lib/scheduleApi';
import { ModalShell } from './ModalShell';

interface Props {
  onImport: (meta: { name: string; schoolYear: string; term: string }, entries: EntryData[]) => Promise<void>;
  onClose: () => void;
}

const defaultYear = (): string => { const d = new Date(); const y = d.getFullYear(); return d.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`; };
const TERMS = ['Học kỳ 1', 'Học kỳ 2', 'Cả năm'];

function save(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Nhập thời khóa biểu từ Excel theo 4 bước: tải mẫu, chọn tệp, XEM TRƯỚC và sửa lỗi (phát hiện thiếu thông tin, tiết trùng), rồi xác nhận.
 * Không tự nhập khi còn lỗi; không tự tạo tiết nào nếu tệp không có dữ liệu.
 */
export function TimetableImport({ onImport, onClose }: Props) {
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [note, setNote] = useState('');
  const [year, setYear] = useState(defaultYear());
  const [term, setTerm] = useState(TERMS[0]);
  const [name, setName] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const issues = useMemo(() => (rows ? validateDrafts(rows) : []), [rows]);
  const errors = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');

  const readFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setError(''); setNote(''); setAck(false);
    if (!/\.xlsx$/i.test(file.name)) { setError('Chỉ đọc được tệp Excel .xlsx. Hãy lưu tệp của bạn dạng “Excel Workbook (.xlsx)” hoặc dùng tệp mẫu.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Tệp quá lớn (trên 5 MB) để là thời khóa biểu.'); return; }
    try {
      const mod = await import('read-excel-file/universal');
      const sheets = await mod.default(await file.arrayBuffer());
      const parsed = sheets.map((s) => ({ sheet: s.sheet, ...parseSheet(s.data as unknown[][]) }));
      const pick = parsed.find((p) => p.headerFound && p.drafts.length > 0) ?? parsed.find((p) => p.drafts.length > 0);
      if (!pick) { setError('Tệp không có dòng dữ liệu nào. Hãy điền vào tệp mẫu (giữ hàng tiêu đề) rồi chọn lại.'); setRows(null); return; }
      setFileName(file.name);
      setRows(pick.drafts);
      setNote(pick.headerFound ? `Đọc trang “${pick.sheet}”: ${pick.drafts.length} dòng.` : `Không thấy hàng tiêu đề (cần cột “Thứ” và “Tiết”); đã đọc theo thứ tự cột của tệp mẫu từ trang “${pick.sheet}”. Hãy kiểm tra kỹ bản xem trước.`);
      setName(`Thời khóa biểu ${TERMS[0]} ${defaultYear()}`);
    } catch { setError('Không đọc được tệp này (có thể bị hỏng hoặc đặt mật khẩu). Hãy thử lưu lại bằng Excel.'); }
  };

  const set = (i: number, patch: Partial<DraftRow>): void => setRows((cur) => (cur ? cur.map((r, j) => (j === i ? { ...r, ...patch, ...(patch.weekday !== undefined ? { rawWeekday: undefined } : {}) } : r)) : cur));
  const confirm = async (): Promise<void> => {
    if (!rows || errors.length > 0) return;
    if (warns.length > 0 && !ack) { setError('Hãy xem các cảnh báo rồi tích “Tôi đã xem cảnh báo, vẫn nhập”.'); return; }
    setBusy(true); setError('');
    try { await onImport({ name: name.trim() || `Thời khóa biểu ${term} ${year}`, schoolYear: year.trim(), term }, rows.map(draftToEntry)); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không nhập được.'); setBusy(false); }
  };

  return (
    <ModalShell title="Nhập thời khóa biểu từ Excel" onClose={onClose} maxWidth="max-w-[min(96vw,1200px)]">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-2xl bg-brand-50/70 p-3">
            <p className="text-sm font-extrabold">1. Tải tệp mẫu</p>
            <p className="mb-2 text-xs text-ink-2">Điền thời khóa biểu vào trang “Thời khóa biểu”, giữ nguyên hàng tiêu đề. Trang “Hướng dẫn” có cách điền từng cột.</p>
            <button type="button" onClick={() => save(buildTemplate(), 'mau-thoi-khoa-bieu.xlsx')} className="btn-ghost max-lg:min-h-[44px]"><Download className="h-4 w-4" aria-hidden /> Tải tệp mẫu .xlsx</button>
          </div>
          <div className="rounded-2xl bg-brand-50/70 p-3">
            <p className="text-sm font-extrabold">2. Chọn tệp đã điền</p>
            <p className="mb-2 text-xs text-ink-2">{fileName ? `Đang xem trước: ${fileName}` : 'Chọn tệp .xlsx. Phần mềm chưa nhập gì cho tới khi bạn xác nhận ở bước 4.'}</p>
            <label className="btn-primary cursor-pointer max-lg:min-h-[44px]"><Upload className="h-4 w-4" aria-hidden /> Chọn tệp Excel
              <input type="file" accept=".xlsx" className="sr-only" onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </div>
        </div>
        {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p>}
        {note && <p role="status" className="rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-900"><FileSpreadsheet className="mr-1 inline h-4 w-4" aria-hidden />{note}</p>}

        {rows && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <b>3. Xem trước và sửa lỗi:</b>
              <span className="chip bg-white text-ink-2 ring-brand-200">{rows.length} dòng</span>
              <span className={`chip ${errors.length > 0 ? 'bg-rose-50 text-rose-800 ring-rose-200' : 'bg-emerald-50 text-emerald-800 ring-emerald-200'}`}>{errors.length > 0 ? <AlertTriangle className="h-3 w-3" aria-hidden /> : <CheckCircle2 className="h-3 w-3" aria-hidden />} {errors.length} lỗi cần sửa</span>
              <span className={`chip ${warns.length > 0 ? 'bg-amber-50 text-amber-900 ring-amber-200' : 'bg-white text-ink-2 ring-brand-200'}`}>{warns.length} cảnh báo</span>
            </div>
            <ul className="max-h-[48vh] space-y-2 overflow-y-auto pr-1" aria-label="Các dòng thời khóa biểu sẽ nhập">
              {rows.map((r, i) => {
                const mine = issues.filter((x) => x.index === i);
                const hasErr = mine.some((x) => x.level === 'error');
                return (
                  <li key={i} className={`rounded-2xl border-[1.5px] bg-white p-2.5 ${hasErr ? 'border-rose-300' : mine.length > 0 ? 'border-amber-300' : 'border-brand-100'}`}>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-[110px_64px_92px_92px_1.3fr_90px_110px_1.6fr_44px]">
                      <label className="text-[11px] font-bold text-ink-3">Thứ<select aria-label={`Thứ, dòng ${i + 1}`} className="input !min-h-[40px]" value={r.weekday ?? ''} onChange={(e) => set(i, { weekday: e.target.value ? Number(e.target.value) : null })}><option value="">Chọn…</option>{WEEKDAYS.map((w, k) => <option key={w} value={k + 1}>{w}</option>)}</select></label>
                      <label className="text-[11px] font-bold text-ink-3">Tiết<input aria-label={`Tiết, dòng ${i + 1}`} className="input !min-h-[40px]" inputMode="numeric" value={r.period ?? ''} onChange={(e) => set(i, { period: e.target.value.trim() === '' ? null : Number(e.target.value.replace(/\D/g, '')) || null })} /></label>
                      <label className="text-[11px] font-bold text-ink-3">Bắt đầu<input aria-label={`Giờ bắt đầu, dòng ${i + 1}`} className="input !min-h-[40px]" value={r.startTime} onChange={(e) => set(i, { startTime: e.target.value })} placeholder="07:30" /></label>
                      <label className="text-[11px] font-bold text-ink-3">Kết thúc<input aria-label={`Giờ kết thúc, dòng ${i + 1}`} className="input !min-h-[40px]" value={r.endTime} onChange={(e) => set(i, { endTime: e.target.value })} placeholder="08:05" /></label>
                      <label className="col-span-2 text-[11px] font-bold text-ink-3 sm:col-span-1">Môn học<input aria-label={`Môn học, dòng ${i + 1}`} className="input !min-h-[40px]" value={r.subject} onChange={(e) => set(i, { subject: e.target.value })} /></label>
                      <label className="text-[11px] font-bold text-ink-3">Lớp<input aria-label={`Lớp, dòng ${i + 1}`} className="input !min-h-[40px]" value={r.className} onChange={(e) => set(i, { className: e.target.value })} /></label>
                      <label className="text-[11px] font-bold text-ink-3">Phòng<input aria-label={`Phòng, dòng ${i + 1}`} className="input !min-h-[40px]" value={r.room} onChange={(e) => set(i, { room: e.target.value })} /></label>
                      <label className="col-span-2 text-[11px] font-bold text-ink-3 sm:col-span-2 lg:col-span-1">Nội dung bài dạy<input aria-label={`Nội dung, dòng ${i + 1}`} className="input !min-h-[40px]" value={r.topic} onChange={(e) => set(i, { topic: e.target.value })} /></label>
                      <button type="button" onClick={() => setRows((cur) => (cur ? cur.filter((_, j) => j !== i) : cur))} aria-label={`Bỏ dòng ${rows[i].src > 0 ? rows[i].src : i + 1}`} className="btn-ghost !px-2 self-end max-lg:!min-h-[44px] hover:!border-rose-300 hover:!text-rose-700"><Trash2 className="h-4 w-4" aria-hidden /></button>
                    </div>
                    {mine.length > 0 && <ul className="mt-1.5 space-y-0.5">{mine.map((x, k) => <li key={k} className={`text-xs font-bold ${x.level === 'error' ? 'text-rose-700' : 'text-amber-800'}`}>{x.level === 'error' ? '✖' : '⚠'} {rows[i].src > 0 ? `Dòng ${rows[i].src}: ` : ''}{x.message}</li>)}</ul>}
                  </li>
                );
              })}
            </ul>
            <button type="button" onClick={() => setRows((cur) => [...(cur ?? []), emptyDraft()])} className="btn-ghost max-lg:min-h-[44px]"><Plus className="h-4 w-4" aria-hidden /> Thêm dòng</button>

            <div className="rounded-2xl bg-brand-50/70 p-3">
              <p className="mb-2 text-sm font-extrabold">4. Xác nhận nhập</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div><label htmlFor="ti-year" className="field-label">Năm học</label><input id="ti-year" className="input" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026-2027" /></div>
                <div><label htmlFor="ti-term" className="field-label">Học kỳ</label><select id="ti-term" className="input" value={term} onChange={(e) => setTerm(e.target.value)}>{TERMS.map((t) => <option key={t}>{t}</option>)}</select></div>
                <div><label htmlFor="ti-name" className="field-label">Tên thời khóa biểu</label><input id="ti-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
              </div>
              {warns.length > 0 && errors.length === 0 && <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={ack} onChange={(e) => setAck(e.target.checked)} /> Tôi đã xem cảnh báo (trùng tiết, thiếu lớp…), vẫn nhập</label>}
              <p className="mt-2 text-xs text-ink-2">Thời khóa biểu mới trở thành bản đang dùng; các bản cũ vẫn được giữ lại và chuyển qua lại được.</p>
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={onClose} className="btn-ghost max-lg:min-h-[44px]">Hủy</button>
                <button type="button" onClick={() => void confirm()} disabled={busy || errors.length > 0 || rows.length === 0} className="btn-primary max-lg:min-h-[44px]">{busy ? 'Đang nhập…' : errors.length > 0 ? `Còn ${errors.length} lỗi, chưa nhập được` : `Nhập ${rows.length} tiết`}</button>
              </div>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
}
