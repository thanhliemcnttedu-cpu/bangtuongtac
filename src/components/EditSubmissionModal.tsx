import { useState } from 'react';
import type { FormEvent } from 'react';
import { KeyRound, Link2, Paperclip, Save, Trash2, X } from 'lucide-react';
import type { Attachment, SubmissionCard } from '../types/board';
import type { CardEditInput } from '../hooks/useBoardStore';
import { forgetCode, formatEditCode, myCodes, normalizeEditCode } from '../lib/editCode';
import { formatSize } from '../lib/media';
import { ModalShell } from './ModalShell';

interface Props {
  boardToken: string;
  isClass: boolean;
  onFind: (code: string) => Promise<SubmissionCard | null>;
  /** del = true: xóa bài. Trả bài sau khi sửa (null nếu đã xóa) hoặc ném lỗi. */
  onSave: (code: string, input: CardEditInput, del: boolean) => Promise<SubmissionCard | null>;
  onDone: (message: string) => void;
  onClose: () => void;
}

const MAX_ATTACH = 10;

/** Học sinh không đăng nhập: nhập mã sửa bài → sửa chữ, bỏ hoặc thêm tệp/liên kết, hoặc xóa bài của chính mình. */
export function EditSubmissionModal({ boardToken, isClass, onFind, onSave, onDone, onClose }: Props) {
  const [code, setCode] = useState('');
  const [card, setCard] = useState<SubmissionCard | null>(null);
  const [form, setForm] = useState({ authorName: '', unit: '', title: '', body: '' });
  const [keep, setKeep] = useState<Attachment[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState<string[]>([]);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const saved = myCodes(boardToken);

  const open = async (raw: string): Promise<void> => {
    const clean = normalizeEditCode(raw);
    if (clean.length < 10) { setError('Mã sửa bài gồm 10 chữ và số (ví dụ ABCDE-FGHJK).'); return; }
    setBusy(true); setError('');
    try {
      const found = await onFind(clean);
      if (!found) { setError('Mã này không khớp bài nào. Em kiểm tra lại từng ký tự nhé.'); return; }
      setCard(found);
      setCode(clean);
      setForm({ authorName: found.authorName, unit: found.unit, title: found.title, body: found.body });
      setKeep(found.attachments);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không mở được bài.'); } finally { setBusy(false); }
  };

  const total = keep.length + files.length + links.length;

  const addLink = (): void => {
    const v = link.trim();
    if (!v) return;
    if (total >= MAX_ATTACH) { setError(`Mỗi bài tối đa ${MAX_ATTACH} đính kèm.`); return; }
    setLinks((l) => [...l, v]); setLink(''); setError('');
  };

  const submit = async (ev: FormEvent): Promise<void> => {
    ev.preventDefault();
    if (!form.authorName.trim()) { setError(isClass ? 'Em nhớ ghi tên nhé.' : 'Vui lòng nhập họ tên.'); return; }
    if (!form.title.trim()) { setError('Bài cần có tên.'); return; }
    setBusy(true); setError('');
    try {
      const next = await onSave(code, { title: form.title.trim(), body: form.body.trim(), authorName: form.authorName.trim(), unit: form.unit.trim(), keep, files, links }, false);
      onDone(next?.status === 'pending' ? 'Đã lưu bài sửa. Bài sẽ hiện lại sau khi giáo viên duyệt.' : 'Đã lưu bài sửa.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Không lưu được bài.'); setBusy(false); }
  };

  const remove = async (): Promise<void> => {
    setBusy(true); setError('');
    try {
      await onSave(code, { ...form, keep: [], files: [], links: [] }, true);
      forgetCode(code);
      onDone('Đã xóa bài. Em có thể nộp lại bài mới.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Không xóa được bài.'); setBusy(false); setConfirmDel(false); }
  };

  const inp = isClass ? 'input !min-h-[50px] !text-base' : 'input';

  if (!card) {
    return (
      <ModalShell title="Sửa bài đã nộp" onClose={onClose} maxWidth="max-w-md">
        <form onSubmit={(e) => { e.preventDefault(); void open(code); }} className="space-y-3" noValidate>
          <p className="text-sm text-ink-2">Nhập <b>mã sửa bài</b> mà em nhận được lúc nộp. Chỉ người có mã mới sửa hoặc xóa được bài đó.</p>
          <div>
            <label htmlFor="ec-code" className="field-label flex items-center gap-1.5"><KeyRound className="h-4 w-4" aria-hidden /> Mã sửa bài</label>
            <input id="ec-code" className={`${inp} font-mono text-lg uppercase tracking-widest`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCDE-FGHJK"
              autoComplete="off" autoCapitalize="characters" spellCheck={false} autoFocus />
          </div>
          {saved.length > 0 && (
            <div>
              <p className="text-xs font-bold text-ink-2">Bài em đã nộp trên máy này:</p>
              <ul className="mt-1 space-y-1">
                {saved.map((s) => (
                  <li key={s.code}>
                    <button type="button" onClick={() => { setCode(s.code); void open(s.code); }} className="flex w-full items-center justify-between gap-2 rounded-xl bg-brand-50 px-3 py-2 text-left text-sm hover:bg-brand-100">
                      <span className="truncate font-bold text-ink">{s.title}</span><span className="shrink-0 font-mono text-xs text-ink-2">{formatEditCode(s.code)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-ghost">Đóng</button>
            <button type="submit" disabled={busy} className="btn-primary">{busy ? 'Đang mở…' : 'Mở bài của em'}</button>
          </div>
        </form>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="Sửa bài của em" onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={(e) => void submit(e)} className="space-y-3" noValidate>
        <p className="rounded-xl bg-brand-50 px-3 py-2 text-xs text-ink-2">Mã <span className="font-mono font-bold text-ink">{formatEditCode(code)}</span> · bài nộp lúc {new Date(card.submittedAt).toLocaleString('vi-VN')}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label htmlFor="es-name" className="field-label">{isClass ? 'Em tên là gì?' : 'Họ tên'}</label>
            <input id="es-name" className={inp} value={form.authorName} onChange={(e) => setForm({ ...form, authorName: e.target.value })} /></div>
          <div><label htmlFor="es-unit" className="field-label">{isClass ? 'Tổ / lớp' : 'Trường / đơn vị'}</label>
            <input id="es-unit" className={inp} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
        </div>
        <div><label htmlFor="es-title" className="field-label">Tên bài</label>
          <input id="es-title" className={inp} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div><label htmlFor="es-body" className="field-label">Nội dung</label>
          <textarea id="es-body" className={`${inp} min-h-[90px] py-2`} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>

        <div>
          <p className="field-label">Tệp và liên kết đính kèm ({total}/{MAX_ATTACH})</p>
          <ul className="space-y-1">
            {keep.map((a, i) => (
              <li key={`k${i}`} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-1.5 text-sm">
                <Paperclip className="h-4 w-4 shrink-0 text-ink-2" aria-hidden /><span className="min-w-0 flex-1 truncate">{a.label || a.name}</span>
                {a.size ? <span className="shrink-0 text-xs text-ink-2">{formatSize(a.size)}</span> : null}
                <button type="button" onClick={() => setKeep(keep.filter((_, j) => j !== i))} className="shrink-0 rounded-full p-1 text-rose-700 hover:bg-rose-50" aria-label={`Bỏ ${a.name}`}><X className="h-4 w-4" aria-hidden /></button>
              </li>
            ))}
            {files.map((f, i) => (
              <li key={`f${i}`} className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-1.5 text-sm">
                <Paperclip className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden /><span className="min-w-0 flex-1 truncate">{f.name} <span className="text-xs text-ink-2">(mới)</span></span>
                <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="shrink-0 rounded-full p-1 text-rose-700 hover:bg-rose-50" aria-label={`Bỏ ${f.name}`}><X className="h-4 w-4" aria-hidden /></button>
              </li>
            ))}
            {links.map((l, i) => (
              <li key={`l${i}`} className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-1.5 text-sm">
                <Link2 className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden /><span className="min-w-0 flex-1 truncate">{l} <span className="text-xs text-ink-2">(mới)</span></span>
                <button type="button" onClick={() => setLinks(links.filter((_, j) => j !== i))} className="shrink-0 rounded-full p-1 text-rose-700 hover:bg-rose-50" aria-label="Bỏ liên kết"><X className="h-4 w-4" aria-hidden /></button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="btn-ghost cursor-pointer !min-h-[40px] text-sm">
              <Paperclip className="h-4 w-4" aria-hidden /> Thêm tệp
              <input type="file" multiple className="sr-only" onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                e.target.value = '';
                if (total + picked.length > MAX_ATTACH) { setError(`Mỗi bài tối đa ${MAX_ATTACH} đính kèm.`); return; }
                setFiles((f) => [...f, ...picked]); setError('');
              }} />
            </label>
            <input className="input !min-h-[40px] min-w-0 flex-1 text-sm" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Dán liên kết rồi bấm Thêm"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }} aria-label="Liên kết mới" />
            <button type="button" onClick={addLink} className="btn-ghost !min-h-[40px] text-sm">Thêm</button>
          </div>
        </div>

        <p className="text-xs text-ink-2">Nếu bảng đang kiểm duyệt, bài sau khi sửa có thể cần giáo viên duyệt lại.</p>
        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700" role="alert">{error}</p>}

        {confirmDel ? (
          <div className="space-y-2 rounded-2xl border border-rose-200 bg-rose-50 p-3">
            <p className="text-sm font-bold text-rose-800">Xóa hẳn bài này? Điểm và nhận xét của giáo viên cũng mất, không khôi phục được.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDel(false)} className="btn-ghost">Không xóa</button>
              <button type="button" disabled={busy} onClick={() => void remove()} className="btn-primary !bg-rose-600"><Trash2 className="h-4 w-4" aria-hidden /> {busy ? 'Đang xóa…' : 'Xóa bài'}</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap justify-between gap-2 pt-1">
            <button type="button" onClick={() => setConfirmDel(true)} className="btn-ghost text-rose-700"><Trash2 className="h-4 w-4" aria-hidden /> Xóa bài</button>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="btn-ghost">Hủy</button>
              <button type="submit" disabled={busy} className="btn-primary"><Save className="h-4 w-4" aria-hidden /> {busy ? 'Đang lưu…' : 'Lưu bài sửa'}</button>
            </div>
          </div>
        )}
      </form>
    </ModalShell>
  );
}
