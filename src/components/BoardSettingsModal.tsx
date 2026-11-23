import { useState } from 'react';
import { Save } from 'lucide-react';
import type { BoardSettings, ViewMode } from '../types/board';
import { BACKGROUNDS, FONTS, ICONS, SORTS, VIEW_LABEL } from '../lib/boardSettings';
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

  const update = (next: BoardMetaPatch): void => { setDraft(next); onPreview(next); };
  const set = <K extends keyof BoardSettings>(key: K, value: BoardSettings[K]): void =>
    update({ ...draft, settings: { ...draft.settings, [key]: value } });
  const s = draft.settings;

  const save = async (): Promise<void> => {
    if (!draft.title.trim()) { setError('Tên bảng không được để trống.'); return; }
    setBusy(true);
    setError('');
    try { await onSave({ ...draft, title: draft.title.trim() }); } catch (e) { setError(e instanceof Error ? e.message : 'Không lưu được.'); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={onCancel}>
      <aside role="dialog" aria-modal="true" aria-label="Cài đặt bảng" onClick={(e) => e.stopPropagation()}
        className="pop-in flex h-full w-full max-w-md flex-col bg-white shadow-lift">
        <header className="flex items-center justify-between border-b border-brand-100 px-5 py-3">
          <h2 className="text-lg font-extrabold">Cài đặt bảng</h2>
          <button type="button" onClick={onCancel} className="btn-ghost btn-sm">Hủy</button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <Section title="Thông tin">
            <div>
              <label htmlFor="bs-title" className="field-label">Tên bảng</label>
              <input id="bs-title" className="input" value={draft.title} onChange={(e) => update({ ...draft, title: e.target.value })} />
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
              <div className="flex flex-wrap gap-2">
                {(Object.keys(ICONS) as (keyof typeof ICONS)[]).map((id) => {
                  const { Icon, label } = ICONS[id];
                  const on = s.icon === id;
                  return (
                    <button key={id} type="button" aria-pressed={on} aria-label={label} title={label} onClick={() => set('icon', id)}
                      className={`flex h-11 w-11 items-center justify-center rounded-xl border-2 transition duration-150 ${on ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-brand-100 bg-white text-ink-2 hover:border-brand-300'}`}>
                      <Icon className="h-5 w-5" aria-hidden />
                    </button>
                  );
                })}
              </div>
            </div>
          </Section>

          <Section title="Giao diện">
            <div>
              <span className="field-label">Nền</span>
              <div className="grid grid-cols-5 gap-2">
                {(Object.keys(BACKGROUNDS) as (keyof typeof BACKGROUNDS)[]).map((id) => (
                  <button key={id} type="button" aria-pressed={s.background === id} onClick={() => set('background', id)} title={BACKGROUNDS[id].label}
                    className={`h-12 rounded-xl border-2 text-[10px] font-bold text-ink-2 transition duration-150 ${s.background === id ? 'border-brand-600 ring-2 ring-brand-200' : 'border-brand-100 hover:border-brand-300'}`}
                    style={{ background: BACKGROUNDS[id].css }}>
                    <span className="sr-only">{BACKGROUNDS[id].label}</span>
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-ink-2">{BACKGROUNDS[s.background].label}</p>
            </div>
            <div>
              <span className="field-label">Phông chữ</span>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(FONTS) as (keyof typeof FONTS)[]).map((id) => (
                  <button key={id} type="button" aria-pressed={s.font === id} onClick={() => set('font', id)}
                    style={{ fontFamily: FONTS[id].family }}
                    className={`min-h-[44px] rounded-xl border-2 px-2 text-sm font-bold transition duration-150 ${s.font === id ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-brand-100 bg-white hover:border-brand-300'}`}>
                    {FONTS[id].label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="field-label">Cỡ thẻ</span>
              <div className="grid grid-cols-2 gap-2">
                {(['standard', 'wide'] as const).map((id) => (
                  <button key={id} type="button" aria-pressed={s.cardSize === id} onClick={() => set('cardSize', id)}
                    className={`min-h-[44px] rounded-xl border-2 text-sm font-bold transition duration-150 ${s.cardSize === id ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-brand-100 bg-white hover:border-brand-300'}`}>
                    {id === 'standard' ? 'Tiêu chuẩn' : 'Rộng (chiếu tivi)'}
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

          <Section title="Kiểm duyệt">
            <ModerationPicker name="settings-moderation" value={s.moderation} onChange={(m) => set('moderation', m)} />
          </Section>

          <Section title="Đánh giá giữa các bạn">
            <Toggle label="Học sinh chấm sao bài của bạn" hint="Mỗi bạn một lượt cho mỗi bài, đổi ý được; không chấm được bài của mình." checked={s.peerStars} onChange={(v) => set('peerStars', v)} />
            <Toggle label="Học sinh nhận xét bài của bạn" hint="Tự động chặn từ ngữ không lành mạnh, số điện thoại, email, liên kết. Giáo viên ẩn hoặc xóa được." checked={s.peerComments} onChange={(v) => set('peerComments', v)} />
            <Toggle label="Cho học sinh xem điểm số của giáo viên" hint="Mặc định tắt vì điểm là riêng tư. Sao và lời phê của giáo viên luôn hiện." checked={s.showGrades} onChange={(v) => set('showGrades', v)} />
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
