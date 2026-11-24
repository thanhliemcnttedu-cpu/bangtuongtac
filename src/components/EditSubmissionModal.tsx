import { useEffect, useState } from 'react';
import type { ClipboardEvent, FormEvent } from 'react';
import { KeyRound, Paperclip, Save, Trash2, X } from 'lucide-react';
import type { Attachment, SubmissionCard } from '../types/board';
import type { CardEditInput } from '../hooks/useBoardStore';
import { MAX_ATTACHMENTS, usePostDraft } from '../hooks/usePostDraft';
import { forgetCode, myCodes, normalizeEditCode } from '../lib/editCode';
import { formatSize } from '../lib/media';
import { ModalShell } from './ModalShell';
import { RichEditor } from './RichEditor';
import { AttachmentPicker } from './attach/AttachmentPicker';

interface Props {
  boardToken: string;
  isClass: boolean;
  /** Mở thẳng bài có mã này (khi bấm từ băng báo "bài cần sửa"). */
  initialCode?: string;
  onFind: (code: string) => Promise<SubmissionCard | null>;
  onFindByName: (name: string) => Promise<SubmissionCard[]>;
  /** Giới hạn dung lượng khi bảng đã nối cổng Drive. */
  limits?: { maxFile: number; maxTotal: number };
  /** del = true: xóa bài. Trả bài sau khi sửa (null nếu đã xóa) hoặc ném lỗi. */
  onSave: (code: string, input: CardEditInput, del: boolean) => Promise<SubmissionCard | null>;
  onDone: (message: string) => void;
  onClose: () => void;
}

const isEditable = (el: EventTarget | null): boolean => el instanceof HTMLElement && el.matches('input, textarea, select, [contenteditable="true"]');

/**
 * Học sinh không đăng nhập: gõ TÊN đã ghi lúc nộp (hoặc mã dự phòng) → sửa chữ, bỏ hoặc thêm tệp, ảnh, liên kết,
 * video, sơ đồ tư duy… như lúc nộp bài mới, hoặc xóa bài của chính mình.
 */
export function EditSubmissionModal({ boardToken, isClass, initialCode, onFind, onFindByName, limits, onSave, onDone, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [choices, setChoices] = useState<SubmissionCard[]>([]);
  const [card, setCard] = useState<SubmissionCard | null>(null);
  const [form, setForm] = useState({ authorName: '', unit: '', title: '', body: '' });
  const [keep, setKeep] = useState<Attachment[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const { draft, addFiles, addLinks, removeFile, removeLink, ingest, attachError } = usePostDraft(
    { authorName: '', unit: '', title: '', body: '', taskId: '', files: [], links: [], location: null, poll: null }, limits);
  const saved = myCodes(boardToken);

  const openCard = (c: SubmissionCard): void => {
    setCard(c); setChoices([]); setError('');
    setForm({ authorName: c.authorName, unit: c.unit, title: c.title, body: c.body });
    setKeep(c.attachments);
  };

  const byCode = async (raw: string): Promise<SubmissionCard | null> => {
    const clean = normalizeEditCode(raw);
    return clean.length >= 10 ? onFind(clean) : null;
  };

  const lookup = async (raw: string): Promise<void> => {
    const text = raw.trim();
    if (text.length < 2) { setError(isClass ? 'Em gõ tên của em nhé.' : 'Vui lòng nhập họ tên đã dùng khi nộp.'); return; }
    setBusy(true); setError('');
    try {
      let list = (await onFindByName(text)).filter((c) => !!c.editCode);
      if (list.length === 0) { const c = await byCode(text); if (c) list = [c]; }
      if (list.length === 0) { setError(isClass ? 'Chưa thấy bài nào của em. Em gõ đúng tên đã ghi lúc nộp bài nhé (có dấu, đúng như lúc nộp).' : 'Chưa thấy sản phẩm nào của bạn. Hãy gõ đúng họ tên đã ghi lúc nộp (có dấu, đúng như lúc nộp).'); return; }
      if (list.length === 1) openCard(list[0]); else setChoices(list);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không mở được bài.'); } finally { setBusy(false); }
  };

  // Mở thẳng từ băng báo "cô nhờ em sửa lại bài".
  useEffect(() => {
    if (!initialCode) return;
    void (async () => { try { const c = await byCode(initialCode); if (c) openCard(c); } catch { /* để học sinh gõ tên */ } })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = keep.length + draft.files.length + draft.links.length;

  const submit = async (ev: FormEvent): Promise<void> => {
    ev.preventDefault();
    if (!card?.editCode) return;
    if (!form.authorName.trim()) { setError(isClass ? 'Em nhớ ghi tên nhé.' : 'Vui lòng nhập họ tên.'); return; }
    if (!form.title.trim()) { setError('Bài cần có tên.'); return; }
    if (total > MAX_ATTACHMENTS) { setError(`Mỗi bài tối đa ${MAX_ATTACHMENTS} đính kèm. ${isClass ? 'Em' : 'Bạn'} bỏ bớt ${total - MAX_ATTACHMENTS} nhé.`); return; }
    setBusy(true); setError('');
    try {
      const next = await onSave(card.editCode, { title: form.title.trim(), body: form.body.trim(), authorName: form.authorName.trim(), unit: form.unit.trim(), keep, files: draft.files, links: draft.links }, false);
      onDone(next?.status === 'pending' ? 'Đã lưu bài sửa. Bài sẽ hiện lại sau khi giáo viên duyệt.' : 'Đã lưu bài sửa.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Không lưu được bài.'); setBusy(false); }
  };

  const remove = async (): Promise<void> => {
    if (!card?.editCode) return;
    setBusy(true); setError('');
    try {
      await onSave(card.editCode, { ...form, keep: [], files: [], links: [] }, true);
      forgetCode(card.editCode);
      onDone(isClass ? 'Đã xóa bài. Em có thể nộp lại bài mới.' : 'Đã xóa sản phẩm. Bạn có thể nộp lại bài mới.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Không xóa được bài.'); setBusy(false); setConfirmDel(false); }
  };

  /** Dán (Ctrl+V): ảnh/tệp thành đính kèm; ngoài ô nhập thì liên kết cũng thành đính kèm. */
  const onPaste = (e: ClipboardEvent<HTMLElement>): void => {
    if (!card) return;
    const files = Array.from(e.clipboardData.files);
    const text = e.clipboardData.getData('text/plain');
    if (files.length > 0) { e.preventDefault(); ingest(files, ''); return; }
    if (!isEditable(e.target) && text) { e.preventDefault(); ingest([], text); }
  };

  const inp = isClass ? 'input !min-h-[50px] !text-base' : 'input';

  if (!card) {
    return (
      <ModalShell title="Sửa bài đã nộp" onClose={onClose} maxWidth="max-w-md">
        <form onSubmit={(e) => { e.preventDefault(); void lookup(query); }} className="space-y-3" noValidate>
          <p className="text-sm text-ink-2">{isClass ? 'Em gõ ' : 'Gõ '}<b>tên đã ghi lúc nộp bài</b> (ví dụ: Loan) để mở lại bài của mình.</p>
          <div>
            <label htmlFor="ec-name" className="field-label flex items-center gap-1.5"><KeyRound className="h-4 w-4" aria-hidden /> {isClass ? 'Tên của em' : 'Họ tên đã dùng khi nộp'}</label>
            <input id="ec-name" className={`${inp} !text-lg`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ví dụ: Loan"
              autoComplete="off" autoFocus />
          </div>
          {choices.length > 0 && (
            <div>
              <p className="text-xs font-bold text-ink-2">Có {choices.length} bài cùng tên. {isClass ? 'Em chọn bài của mình' : 'Hãy chọn đúng bài của bạn'}:</p>
              <ul className="mt-1 space-y-1">
                {choices.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => openCard(c)} className="flex w-full items-center justify-between gap-2 rounded-xl bg-brand-50 px-3 py-2 text-left text-sm hover:bg-brand-100">
                      <span className="truncate font-bold text-ink">{c.title} · {c.unit}</span>
                      <span className="shrink-0 text-xs text-ink-2">{new Date(c.submittedAt).toLocaleString('vi-VN')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {saved.length > 0 && choices.length === 0 && (
            <div>
              <p className="text-xs font-bold text-ink-2">{isClass ? 'Bài em đã nộp trên máy này:' : 'Sản phẩm bạn đã nộp trên máy này:'}</p>
              <ul className="mt-1 space-y-1">
                {saved.map((s) => (
                  <li key={s.code}>
                    <button type="button" onClick={() => { setBusy(true); void byCode(s.code).then((c) => { if (c) openCard(c); else setError('Không mở được bài này nữa (có thể cô đã xóa).'); }).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Không mở được bài.')).finally(() => setBusy(false)); }}
                      className="flex w-full items-center justify-between gap-2 rounded-xl bg-brand-50 px-3 py-2 text-left text-sm hover:bg-brand-100">
                      <span className="truncate font-bold text-ink">{s.title}</span><span className="shrink-0 text-xs text-ink-2">{new Date(s.at).toLocaleDateString('vi-VN')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-ghost">Đóng</button>
            <button type="submit" disabled={busy} className="btn-primary">{busy ? 'Đang tìm…' : isClass ? 'Mở bài của em' : 'Mở sản phẩm của tôi'}</button>
          </div>
        </form>
      </ModalShell>
    );
  }

  return (
    <ModalShell title={isClass ? 'Sửa bài của em' : 'Sửa sản phẩm đã nộp'} onClose={onClose} onPaste={onPaste} maxWidth={isClass ? 'max-w-2xl' : 'max-w-lg'} large={isClass}>
      <form onSubmit={(e) => void submit(e)} className="space-y-3" noValidate>
        <p className="rounded-xl bg-brand-50 px-3 py-2 text-xs text-ink-2">Bài nộp lúc {new Date(card.submittedAt).toLocaleString('vi-VN')}{card.teacherNote ? ` · Lời cô: ${card.teacherNote}` : ''}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label htmlFor="es-name" className="field-label">{isClass ? 'Em tên là gì?' : 'Họ tên'}</label>
            <input id="es-name" className={inp} value={form.authorName} onChange={(e) => setForm({ ...form, authorName: e.target.value })} /></div>
          <div><label htmlFor="es-unit" className="field-label">{isClass ? 'Tổ / lớp' : 'Trường / đơn vị'}</label>
            <input id="es-unit" className={inp} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
        </div>
        <div><label htmlFor="es-title" className="field-label">Tên bài</label>
          <input id="es-title" className={inp} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div><span id="es-body-label" className="field-label block">Nội dung</span>
          <RichEditor labelledBy="es-body-label" value={form.body} onChange={(v) => setForm((f) => ({ ...f, body: v }))} minHeight={96} large={isClass} /></div>

        {keep.length > 0 && (
          <div>
            <p className="field-label">Tệp đã nộp ({keep.length})</p>
            <ul className="space-y-1">
              {keep.map((a, i) => (
                <li key={`k${i}`} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-1.5 text-sm">
                  <Paperclip className="h-4 w-4 shrink-0 text-ink-2" aria-hidden /><span className="min-w-0 flex-1 truncate">{a.label || a.name}</span>
                  {a.size ? <span className="shrink-0 text-xs text-ink-2">{formatSize(a.size)}</span> : null}
                  <button type="button" onClick={() => setKeep(keep.filter((_, j) => j !== i))} className="shrink-0 rounded-full p-1 text-rose-700 hover:bg-rose-50" aria-label={`Bỏ ${a.name}`}><X className="h-4 w-4" aria-hidden /></button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <AttachmentPicker files={draft.files} links={draft.links} poll={null} location={null} onLocation={() => undefined} error={attachError}
          onAddFiles={addFiles} onRemoveFile={removeFile} onAddLinks={addLinks} onRemoveLink={removeLink} onPoll={() => undefined} onIngest={ingest}
          extraCount={keep.length} hideTools={['poll', 'location']} />

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
