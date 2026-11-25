import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ClipboardEvent, FormEvent } from 'react';
import { Download, FileText, FolderOpen, Link2, Loader2, Paperclip, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import type { Attachment } from '../types/board';
import type { BoardStore } from '../hooks/useBoardStore';
import { formatSize, nameClipboardFile } from '../lib/media';
import * as api from '../lib/profileApi';
import type { ProfileDoc, ProfileDocData } from '../lib/profileApi';
import { ModalShell } from './ModalShell';
import { TaskDocs } from './TaskDocs';

/** Năm học hiện tại, ví dụ tháng 11/2026 → "2026-2027"; từ tháng 8 là năm học mới. */
function currentYear(d = new Date()): string { const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${y + 1}`; }
const today = (): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtDate = (s: string): string => (s ? s.split('-').reverse().join('/') : '');

/** Thêm hoặc sửa một hồ sơ; một hồ sơ có nhiều tệp hoặc liên kết, dán được ảnh bằng Ctrl + V. */
function DocForm({ store, boardId, doc, onSave, onDelete, onClose }: {
  store: BoardStore; boardId: string; doc?: ProfileDoc;
  onSave: (data: ProfileDocData) => Promise<void>; onDelete?: () => Promise<void>; onClose: () => void;
}) {
  const [title, setTitle] = useState(doc?.title ?? '');
  const [category, setCategory] = useState(doc?.category ?? 'ke_hoach');
  const [year, setYear] = useState(doc?.schoolYear ?? currentYear());
  const [date, setDate] = useState(doc ? doc.docDate : today());
  const [tags, setTags] = useState(doc?.tags.join(', ') ?? '');
  const [desc, setDesc] = useState(doc?.description ?? '');
  const [keep, setKeep] = useState<Attachment[]>(doc?.attachments ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const onPaste = (e: ClipboardEvent<HTMLElement>): void => {
    const got = Array.from(e.clipboardData.files);
    if (got.length === 0) return;
    e.preventDefault();
    setFiles((f) => [...f, ...got.map(nameClipboardFile)]);
  };
  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!title.trim()) { setError('Hãy nhập tên hồ sơ.'); document.getElementById('pf-title')?.focus(); return; }
    setBusy(true); setError('');
    try {
      const catLabel = api.categoryLabel(category);
      const linkList = links.split(/\r?\n|\s{2,}/).map((x) => x.trim()).filter(Boolean);
      const added = files.length + linkList.length > 0 ? await store.prepareFiles(boardId, files, linkList, `Hồ sơ - ${catLabel}`) : [];
      const tagList = [...new Set(tags.split(/[,;\n]/).map((t) => t.trim()).filter(Boolean))];
      await onSave({ title: title.trim(), category, schoolYear: year.trim(), docDate: date, tags: tagList, description: desc.trim(), attachments: [...keep, ...added] });
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'Không lưu được.'); setBusy(false); }
  };
  const row = (a: Attachment, label: string, drop: () => void, key: string) => (
    <li key={key} className="flex items-center gap-2 rounded-xl bg-white px-2 py-1.5 text-sm ring-1 ring-brand-100">
      {a.type === 'link' || a.type === 'embed' ? <Link2 className="h-4 w-4 shrink-0 text-brand-700" aria-hidden /> : <FileText className="h-4 w-4 shrink-0 text-brand-700" aria-hidden />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <button type="button" onClick={drop} aria-label={`Bỏ ${label}`} className="rounded-full p-1.5 text-ink-2 hover:bg-rose-50 hover:text-rose-700 max-lg:p-3"><X className="h-4 w-4" aria-hidden /></button>
    </li>
  );

  return (
    <ModalShell title={doc ? 'Sửa hồ sơ' : 'Thêm hồ sơ'} onClose={onClose} maxWidth="max-w-3xl" onPaste={onPaste}>
      <form onSubmit={(e) => void submit(e)} noValidate className="grid grid-cols-1 gap-x-6 gap-y-3 lg:grid-cols-2">
        <div className="min-w-0 space-y-3">
          <div><label htmlFor="pf-title" className="field-label">Tên hồ sơ *</label><input id="pf-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="Kế hoạch giáo dục môn Tin học lớp 4" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0"><label htmlFor="pf-cat" className="field-label">Nhóm</label><select id="pf-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>{api.PROFILE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
            <div className="min-w-0"><label htmlFor="pf-year" className="field-label">Năm học</label><input id="pf-year" className="input" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026-2027" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0"><label htmlFor="pf-date" className="field-label">Ngày của tài liệu</label><input id="pf-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="min-w-0"><label htmlFor="pf-tags" className="field-label">Thẻ <span className="font-normal text-ink-2">(ngăn bằng dấu phẩy)</span></label><input id="pf-tags" className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tin học, lớp 4" /></div>
          </div>
          <div><label htmlFor="pf-desc" className="field-label">Ghi chú</label><textarea id="pf-desc" className="input min-h-[72px] py-2" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
        </div>
        <fieldset className="min-w-0 space-y-2 rounded-2xl border border-brand-100 p-3">
          <legend className="field-label flex items-center gap-1 px-1"><Paperclip className="h-4 w-4 text-brand-700" aria-hidden /> Tệp và liên kết</legend>
          {(keep.length > 0 || files.length > 0) && (
            <ul className="space-y-1">
              {keep.map((a, i) => row(a, a.label || a.name, () => setKeep(keep.filter((_, j) => j !== i)), `k${i}`))}
              {files.map((f, i) => row({ type: 'file', name: f.name }, `${f.name} (${formatSize(f.size)})`, () => setFiles(files.filter((_, j) => j !== i)), `f${i}`))}
            </ul>
          )}
          <label className="btn-ghost btn-sm cursor-pointer max-lg:min-h-[44px]"><Paperclip className="h-3.5 w-3.5" aria-hidden /> Tải tệp lên
            <input type="file" multiple className="sr-only" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*" onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }} />
          </label>
          <p className="text-xs text-ink-2">Có thể nhấn Ctrl + V (Windows + V) để dán ảnh. Tệp đi vào Drive của bạn nếu bảng việc riêng đã nối cổng Drive.</p>
          <div><label htmlFor="pf-links" className="field-label flex items-center gap-1"><Link2 className="h-4 w-4 text-brand-700" aria-hidden /> Liên kết <span className="font-normal text-ink-2">(mỗi dòng một link)</span></label><textarea id="pf-links" className="input min-h-[56px] py-2" value={links} onChange={(e) => setLinks(e.target.value)} placeholder="https://drive.google.com/…" /></div>
        </fieldset>
        {error && <p role="alert" className="text-sm font-bold text-rose-700 lg:col-span-2">{error}</p>}
        <div className="flex flex-wrap justify-between gap-2 lg:col-span-2">
          {doc && onDelete ? <button type="button" disabled={busy} onClick={() => { if (window.confirm('Xóa hồ sơ này? Tệp đã tải lên không bị xóa khỏi nơi lưu.')) void onDelete().then(onClose).catch((x) => setError(x instanceof Error ? x.message : 'Không xóa được.')); }} className="btn-ghost hover:!border-rose-300 hover:!text-rose-700 max-lg:min-h-[44px]"><Trash2 className="h-4 w-4" aria-hidden /> Xóa hồ sơ</button> : <span />}
          <span className="flex gap-2"><button type="button" onClick={onClose} className="btn-ghost max-lg:min-h-[44px]">Hủy</button><button type="submit" disabled={busy} className="btn-primary max-lg:min-h-[44px]">{busy ? 'Đang lưu…' : 'Lưu'}</button></span>
        </div>
      </form>
    </ModalShell>
  );
}

/** Trang "Hồ sơ": kho hồ sơ chuyên môn cá nhân, tìm theo chữ, lọc theo nhóm và năm học, xem tệp ngay trong trang, xuất mục lục ra Excel. */
export function ProfilePage({ store }: { store: BoardStore }) {
  const personal = store.boards.find((b) => b.settings.personal && !b.deletedAt && (b.access ?? 'owner') === 'owner');
  const boardId = personal?.id ?? null;
  const [docs, setDocs] = useState<ProfileDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState<{ doc?: ProfileDoc } | null>(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [year, setYear] = useState('all');

  const say = (m: string): void => { setNotice(m); window.setTimeout(() => setNotice(''), 4000); };
  const load = useCallback(async (bid: string | null): Promise<void> => {
    if (!bid) { setDocs([]); return; }
    setLoading(true);
    try { setDocs(await api.listProfileDocs(bid)); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được hồ sơ.'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(boardId); }, [boardId, load]);

  const years = useMemo(() => [...new Set(docs.map((d) => d.schoolYear).filter(Boolean))].sort().reverse(), [docs]);
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return docs.filter((d) => (cat === 'all' || d.category === cat) && (year === 'all' || d.schoolYear === year)
      && (!k || `${d.title} ${d.description} ${d.tags.join(' ')} ${d.attachments.map((a) => a.label || a.name).join(' ')}`.toLowerCase().includes(k)));
  }, [docs, q, cat, year]);
  const counts = useMemo(() => { const m = new Map<string, number>(); docs.forEach((d) => m.set(d.category, (m.get(d.category) ?? 0) + 1)); return m; }, [docs]);

  const save = async (data: ProfileDocData): Promise<void> => {
    const bid = boardId ?? (await store.ensurePersonalBoard()).id;
    await api.saveProfileDoc(bid, form?.doc?.id ?? null, data);
    await load(bid);
    say('Đã lưu hồ sơ.');
  };
  /** Bảng việc riêng phải có trước khi tải tệp lên (tệp đi theo mã bảng); chưa có thì tạo ngay khi mở biểu mẫu. */
  const openForm = async (): Promise<void> => { try { if (!boardId) await store.ensurePersonalBoard(); setForm({}); } catch (e) { setError(e instanceof Error ? e.message : 'Không mở được biểu mẫu.'); } };
  const download = (): void => {
    const url = URL.createObjectURL(api.exportProfileCatalog(shown));
    const a = document.createElement('a'); a.href = url; a.download = 'muc-luc-ho-so.xlsx'; document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <main className="mx-auto w-full max-w-[min(100%,1500px)] space-y-4 px-4 py-5 pb-28 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Hồ sơ chuyên môn</h1>
          <p className="text-sm text-ink-2">Kho tài liệu của riêng bạn: kế hoạch, giáo án, biên bản, báo cáo, minh chứng.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void openForm()} className="btn-primary max-lg:min-h-[44px]"><Plus className="h-4 w-4" aria-hidden /> Thêm hồ sơ</button>
          {shown.length > 0 && <button type="button" onClick={download} className="btn-ghost max-lg:min-h-[44px]"><Download className="h-4 w-4" aria-hidden /> Xuất mục lục Excel</button>}
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">{notice}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1 sm:max-w-sm">
          <label htmlFor="pr-q" className="sr-only">Tìm hồ sơ</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input id="pr-q" className="input !pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên, thẻ, ghi chú, tên tệp" />
        </div>
        <label htmlFor="pr-year" className="sr-only">Năm học</label>
        <select id="pr-year" className="input !min-h-[44px] max-w-[11rem]" value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="all">Mọi năm học</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo nhóm">
        {[{ id: 'all', label: 'Tất cả' }, ...api.PROFILE_CATEGORIES].map((c) => {
          const n = c.id === 'all' ? docs.length : counts.get(c.id) ?? 0;
          if (c.id !== 'all' && n === 0 && cat !== c.id) return null;
          return <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)} className={`chip cursor-pointer !px-3 !py-1.5 text-sm max-lg:!min-h-[44px] ${cat === c.id ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-2 ring-brand-200 hover:bg-brand-50'}`}>{c.label} <span className="font-extrabold">{n}</span></button>;
        })}
      </div>

      {loading && <p className="flex items-center gap-2 text-sm text-ink-2" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Đang tải…</p>}
      {shown.length === 0 && !loading ? (
        <p className="rounded-2xl border border-dashed border-brand-200 bg-white/70 p-8 text-center text-ink-2">{docs.length === 0 ? 'Chưa có hồ sơ nào. Bấm “Thêm hồ sơ” để lưu kế hoạch, giáo án, biên bản, minh chứng của bạn.' : 'Không có hồ sơ nào khớp bộ lọc.'}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((d) => (
            <li key={d.id} className="card min-w-0 space-y-2 !p-4">
              <div className="flex items-start gap-2">
                <FolderOpen className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
                <div className="min-w-0 flex-1">
                  <h2 className="break-words text-base font-extrabold leading-snug">{d.title}</h2>
                  <p className="text-xs text-ink-2">{api.categoryLabel(d.category)}{d.schoolYear ? ` · ${d.schoolYear}` : ''}{d.docDate ? ` · ${fmtDate(d.docDate)}` : ''}</p>
                </div>
                <button type="button" onClick={() => setForm({ doc: d })} aria-label={`Sửa ${d.title}`} className="flex items-center justify-center rounded-full p-2 text-ink-2 hover:bg-brand-50 hover:text-brand-700 max-lg:min-h-[44px] max-lg:min-w-[44px]"><Pencil className="h-4 w-4" aria-hidden /></button>
              </div>
              {d.description && <p className="whitespace-pre-wrap break-words text-sm text-ink-2">{d.description}</p>}
              {d.tags.length > 0 && <ul className="flex flex-wrap gap-1" aria-label="Thẻ">{d.tags.map((t) => <li key={t}><button type="button" onClick={() => setQ(t)} className="chip bg-brand-50 text-brand-800 ring-brand-100 max-lg:min-h-[44px] max-lg:px-3">#{t}</button></li>)}</ul>}
              {d.attachments.length > 0 ? <TaskDocs task={{ id: d.id, label: d.title, attachments: d.attachments }} className="mt-1" /> : <p className="text-xs text-ink-3">Chưa đính kèm tệp.</p>}
            </li>
          ))}
        </ul>
      )}

      {form && <DocForm store={store} boardId={boardId ?? ''} doc={form.doc} onSave={save}
        onDelete={form.doc ? async () => { await api.deleteProfileDoc((form.doc as ProfileDoc).id); await load(boardId); say('Đã xóa hồ sơ.'); } : undefined} onClose={() => setForm(null)} />}
    </main>
  );
}
