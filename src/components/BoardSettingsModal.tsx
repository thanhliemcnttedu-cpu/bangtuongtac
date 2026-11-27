import { useEffect, useRef, useState } from 'react';
import { Bold, ChevronDown, ClipboardPaste, ImagePlus, Italic, Save, Trash2, Underline } from 'lucide-react';
import type { BoardSettings, ViewMode } from '../types/board';
import { BACKGROUNDS, FONTS, ICONS, ICON_GROUPS, MAX_BG_CHARS, SORTS, VIEW_LABEL, titleCss } from '../lib/boardSettings';
import type { TitleStyle } from '../lib/boardSettings';
import { INK, RICH_COLORS } from '../lib/richText';
import { compressImage } from '../lib/media';
import type { BoardMetaPatch } from '../lib/boardApi';
import { ModerationPicker } from './ModerationPicker';

interface Props {
  initial: BoardMetaPatch;
  /** Gọi mỗi khi người dùng chỉnh: bảng phía sau đổi theo ngay (xem trước trực tiếp). */
  onPreview: (draft: BoardMetaPatch) => void;
  onSave: (draft: BoardMetaPatch) => Promise<void>;
  /** Hiện ô Chương trình (lớp tập huấn). */
  showProgram?: boolean;
  /** Hủy: bảng trở lại như cũ. */
  onCancel: () => void;
}

const VIEWS = Object.keys(VIEW_LABEL) as ViewMode[];
const FONT_GROUPS = ['Hiện đại', 'Có chân', 'Nghệ thuật'] as const;
const CARD_SIZES = [['compact', 'Nhỏ'], ['standard', 'Tiêu chuẩn'], ['wide', 'Rộng (chiếu tivi)']] as const;

const readDataUrl = (f: Blob): Promise<string> => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = () => rej(new Error('Không đọc được ảnh.'));
  r.readAsDataURL(f);
});

/** Thu nhỏ ảnh nền (cắt theo bề ngang banner) cho tới khi đủ nhẹ để lưu cùng cài đặt bảng. */
async function bgFromFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Tệp này không phải ảnh. Hãy chọn ảnh JPG, PNG hoặc WebP.');
  for (const [side, q] of [[1600, 0.78], [1280, 0.68], [1024, 0.6], [800, 0.55]] as const) {
    const url = await readDataUrl(await compressImage(file, side, q));
    if (url.length <= MAX_BG_CHARS && /^data:image\/(jpeg|png|webp);base64,/.test(url)) return url;
  }
  throw new Error('Ảnh quá phức tạp để lưu làm nền. Hãy chọn ảnh khác hoặc ảnh nhỏ hơn.');
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl bg-brand-50/60 p-3">
      <h3 className="text-xs font-extrabold uppercase tracking-wide text-ink-2">{title}</h3>
      {children}
    </section>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span>
        <span className="block text-sm font-bold">{label}</span>
        {hint && <span className="block text-xs text-ink-2">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 shrink-0 accent-brand-600" />
    </label>
  );
}

/** Ngăn kéo Cài đặt bên phải: toàn bộ tùy chỉnh của bảng ở một chỗ, xem trước trực tiếp trên bảng phía sau. */
export function BoardSettingsModal({ initial, onPreview, onSave, onCancel, showProgram = false }: Props) {
  const [draft, setDraft] = useState<BoardMetaPatch>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Esc hoặc Hủy: nếu đang sửa dở thì hỏi lại trước khi bỏ thay đổi.
  const [askDiscard, setAskDiscard] = useState(false);
  const [bgBusy, setBgBusy] = useState(false);
  const [bgMsg, setBgMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [iconOpen, setIconOpen] = useState<string | null>(null);
  const [fontOpen, setFontOpen] = useState(false);
  const fontBox = useRef<HTMLDivElement>(null);
  // Danh sách phông chữ đóng khi bấm ra ngoài.
  useEffect(() => {
    if (!fontOpen) return;
    const off = (e: MouseEvent): void => { if (fontBox.current && !fontBox.current.contains(e.target as Node)) setFontOpen(false); };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [fontOpen]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const requestClose = (): void => { if (dirty) setAskDiscard(true); else onCancel(); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') requestClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  const update = (next: BoardMetaPatch): void => { setDraft(next); onPreview(next); };
  const set = <K extends keyof BoardSettings>(key: K, value: BoardSettings[K]): void =>
    update({ ...draft, settings: { ...draft.settings, [key]: value } });
  const s = draft.settings;
  const ts: TitleStyle = s.titleStyle ?? {};
  const setTitleStyle = (patch: Partial<TitleStyle>): void => {
    const next: TitleStyle = { ...ts, ...patch };
    (Object.keys(next) as (keyof TitleStyle)[]).forEach((k) => { if (!next[k]) delete next[k]; });
    set('titleStyle', Object.keys(next).length > 0 ? next : undefined);
  };

  const applyBgFile = async (file: File | undefined | null): Promise<void> => {
    if (!file) return;
    setBgBusy(true); setBgMsg('');
    try {
      const url = await bgFromFile(file);
      update({ ...draft, settings: { ...draft.settings, background: 'custom', bgImage: url } });
      setBgMsg('Đã áp ảnh nền. Phần mềm tự căn ảnh theo bề ngang của bảng.');
    } catch (e) { setBgMsg(e instanceof Error ? e.message : 'Không dùng được ảnh này.'); }
    setBgBusy(false);
  };
  const pasteBg = async (): Promise<void> => {
    setBgMsg('');
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const type = it.types.find((t) => t.startsWith('image/'));
        if (type) { await applyBgFile(new File([await it.getType(type)], 'dan.png', { type })); return; }
      }
      setBgMsg('Bộ nhớ tạm chưa có ảnh. Hãy sao chép một ảnh rồi bấm lại, hoặc bấm vào ô này và nhấn Ctrl + V.');
    } catch { setBgMsg('Trình duyệt không cho đọc bộ nhớ tạm. Bấm vào khung ảnh nền bên dưới rồi nhấn Ctrl + V để dán.'); }
  };
  const clearBg = (): void => {
    const next = { ...draft.settings, background: 'default' };
    delete next.bgImage;
    update({ ...draft, settings: next });
    setBgMsg('');
  };

  const save = async (): Promise<void> => {
    if (!draft.title.trim()) { setError('Tên bảng không được để trống.'); return; }
    setBusy(true);
    setError('');
    try { await onSave({ ...draft, title: draft.title.trim() }); } catch (e) { setError(e instanceof Error ? e.message : 'Không lưu được.'); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30">
      <aside role="dialog" aria-modal="true" aria-label="Cài đặt bảng" onClick={(e) => e.stopPropagation()}
        className="pop-in flex h-full w-full max-w-md flex-col bg-white shadow-lift">
        <header className="flex items-center justify-between border-b border-brand-100 px-5 py-3">
          <h2 className="text-lg font-extrabold">Cài đặt bảng</h2>
          <button type="button" onClick={requestClose} className="btn-ghost btn-sm">Hủy</button>
        </header>
        {askDiscard && (
          <div role="alertdialog" aria-label="Bỏ thay đổi?" className="border-b border-amber-300 bg-amber-50 px-5 py-3 text-sm">
            <p className="font-extrabold text-amber-900">Bạn đang sửa dở. Bỏ các thay đổi chưa lưu?</p>
            <div className="mt-2 flex gap-2"><button type="button" onClick={onCancel} className="btn-primary btn-sm">Bỏ thay đổi</button><button type="button" onClick={() => setAskDiscard(false)} className="btn-ghost btn-sm">Tiếp tục sửa</button></div>
          </div>
        )}

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <Section title="Thông tin">
            <div>
              <label htmlFor="bs-title" className="field-label">Tên bảng</label>
              <input id="bs-title" className="input" style={titleCss(s.titleStyle)} value={draft.title} onChange={(e) => update({ ...draft, title: e.target.value })} />
              <div role="toolbar" aria-label="Kiểu chữ của tên bảng" className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {([['b', 'Chữ đậm', Bold], ['i', 'Chữ nghiêng', Italic], ['u', 'Gạch chân', Underline]] as const).map(([k, label, Ic]) => (
                  <button key={k} type="button" aria-pressed={!!ts[k]} aria-label={label} title={label} onClick={() => setTitleStyle({ [k]: !ts[k] })}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg border-2 transition max-lg:h-11 max-lg:w-11 ${ts[k] ? 'border-brand-600 bg-brand-100 text-brand-700' : 'border-brand-100 bg-white text-ink-2 hover:border-brand-300'}`}><Ic className="h-4 w-4" aria-hidden /></button>
                ))}
                <span className="mx-1 h-5 w-px bg-brand-100" aria-hidden />
                <button type="button" aria-label="Màu mặc định" title="Màu mặc định" aria-pressed={!ts.color} onClick={() => setTitleStyle({ color: undefined })}
                  className={`h-7 w-7 rounded-full border-2 border-white shadow ring-2 max-lg:h-9 max-lg:w-9 ${!ts.color ? 'ring-brand-600' : 'ring-brand-100'}`} style={{ background: INK }} />
                {RICH_COLORS.map((c) => (
                  <button key={c.hex} type="button" aria-label={`Màu ${c.name}`} title={c.name} aria-pressed={ts.color === c.hex} onClick={() => setTitleStyle({ color: c.hex })}
                    className={`h-7 w-7 rounded-full border-2 border-white shadow ring-2 max-lg:h-9 max-lg:w-9 ${ts.color === c.hex ? 'ring-brand-600' : 'ring-brand-100'}`} style={{ background: c.hex }} />
                ))}
                <label title="Chọn màu bất kỳ" className="flex h-7 cursor-pointer items-center gap-1 rounded-full bg-white px-2 text-xs font-extrabold text-brand-700 ring-2 ring-brand-100 hover:ring-brand-300 max-lg:h-9">
                  <input type="color" aria-label="Màu tự chọn" value={ts.color ?? '#1668f2'} onChange={(e) => setTitleStyle({ color: e.target.value })} className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0" />
                  Màu khác
                </label>
              </div>
            </div>
            {showProgram && (
              <div>
                <label htmlFor="bs-program" className="field-label">Chương trình tập huấn <span className="font-normal text-ink-2">(gom nhiều lớp tập huấn)</span></label>
                <input id="bs-program" className="input" value={draft.program ?? ''} onChange={(e) => update({ ...draft, program: e.target.value })} placeholder="Ví dụ: Bồi dưỡng thường xuyên 2025–2026" />
              </div>
            )}
            <div>
              <label htmlFor="bs-goals" className="field-label">Lời dẫn / mục tiêu bài học</label>
              <textarea id="bs-goals" rows={3} className="input min-h-[84px] py-2" value={draft.goals} onChange={(e) => update({ ...draft, goals: e.target.value })} />
            </div>
            <div>
              <span className="field-label">Biểu tượng</span>
              <p className="mb-1.5 flex items-center gap-2 text-sm font-bold">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-2 ring-brand-200">{(() => { const I = (ICONS[s.icon] ?? ICONS.book).Icon; return <I className="h-5 w-5" aria-hidden />; })()}</span>
                Đang chọn: {ICONS[s.icon]?.label ?? 'Sách'}
              </p>
              <div className="divide-y divide-brand-100 overflow-hidden rounded-xl border-2 border-brand-100 bg-white">
                {ICON_GROUPS.map((g) => {
                  const open = iconOpen === g.title;
                  const chosen = g.items.some(([id]) => id === s.icon);
                  return (
                    <div key={g.title}>
                      <button type="button" aria-expanded={open} onClick={() => setIconOpen(open ? null : g.title)}
                        className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3 text-left text-sm font-extrabold hover:bg-brand-50">
                        <span className="flex items-center gap-2">{g.title}{chosen && <span className="rounded-full bg-brand-600 px-1.5 text-[10px] text-white">đang chọn</span>}</span>
                        <span className="flex items-center gap-2 text-xs font-bold text-ink-3">{g.items.length}<ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} aria-hidden /></span>
                      </button>
                      {open && (
                        <div role="group" aria-label={`Biểu tượng ${g.title}`} className="flex flex-wrap gap-1.5 bg-brand-50/50 p-2">
                          {g.items.map(([id, label, Icon]) => {
                            const on = s.icon === id;
                            return (
                              <button key={id} type="button" aria-pressed={on} aria-label={label} title={label} onClick={() => set('icon', id)}
                                className={`flex h-11 w-11 items-center justify-center rounded-xl border-2 transition duration-150 ${on ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-brand-100 bg-white text-ink-2 hover:border-brand-300'}`}>
                                <Icon className="h-5 w-5" aria-hidden />
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </Section>

          <Section title="Giao diện">
            <div>
              <span className="field-label">Nền</span>
              <div className="grid grid-cols-5 gap-2">
                {(Object.keys(BACKGROUNDS).filter((k) => k !== 'custom')).map((id) => (
                  <button key={id} type="button" aria-pressed={s.background === id} onClick={() => set('background', id)} title={BACKGROUNDS[id].label}
                    className={`h-12 rounded-xl border-2 text-[10px] font-bold text-ink-2 transition duration-150 ${s.background === id ? 'border-brand-600 ring-2 ring-brand-200' : 'border-brand-100 hover:border-brand-300'}`}
                    style={{ background: BACKGROUNDS[id].css }}>
                    <span className="sr-only">{BACKGROUNDS[id].label}</span>
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-ink-2">{BACKGROUNDS[s.background]?.label ?? BACKGROUNDS.default.label}</p>

              <div className="mt-2 rounded-xl border-2 border-dashed border-brand-200 bg-white p-2.5"
                tabIndex={0} role="group" aria-label="Ảnh nền riêng: tải lên hoặc dán"
                onPaste={(e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); void applyBgFile(f); } }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); void applyBgFile(e.dataTransfer.files[0]); }}>
                {s.background === 'custom' && s.bgImage && (
                  <div className="mb-2 h-20 w-full rounded-lg bg-cover bg-center ring-1 ring-brand-200" style={{ backgroundImage: `url("${s.bgImage}")` }} role="img" aria-label="Ảnh nền đang dùng" />
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={bgBusy} onClick={() => fileRef.current?.click()} className="btn-ghost btn-sm"><ImagePlus className="h-4 w-4" aria-hidden /> Tải ảnh từ máy tính</button>
                  <button type="button" disabled={bgBusy} onClick={() => void pasteBg()} className="btn-ghost btn-sm"><ClipboardPaste className="h-4 w-4" aria-hidden /> Dán ảnh</button>
                  {s.background === 'custom' && <button type="button" onClick={clearBg} className="btn-ghost btn-sm text-rose-700"><Trash2 className="h-4 w-4" aria-hidden /> Bỏ ảnh nền</button>}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void applyBgFile(e.target.files?.[0]); e.target.value = ''; }} />
                <p className="mt-1.5 text-xs text-ink-2">Chọn ảnh ngang, phần mềm tự thu nhỏ, cắt vừa bề ngang và làm mờ dần phía dưới. Cũng kéo thả ảnh vào khung này hoặc nhấn Ctrl + V được.</p>
                {bgBusy && <p role="status" className="mt-1 text-xs font-bold text-brand-700">Đang xử lý ảnh…</p>}
                {bgMsg && !bgBusy && <p role="status" className="mt-1 text-xs font-bold text-brand-700">{bgMsg}</p>}
              </div>
            </div>
            <div ref={fontBox} className="relative">
              <span id="bs-font-label" className="field-label">Phông chữ</span>
              <button type="button" aria-haspopup="listbox" aria-expanded={fontOpen} aria-labelledby="bs-font-label" onClick={() => setFontOpen(!fontOpen)}
                onKeyDown={(e) => { if (e.key === 'Escape' && fontOpen) { e.stopPropagation(); setFontOpen(false); } }}
                style={{ fontFamily: FONTS[s.font]?.family }}
                className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border-2 border-brand-200 bg-white px-3 text-left text-base font-bold hover:border-brand-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100">
                <span>{FONTS[s.font]?.label ?? FONTS.sans.label}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 transition ${fontOpen ? 'rotate-180' : ''}`} aria-hidden />
              </button>
              {fontOpen && (
                <ul role="listbox" aria-label="Danh sách phông chữ" className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-2xl border-[1.5px] border-brand-200 bg-white p-1.5 shadow-lift">
                  {FONT_GROUPS.map((grp) => (
                    <li key={grp} role="presentation">
                      <p className="px-3 pb-0.5 pt-1.5 text-[10px] font-extrabold uppercase tracking-wide text-ink-3">{grp}</p>
                      {Object.keys(FONTS).filter((id) => FONTS[id].group === grp).map((id) => (
                        <button key={id} type="button" role="option" aria-selected={s.font === id} onClick={() => { set('font', id); setFontOpen(false); }}
                          style={{ fontFamily: FONTS[id].family }}
                          className={`flex min-h-[40px] w-full items-center rounded-lg px-3 text-left text-base max-lg:min-h-[44px] ${s.font === id ? 'bg-brand-50 font-extrabold text-brand-700' : 'hover:bg-brand-50'}`}>{FONTS[id].label}</button>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-xs text-ink-2" style={{ fontFamily: FONTS[s.font]?.family }}>Xem thử: Em yêu trường lớp của em – 0123456789</p>
            </div>
            <div>
              <span className="field-label">Cỡ thẻ</span>
              <div className="grid grid-cols-3 gap-2">
                {CARD_SIZES.map(([id, label]) => (
                  <button key={id} type="button" aria-pressed={s.cardSize === id} onClick={() => set('cardSize', id)}
                    className={`min-h-[44px] rounded-xl border-2 px-1 text-sm font-bold transition duration-150 ${s.cardSize === id ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-brand-100 bg-white hover:border-brand-300'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Bố cục">
            <div>
              <label htmlFor="bs-view" className="field-label">Kiểu xem mặc định</label>
              <select id="bs-view" className="input" value={s.defaultView} onChange={(e) => set('defaultView', e.target.value as ViewMode)}>
                {VIEWS.map((v) => <option key={v} value={v}>{VIEW_LABEL[v]}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="bs-sort" className="field-label">Thứ tự sắp xếp</label>
              <select id="bs-sort" className="input" value={s.sortBy} onChange={(e) => set('sortBy', e.target.value as BoardSettings['sortBy'])}>
                {(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((k) => <option key={k} value={k}>{SORTS[k]}</option>)}
              </select>
            </div>
          </Section>

          {s.scope === 'team' && (
            <Section title="An toàn của tổ công tác">
              <Toggle label="Chỉ người có tên trong danh sách mới nộp được" hint="Người lạ có link cũng không nộp được. Máy chủ kiểm tra lại, không chỉ trang web." checked={!!s.rosterOnly} onChange={(v) => set('rosterOnly', v)} />
              <Toggle label="Thành viên được xem tệp của nhau" hint="Tắt: thành viên chỉ thấy ai đã nộp, nộp lúc nào; bài của người khác không hiện. Đây là ẩn trên trang: ai gõ đúng tên người nộp vẫn mở, sửa được bài đó." checked={!s.privateView} onChange={(v) => set('privateView', !v)} />
            </Section>
          )}

          <Section title="Kiểm duyệt">
            <ModerationPicker name="settings-moderation" value={s.moderation} onChange={(m) => set('moderation', m)} />
          </Section>

          <Section title="Đánh giá giữa các bạn">
            <Toggle label="Học sinh chấm sao bài của bạn" hint="Mỗi bạn một lượt cho mỗi bài, đổi ý được; không chấm được bài của mình." checked={s.peerStars} onChange={(v) => set('peerStars', v)} />
            <Toggle label="Học sinh nhận xét bài của bạn" hint="Tự động chặn từ ngữ không lành mạnh, số điện thoại, email, liên kết. Giáo viên ẩn hoặc xóa được." checked={s.peerComments} onChange={(v) => set('peerComments', v)} />
            <Toggle label={`Cho ${showProgram ? 'học viên' : 'học sinh'} xem điểm số của giáo viên`} hint="Mặc định tắt vì điểm là riêng tư. Sao và lời phê của giáo viên luôn hiện." checked={s.showGrades} onChange={(v) => set('showGrades', v)} />
          </Section>

          <Section title="Biểu đồ Venn">
            {([0, 1] as const).map((i) => (
              <div key={i}>
                <label htmlFor={`bs-venn-${i}`} className="field-label">Tên vòng {i === 0 ? 'bên trái' : 'bên phải'}</label>
                <input id={`bs-venn-${i}`} className="input" maxLength={40} value={s.vennLabels[i]}
                  onChange={(e) => { const next: [string, string] = [s.vennLabels[0], s.vennLabels[1]]; next[i] = e.target.value; set('vennLabels', next); }} />
              </div>
            ))}
          </Section>

          <Section title="Thẻ bài">
            <Toggle label="Hiện tên người nộp" hint="Tắt để ẩn tên khi chiếu, ví dụ lúc bình chọn ẩn danh." checked={s.showAuthor} onChange={(v) => set('showAuthor', v)} />
            <Toggle label="Hiện thời gian nộp" checked={s.showTime} onChange={(v) => set('showTime', v)} />
          </Section>
        </div>

        <footer className="space-y-2 border-t border-brand-100 p-4">
          {error && <p role="alert" className="text-sm font-bold text-rose-700">{error}</p>}
          <button type="button" onClick={() => void save()} disabled={busy} className="btn-primary w-full">
            <Save className="h-4 w-4" aria-hidden /> {busy ? 'Đang lưu…' : 'Lưu cài đặt'}
          </button>
        </footer>
      </aside>
    </div>
  );
}
