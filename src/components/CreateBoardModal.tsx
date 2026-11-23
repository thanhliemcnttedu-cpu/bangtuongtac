import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, GraduationCap, Layers, School } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { BoardMode } from '../types/board';
import { BOARD_TEMPLATES } from '../data/boardTemplates';
import type { BoardTemplate } from '../data/boardTemplates';
import { ICONS, VIEW_LABEL } from '../lib/boardSettings';
import { ModalShell } from './ModalShell';

/** Thông tin thêm khi tạo bảng theo bước: bài học tạo sẵn và chương trình tập huấn. */
export interface CreateExtras { lessonTitle?: string; program?: string }

interface Props {
  /** Bảng của giáo viên được đánh dấu là mẫu. */
  extraTemplates?: BoardTemplate[];
  onCreate: (title: string, template: BoardTemplate, extras: CreateExtras) => Promise<void>;
  onClose: () => void;
}

type Scope = 'class' | 'grade' | 'lesson' | 'training';

interface ScopeDef {
  id: Scope;
  mode: BoardMode;
  icon: LucideIcon;
  title: string;
  hint: string;
  example: string;
  nameLabel: string;
  namePlaceholder: string;
  extraLabel: string;
  extraPlaceholder: string;
}

const SCOPES: ScopeDef[] = [
  { id: 'class', mode: 'classroom', icon: School, title: 'Một lớp', hint: 'Dùng cho một lớp cụ thể. Bên trong có nhiều bài học, mỗi bài có bài tập và tài liệu.', example: 'Ví dụ: Lớp 4A – Tin học',
    nameLabel: 'Tên lớp *', namePlaceholder: 'Lớp 4A', extraLabel: 'Môn học / nội dung', extraPlaceholder: 'Tin học' },
  { id: 'grade', mode: 'classroom', icon: Layers, title: 'Cả khối', hint: 'Dùng chung cho nhiều lớp trong khối. Học sinh ghi rõ lớp / tổ của mình khi nộp bài.', example: 'Ví dụ: Khối 4 – Tin học',
    nameLabel: 'Tên khối *', namePlaceholder: 'Khối 4', extraLabel: 'Môn học / nội dung', extraPlaceholder: 'Tin học' },
  { id: 'lesson', mode: 'classroom', icon: BookOpen, title: 'Một bài học / chủ đề', hint: 'Tạo bảng riêng cho một bài. Hệ thống tạo sẵn bài học để giao bài ngay.', example: 'Ví dụ: Tin học 4 – Bài 3',
    nameLabel: 'Tên bài học / chủ đề *', namePlaceholder: 'Bài 3 · Tìm kiếm thông tin trên internet', extraLabel: 'Môn và lớp / khối', extraPlaceholder: 'Tin học 4' },
  { id: 'training', mode: 'training', icon: GraduationCap, title: 'Lớp tập huấn', hint: 'Giáo viên nộp sản phẩm theo trường / đơn vị. Có thể gom nhiều lớp tập huấn vào một chương trình.', example: 'Ví dụ: Thiết kế kế hoạch bài dạy',
    nameLabel: 'Tên lớp tập huấn *', namePlaceholder: 'Thiết kế kế hoạch bài dạy', extraLabel: 'Chương trình tập huấn', extraPlaceholder: 'Bồi dưỡng thường xuyên 2025–2026' },
];

/** Ghép tên bảng từ các ô đã điền (xem trước ngay cho giáo viên). */
function composeTitle(scope: Scope, name: string, extra: string): string {
  const a = name.trim();
  const b = extra.trim();
  if (!a) return '';
  if (scope === 'lesson') return b ? `${b} – ${a}` : a;
  if (scope === 'training') return a;
  return b ? `${a} – ${b}` : a;
}

const STEPS = ['Dành cho ai', 'Đặt tên', 'Kiểu trình bày'];

/**
 * Tạo bảng theo 3 bước để giáo viên không nhầm: (1) bảng dành cho lớp, khối, bài học hay lớp tập huấn,
 * (2) đặt tên theo gợi ý và xem trước tên bảng, (3) chọn kiểu trình bày (đổi lại được sau).
 */
export function CreateBoardModal({ extraTemplates = [], onCreate, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [scope, setScope] = useState<Scope>('class');
  const [name, setName] = useState('');
  const [extra, setExtra] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const def = SCOPES.find((s) => s.id === scope) ?? SCOPES[0];
  const templates = useMemo(() => [...BOARD_TEMPLATES, ...extraTemplates].filter((t) => t.mode === def.mode), [extraTemplates, def.mode]);
  const template = templates.find((t) => t.id === templateId) ?? templates[0];
  const title = composeTitle(scope, name, extra);

  const pickScope = (id: Scope): void => { setScope(id); setTemplateId(''); setError(''); };

  const next = (): void => {
    if (step === 1 && !name.trim()) { setError(`Hãy điền ${def.nameLabel.replace(' *', '').toLowerCase()}.`); document.getElementById('cb-name')?.focus(); return; }
    setError('');
    setStep((s) => Math.min(2, s + 1));
  };

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (step < 2) { next(); return; }
    if (!title) { setError('Vui lòng đặt tên bảng.'); return; }
    setBusy(true);
    setError('');
    try {
      await onCreate(title, template, {
        lessonTitle: scope === 'lesson' ? name.trim() : undefined,
        program: scope === 'training' && extra.trim() ? extra.trim() : undefined,
      });
    } catch (err) { setError(err instanceof Error ? err.message : 'Không tạo được bảng.'); setBusy(false); }
  };

  return (
    <ModalShell title="Tạo bảng mới" onClose={onClose} maxWidth="max-w-5xl" large>
      <ol className="mb-7 flex items-center gap-2" aria-label="Các bước tạo bảng">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-brand-600 text-white' : 'bg-brand-100 text-ink-2'}`}
              aria-current={i === step ? 'step' : undefined}>{i < step ? <Check className="h-4 w-4" aria-hidden /> : i + 1}</span>
            <span className={`hidden text-sm font-bold sm:block ${i === step ? 'text-ink' : 'text-ink-3'}`}>{label}</span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-brand-200" aria-hidden />}
          </li>
        ))}
      </ol>

      <form onSubmit={(e) => void submit(e)} noValidate className="space-y-5">
        {step === 0 && (
          <fieldset>
            <legend className="mb-3 text-xl font-extrabold">Bảng này dành cho ai?</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {SCOPES.map((s) => {
                const on = s.id === scope;
                const Icon = s.icon;
                return (
                  <label key={s.id} className={`relative cursor-pointer rounded-3xl border-2 p-5 transition duration-200 hover:-translate-y-1 hover:shadow-soft ${on ? 'border-brand-600 bg-brand-50 shadow-soft' : 'border-brand-100 hover:border-brand-300'}`}>
                    <input type="radio" name="board-scope" className="sr-only" checked={on} onChange={() => pickScope(s.id)} />
                    <span className="flex items-start gap-4">
                      <span className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ${on ? 'bg-brand-600 text-white' : 'bg-white text-brand-700 shadow-soft'}`}><Icon className="h-8 w-8" aria-hidden /></span>
                      <span className="min-w-0">
                        <span className="block text-lg font-extrabold">{s.title}</span>
                        <span className="block text-sm leading-snug text-ink-2">{s.hint}</span>
                        <span className="mt-1.5 block text-xs font-bold text-brand-700">{s.example}</span>
                      </span>
                    </span>
                    {on && <Check className="absolute right-2 top-2 h-4 w-4 text-brand-700" aria-label="Đã chọn" />}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-xl font-extrabold">Đặt tên cho {def.title.toLowerCase()}</p>
            <div>
              <label htmlFor="cb-name" className="field-label">{def.nameLabel}</label>
              <input id="cb-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={def.namePlaceholder} autoFocus />
            </div>
            <div>
              <label htmlFor="cb-extra" className="field-label">{def.extraLabel} <span className="font-normal text-ink-2">(không bắt buộc)</span></label>
              <input id="cb-extra" className="input" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder={def.extraPlaceholder} />
            </div>
            <p className="rounded-2xl bg-brand-50 px-3 py-2 text-sm">Tên bảng sẽ là: <b>{title || '…'}</b>{scope === 'lesson' && name.trim() && <span className="block text-xs text-ink-2">Hệ thống tạo sẵn bài học “{name.trim()}” để bạn giao bài ngay.</span>}</p>
          </div>
        )}

        {step === 2 && (
          <fieldset>
            <legend className="mb-1 text-xl font-extrabold">Chọn kiểu trình bày</legend>
            <p className="mb-2 text-xs text-ink-2">Bảng sẽ là: <b className="text-ink">{title}</b>. Mẫu chỉ quyết định cách hiển thị ban đầu, đổi lại bất cứ lúc nào trong “Sửa bảng”.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {templates.map((t) => {
                const on = t.id === (template?.id ?? '');
                const { Icon } = ICONS[t.settings.icon];
                return (
                  <label key={t.id} className={`relative cursor-pointer rounded-2xl border-2 p-3 transition duration-200 hover:-translate-y-0.5 ${on ? 'border-brand-600 bg-brand-50' : 'border-brand-100 hover:border-brand-300'}`}>
                    <input type="radio" name="board-template" className="sr-only" checked={on} onChange={() => setTemplateId(t.id)} />
                    <span className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 shadow-soft"><Icon className="h-5 w-5" aria-hidden /></span>
                      <span className="min-w-0">
                        <span className="block text-sm font-extrabold">{t.name}</span>
                        <span className="block text-xs text-ink-2">{t.description}</span>
                        <span className="mt-1 block text-[11px] font-bold text-brand-700">{VIEW_LABEL[t.settings.defaultView]}</span>
                      </span>
                    </span>
                    {on && <Check className="absolute right-2 top-2 h-4 w-4 text-brand-700" aria-label="Đã chọn" />}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        {error && <p role="alert" className="text-sm font-bold text-rose-700">{error}</p>}
        <div className="flex items-center justify-between gap-2 pt-1">
          {step > 0 ? <button type="button" onClick={() => { setError(''); setStep(step - 1); }} className="btn-ghost"><ArrowLeft className="h-4 w-4" aria-hidden /> Quay lại</button> : <button type="button" onClick={onClose} className="btn-ghost">Hủy</button>}
          {step < 2
            ? <button type="button" onClick={next} className="btn-primary">Tiếp tục <ArrowRight className="h-4 w-4" aria-hidden /></button>
            : <button type="submit" disabled={busy} className="btn-primary">{busy ? 'Đang tạo…' : 'Tạo bảng'}</button>}
        </div>
      </form>
    </ModalShell>
  );
}
