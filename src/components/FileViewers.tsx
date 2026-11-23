import { useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, FileText } from 'lucide-react';
import type { Attachment } from '../types/board';
import { DOC_HUE, DOC_LABEL, docKindOf, formatSize } from '../lib/media';
import type { DocKind } from '../lib/media';
import { safeHref } from '../lib/safeUrl';
import { sanitizeHtml } from '../lib/sanitizeHtml';

/** Tải nội dung về trình duyệt (cùng nguồn hoặc kho công khai có CORS) và trả về Blob; blob: dùng thẳng. */
function useFetchedBlob(url: string | undefined, forceType?: string): { blob: Blob | null; error: boolean } {
  const [state, setState] = useState<{ blob: Blob | null; error: boolean }>({ blob: null, error: false });
  useEffect(() => {
    if (!url) { setState({ blob: null, error: true }); return; }
    let alive = true;
    setState({ blob: null, error: false });
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
      .then((b) => { if (alive) setState({ blob: forceType ? new Blob([b], { type: forceType }) : b, error: false }); })
      .catch(() => { if (alive) setState({ blob: null, error: true }); });
    return () => { alive = false; };
  }, [url, forceType]);
  return state;
}

/** Khi không xem trực tiếp được: thẻ thông tin + nút tải xuống / mở tab mới. */
export function FileFallback({ attachment, kind, note }: { attachment: Attachment; kind: DocKind; note?: string }) {
  const url = safeHref(attachment.url);
  return (
    <div className="flex w-full flex-col items-center gap-3 rounded-3xl p-8 text-center text-white"
      style={{ background: `linear-gradient(135deg, hsl(${DOC_HUE[kind]} 70% 45%), hsl(${(DOC_HUE[kind] + 30) % 360} 65% 35%))` }}>
      <FileText className="h-14 w-14" aria-hidden />
      <p className="max-w-full truncate text-lg font-bold">{attachment.name}</p>
      <p className="text-sm opacity-90">{DOC_LABEL[kind]}{attachment.size ? ` · ${formatSize(attachment.size)}` : ''}</p>
      {note && <p className="max-w-md text-sm opacity-90">{note}</p>}
      {url && (
        <div className="flex flex-wrap justify-center gap-2">
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn bg-white text-ink hover:bg-white/90"><ExternalLink className="h-4 w-4" aria-hidden /> Mở trong tab mới</a>
          <a href={url} download={attachment.name} className="btn bg-white/20 text-white hover:bg-white/30"><Download className="h-4 w-4" aria-hidden /> Tải xuống</a>
        </div>
      )}
    </div>
  );
}

/** PDF: tải về thành blob cùng nguồn rồi nhúng bằng trình xem PDF của trình duyệt (kho tệp chặn nhúng trực tiếp). */
export function PdfViewer({ attachment }: { attachment: Attachment }) {
  const url = safeHref(attachment.url);
  const { blob, error } = useFetchedBlob(url, 'application/pdf');
  const [objectUrl, setObjectUrl] = useState('');
  useEffect(() => {
    if (!blob) { setObjectUrl(''); return; }
    const u = URL.createObjectURL(blob);
    setObjectUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  if (error) return <FileFallback attachment={attachment} kind="pdf" note="Không hiển thị trực tiếp được tệp PDF này." />;
  if (!objectUrl) return <p role="status" className="rounded-3xl bg-brand-50 p-8 text-center text-ink-2">Đang mở PDF…</p>;
  return (
    <div className="space-y-2">
      <iframe src={objectUrl} title={attachment.name} className="viewer-pdf h-[68vh] w-full rounded-3xl border-0 bg-white" />
      <p className="text-center text-xs text-ink-2">Không thấy nội dung? <a className="font-bold text-brand-700 underline" href={objectUrl} target="_blank" rel="noopener noreferrer">Mở PDF trong tab mới</a></p>
    </div>
  );
}

const MAX_TEXT_CHARS = 200_000;
const MAX_CSV_ROWS = 200;
const MAX_CSV_COLS = 20;

/** Đọc CSV đơn giản: dấu phẩy hoặc chấm phẩy, có ngoặc kép. */
export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length && rows.length <= MAX_CSV_ROWS; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.slice(0, MAX_CSV_ROWS + 1);
}

/** Văn bản thuần và CSV: hiện nội dung ngay (giới hạn để không treo trình duyệt). */
export function TextViewer({ attachment, csv }: { attachment: Attachment; csv: boolean }) {
  const { blob, error } = useFetchedBlob(safeHref(attachment.url));
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) { setText(null); return; }
    let alive = true;
    blob.slice(0, MAX_TEXT_CHARS * 2).text().then((t) => { if (alive) setText(t.slice(0, MAX_TEXT_CHARS)); });
    return () => { alive = false; };
  }, [blob]);

  if (error) return <FileFallback attachment={attachment} kind={csv ? 'csv' : 'text'} />;
  if (text === null) return <p role="status" className="rounded-3xl bg-brand-50 p-8 text-center text-ink-2">Đang đọc tệp…</p>;

  if (csv) {
    const rows = parseCsv(text);
    const cols = Math.min(MAX_CSV_COLS, Math.max(0, ...rows.map((r) => r.length)));
    return (
      <div className="viewer-fit max-h-[62vh] overflow-auto rounded-3xl border border-brand-200 bg-white">
        <table className="w-full text-left text-sm">
          <tbody className="divide-y divide-brand-100">
            {rows.map((r, i) => (
              <tr key={i} className={i === 0 ? 'sticky top-0 bg-brand-50 font-bold' : ''}>
                {Array.from({ length: cols }, (_, c) => <td key={c} className="whitespace-nowrap px-3 py-1.5">{r[c] ?? ''}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > MAX_CSV_ROWS && <p className="p-2 text-center text-xs text-ink-2">Chỉ hiển thị {MAX_CSV_ROWS} dòng đầu.</p>}
      </div>
    );
  }
  return <pre className="viewer-fit max-h-[62vh] overflow-auto whitespace-pre-wrap break-words rounded-3xl border border-brand-200 bg-white p-4 text-sm leading-relaxed">{text}</pre>;
}

type Phase<T> = { state: 'loading' } | { state: 'error' } | { state: 'ready'; value: T };

/** Chạy một việc bất đồng bộ (tải + đọc tệp) và theo dõi trạng thái; dừng cập nhật khi đóng trình xem. */
function useAsync<T>(task: (() => Promise<T>) | null, deps: unknown[]): Phase<T> {
  const [phase, setPhase] = useState<Phase<T>>({ state: 'loading' });
  useEffect(() => {
    if (!task) { setPhase({ state: 'error' }); return; }
    let alive = true;
    setPhase({ state: 'loading' });
    task().then((value) => { if (alive) setPhase({ state: 'ready', value }); }).catch(() => { if (alive) setPhase({ state: 'error' }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return phase;
}

async function fetchBuffer(url: string | undefined): Promise<ArrayBuffer> {
  if (!url) throw new Error('no url');
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return r.arrayBuffer();
}

const Loading = ({ what }: { what: string }) => <p role="status" className="rounded-3xl bg-brand-50 p-8 text-center text-ink-2">Đang mở {what}…</p>;

/** Word (.docx): đổi sang HTML bằng mammoth (nạp khi cần), làm sạch rồi hiển thị. */
function DocxViewer({ attachment }: { attachment: Attachment }) {
  const url = safeHref(attachment.url);
  const phase = useAsync(url ? async () => {
    const arrayBuffer = await fetchBuffer(url);
    const mod = await import('mammoth');
    const mammoth = (mod as unknown as { default?: typeof mod }).default ?? mod;
    const result = await mammoth.convertToHtml({ arrayBuffer });
    return sanitizeHtml(result.value);
  } : null, [url]);
  if (phase.state === 'loading') return <Loading what="tài liệu Word" />;
  if (phase.state === 'error') return <FileFallback attachment={attachment} kind="word" note="Không đọc được tệp Word này (có thể bị hỏng hoặc đặt mật khẩu)." />;
  return <div className="doc-html viewer-fit max-h-[66vh] overflow-auto rounded-3xl border border-brand-200 bg-white p-6 text-base" dangerouslySetInnerHTML={{ __html: phase.value || '<p>(Tài liệu trống)</p>' }} />;
}

const MAX_SHEET_ROWS = 300;
const MAX_SHEET_COLS = 30;

function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toLocaleDateString('vi-VN');
  if (typeof v === 'boolean') return v ? 'ĐÚNG' : 'SAI';
  return String(v);
}

/** Excel (.xlsx): đọc mọi trang tính bằng read-excel-file (nạp khi cần), hiện thành bảng có thẻ chuyển trang. */
function XlsxViewer({ attachment }: { attachment: Attachment }) {
  const url = safeHref(attachment.url);
  const [active, setActive] = useState(0);
  const phase = useAsync(url ? async () => {
    const buf = await fetchBuffer(url);
    const mod = await import('read-excel-file/universal');
    return mod.default(buf);
  } : null, [url]);
  if (phase.state === 'loading') return <Loading what="bảng tính Excel" />;
  if (phase.state === 'error') return <FileFallback attachment={attachment} kind="excel" note="Không đọc được tệp Excel này (có thể bị hỏng hoặc đặt mật khẩu)." />;
  const sheets = phase.value;
  const sheet = sheets[Math.min(active, sheets.length - 1)];
  const rows = (sheet?.data ?? []) as unknown[][];
  const cols = Math.min(MAX_SHEET_COLS, Math.max(0, ...rows.map((r) => r.length)));
  return (
    <div className="space-y-2">
      {sheets.length > 1 && (
        <div role="tablist" className="flex flex-wrap gap-1">
          {sheets.map((sh, i) => (
            <button key={sh.sheet + i} type="button" role="tab" aria-selected={i === active} onClick={() => setActive(i)}
              className={`btn btn-sm ${i === active ? 'bg-brand-600 text-white' : 'border-[1.5px] border-brand-200 bg-white text-brand-700'}`}>{sh.sheet}</button>
          ))}
        </div>
      )}
      <div className="viewer-fit max-h-[62vh] overflow-auto rounded-3xl border border-brand-200 bg-white">
        <table className="w-full text-left text-sm">
          <tbody className="divide-y divide-brand-100">
            {rows.slice(0, MAX_SHEET_ROWS).map((r, i) => (
              <tr key={i} className={i === 0 ? 'sticky top-0 bg-brand-50 font-bold' : ''}>
                {Array.from({ length: cols }, (_, c) => <td key={c} className="whitespace-nowrap px-3 py-1.5">{cellText(r[c])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > MAX_SHEET_ROWS && <p className="p-2 text-center text-xs text-ink-2">Chỉ hiển thị {MAX_SHEET_ROWS} dòng đầu.</p>}
        {rows.length === 0 && <p className="p-6 text-center text-ink-2">Trang tính trống.</p>}
      </div>
    </div>
  );
}

/** PowerPoint (.pptx): dựng từng trang chiếu bằng pptx-preview (nạp khi cần), có nút chuyển trang. */
function PptxViewer({ attachment }: { attachment: Attachment }) {
  const url = safeHref(attachment.url);
  const boxRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    const box = boxRef.current;
    if (!box || !url) { setState('error'); return; }
    let alive = true;
    let destroy: (() => void) | null = null;
    setState('loading');
    (async () => {
      const buf = await fetchBuffer(url);
      const { init } = await import('pptx-preview');
      if (!alive) return;
      const width = Math.max(280, box.clientWidth);
      const previewer = init(box, { width, height: Math.round((width * 9) / 16), mode: 'slide' });
      destroy = () => previewer.destroy();
      await previewer.preview(buf);
      if (alive) setState('ready');
    })().catch(() => { if (alive) setState('error'); });
    return () => { alive = false; try { destroy?.(); } catch { /* đã hủy */ } };
  }, [url]);

  if (state === 'error') return <FileFallback attachment={attachment} kind="powerpoint" note="Không đọc được tệp PowerPoint này (có thể bị hỏng hoặc đặt mật khẩu)." />;
  return (
    <div>
      {state === 'loading' && <Loading what="bài trình chiếu" />}
      <div ref={boxRef} className="w-full overflow-hidden rounded-3xl bg-white" aria-label={`Xem trước ${attachment.name}`} />
    </div>
  );
}

/** Word / Excel / PowerPoint: xem trực tiếp bản đời mới; bản cũ (.doc/.xls/.ppt) hiện nút tải xuống. */
export function OfficeViewer({ attachment, kind }: { attachment: Attachment; kind: DocKind }) {
  const ext = attachment.name.match(/\.([A-Za-z0-9]+)$/)?.[1]?.toLowerCase() ?? '';
  const mime = (attachment.mime ?? '').toLowerCase();
  if (kind === 'word' && (ext === 'docx' || mime.includes('wordprocessingml'))) return <DocxViewer attachment={attachment} />;
  if (kind === 'excel' && (ext === 'xlsx' || mime.includes('spreadsheetml'))) return <XlsxViewer attachment={attachment} />;
  if (kind === 'powerpoint' && (ext === 'pptx' || mime.includes('presentationml'))) return <PptxViewer attachment={attachment} />;
  return <FileFallback attachment={attachment} kind={kind} note="Định dạng cũ (.doc, .xls, .ppt) chưa xem trực tiếp được. Hãy tải xuống, hoặc nhờ người nộp lưu lại thành .docx, .xlsx, .pptx." />;
}
