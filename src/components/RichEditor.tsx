import { useEffect, useRef, useState } from 'react';
import type { ClipboardEvent, KeyboardEvent, ReactNode } from 'react';
import { ALargeSmall, AlignCenter, AlignLeft, AlignRight, Bold, CornerDownLeft, Eraser, Italic, Mic, Palette, Smile, Square, Type, Underline } from 'lucide-react';
import { INK, RICH_COLORS, RICH_SIZES, domToRich, richToHtml, stripRich } from '../lib/richText';
import { FONTS } from '../lib/boardSettings';

interface Props {
  /** Chuỗi văn bản định dạng (xem lib/richText). */
  value: string;
  onChange: (v: string) => void;
  /** Mã gắn với nhãn (aria-labelledby) của ô. */
  labelledBy?: string;
  placeholder?: string;
  /** Chiều cao tối thiểu của vùng gõ (px). */
  minHeight?: number;
  /** Chữ lớn hơn cho học sinh nhỏ. */
  large?: boolean;
  /** Chiều cao tối đa của vùng gõ (px) trước khi cuộn. */
  maxHeight?: number;
}

/** Biểu tượng minh họa theo chủ đề để chèn vào văn bản. */
const EMOJI_TABS: { id: string; label: string; items: string[] }[] = [
  { id: 'present', label: 'Trình bày', items: ['✅', '✔️', '❌', '⭐', '🌟', '📌', '📍', '💡', '❗', '❓', '➡️', '⬇️', '📝', '🎯', '🏆', '👍', '👏', '🙂', '❤️', '🔥'] },
  { id: 'computer', label: 'Máy tính', items: ['💻', '🖥️', '⌨️', '🖱️', '📱', '🔌', '💾', '🌐', '📶', '🔍', '🔒', '📁', '📊', '🤖', '🎮', '🖨️', '📷', '🎧'] },
  { id: 'flower', label: 'Hoa', items: ['🌸', '🌼', '🌺', '🌻', '🌷', '🌹', '💐', '🪷', '🌿', '🍀', '🌱', '🍃', '🌳', '🌴', '🍁', '🌾'] },
  { id: 'animal', label: 'Con vật', items: ['🐶', '🐱', '🐭', '🐰', '🐻', '🐼', '🦁', '🐯', '🐘', '🐒', '🐔', '🐥', '🐦', '🐟', '🐠', '🐢', '🐝', '🦋', '🐞', '🐄', '🐖', '🐴'] },
  { id: 'study', label: 'Học tập', items: ['📚', '✏️', '🎒', '📖', '🧮', '🔬', '🎨', '🎵', '⚽', '🌍', '☀️', '🌈'] },
];

interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  start: () => void; stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;
const speechCtor = (): RecognitionCtor | null => {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const VOICE_ERR: Record<string, string> = {
  'not-allowed': 'Chưa cho phép dùng micro. Bấm biểu tượng khóa cạnh địa chỉ trang để cho phép.',
  'service-not-allowed': 'Chưa cho phép dùng micro. Bấm biểu tượng khóa cạnh địa chỉ trang để cho phép.',
  'no-speech': 'Chưa nghe thấy giọng nói. Hãy nói gần micro hơn rồi bấm micro lại.',
  'audio-capture': 'Không tìm thấy micro trên máy này.',
  network: 'Không kết nối được dịch vụ nhận dạng giọng nói. Kiểm tra mạng rồi thử lại.',
};

const BTN = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-2 transition hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 max-lg:h-11 max-lg:w-11';

/**
 * Ô soạn "Nội dung" có thanh công cụ: chữ đậm, nghiêng, gạch chân, căn lề, màu chữ, biểu tượng minh họa theo chủ đề, xuống dòng,
 * xóa định dạng và nhập bằng giọng nói tiếng Việt. Soạn trực tiếp (thấy ngay kết quả); lưu thành văn bản có thẻ nhẹ, an toàn.
 */
export function RichEditor({ value, onChange, labelledBy, placeholder = 'Viết hoặc dán nội dung…', minHeight = 96, large = false, maxHeight = 280 }: Props) {
  const ed = useRef<HTMLDivElement>(null);
  const emitted = useRef<string>('');
  const saved = useRef<Range | null>(null);
  const rec = useRef<Recognition | null>(null);
  const [pop, setPop] = useState<null | 'color' | 'emoji' | 'font' | 'size'>(null);
  const [tab, setTab] = useState('present');
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [voiceMsg, setVoiceMsg] = useState('');
  const canVoice = typeof window !== 'undefined' && !!speechCtor();
  const empty = stripRich(value).trim() === '';

  // Đồng bộ khi giá trị đổi từ bên ngoài (nạp bài cũ, dán liên kết vào nội dung…); gõ trong ô thì không nạp lại để giữ con trỏ.
  useEffect(() => {
    const el = ed.current;
    if (!el || value === emitted.current) return;
    el.innerHTML = richToHtml(value);
    emitted.current = value;
  }, [value]);

  // Ghi nhớ vị trí con trỏ trong ô để chèn biểu tượng và lời nói đúng chỗ.
  useEffect(() => {
    const onSel = (): void => {
      const sel = window.getSelection();
      const el = ed.current;
      if (el && sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) saved.current = sel.getRangeAt(0).cloneRange();
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  useEffect(() => () => { try { rec.current?.stop(); } catch { /* đã dừng */ } }, []);
  // Bảng màu / biểu tượng mở xuống dưới: trên điện thoại có thể nằm ngoài màn hình, nên cuộn nó vào tầm nhìn.
  useEffect(() => {
    if (!pop) return;
    const t = window.setTimeout(() => {
      ed.current?.parentElement?.parentElement?.querySelector<HTMLElement>('[role=group]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 30);
    return () => window.clearTimeout(t);
  }, [pop]);

  const sync = (): void => {
    const el = ed.current;
    if (!el) return;
    const next = domToRich(el);
    emitted.current = next;
    onChange(next);
  };

  const focusBack = (): void => {
    const el = ed.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (sel && saved.current && (!sel.anchorNode || !el.contains(sel.anchorNode))) { sel.removeAllRanges(); sel.addRange(saved.current); }
  };

  const exec = (cmd: string, arg?: string): void => {
    focusBack();
    document.execCommand(cmd, false, arg);
    sync();
  };

  const insert = (text: string): void => {
    focusBack();
    document.execCommand('insertText', false, text);
    sync();
  };

  const onPaste = (e: ClipboardEvent<HTMLDivElement>): void => {
    // Có tệp hoặc ảnh: để form xử lý như đính kèm. Chỉ chữ: dán dạng chữ thường, bỏ định dạng của nơi sao chép.
    if (e.clipboardData.files.length > 0) return;
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    document.execCommand('insertText', false, text);
    sync();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape' && pop) { e.stopPropagation(); setPop(null); }
  };

  const toggleVoice = (): void => {
    if (listening) { try { rec.current?.stop(); } catch { /* đã dừng */ } return; }
    const Ctor = speechCtor();
    if (!Ctor) return;
    setVoiceMsg('');
    const r = new Ctor();
    r.lang = 'vi-VN';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let finalText = '';
      let tmp = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript; else tmp += res[0].transcript;
      }
      setInterim(tmp);
      if (finalText.trim()) insert(`${finalText.trim()} `);
    };
    r.onerror = (e) => { setVoiceMsg(VOICE_ERR[e.error] ?? 'Chưa nhận dạng được giọng nói. Em thử lại nhé.'); };
    r.onend = () => { setListening(false); setInterim(''); };
    rec.current = r;
    focusBack();
    try { r.start(); setListening(true); } catch { setVoiceMsg('Chưa bật được micro. Em thử lại nhé.'); }
  };

  const tool = (label: string, icon: ReactNode, run: () => void, active = false): ReactNode => (
    <button type="button" aria-label={label} title={label} aria-pressed={active || undefined} onMouseDown={(e) => e.preventDefault()} onClick={run} className={`${BTN} ${active ? 'bg-brand-100 text-brand-700' : ''}`}>{icon}</button>
  );
  const ic = 'h-[18px] w-[18px]';
  const items = EMOJI_TABS.find((t) => t.id === tab)?.items ?? [];

  return (
    <div className="rounded-xl border-2 border-brand-200 bg-white focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100">
      <div role="toolbar" aria-label="Định dạng văn bản" className="relative flex flex-wrap items-center gap-0.5 border-b border-brand-100 px-1.5 py-1">
        {tool('Chữ đậm (Ctrl+B)', <Bold className={ic} aria-hidden />, () => exec('bold'))}
        {tool('Chữ nghiêng (Ctrl+I)', <Italic className={ic} aria-hidden />, () => exec('italic'))}
        {tool('Gạch chân (Ctrl+U)', <Underline className={ic} aria-hidden />, () => exec('underline'))}
        <span className="mx-0.5 h-5 w-px bg-brand-100" aria-hidden />
        {tool('Căn trái', <AlignLeft className={ic} aria-hidden />, () => exec('justifyLeft'))}
        {tool('Căn giữa', <AlignCenter className={ic} aria-hidden />, () => exec('justifyCenter'))}
        {tool('Căn phải', <AlignRight className={ic} aria-hidden />, () => exec('justifyRight'))}
        {tool('Xuống dòng', <CornerDownLeft className={ic} aria-hidden />, () => exec('insertParagraph'))}
        <span className="mx-0.5 h-5 w-px bg-brand-100" aria-hidden />
        {tool('Phông chữ', <Type className={ic} aria-hidden />, () => setPop(pop === 'font' ? null : 'font'), pop === 'font')}
        {tool('Cỡ chữ', <ALargeSmall className={ic} aria-hidden />, () => setPop(pop === 'size' ? null : 'size'), pop === 'size')}
        {tool('Màu chữ', <Palette className={ic} aria-hidden />, () => setPop(pop === 'color' ? null : 'color'), pop === 'color')}
        {tool('Biểu tượng minh họa', <Smile className={ic} aria-hidden />, () => setPop(pop === 'emoji' ? null : 'emoji'), pop === 'emoji')}
        {tool('Xóa định dạng', <Eraser className={ic} aria-hidden />, () => { exec('removeFormat'); exec('justifyLeft'); })}
        {canVoice && (
          <button type="button" aria-label={listening ? 'Dừng nhập bằng giọng nói' : 'Nhập bằng giọng nói'} title={listening ? 'Bấm để dừng' : 'Nhập bằng giọng nói (tiếng Việt). Giọng nói được trình duyệt gửi tới dịch vụ nhận dạng của nhà cung cấp trình duyệt.'}
            aria-pressed={listening} onMouseDown={(e) => e.preventDefault()} onClick={toggleVoice}
            className={`ml-auto flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 max-lg:h-11 ${listening ? 'bg-rose-600 text-white' : 'bg-brand-50 text-brand-700 hover:bg-brand-100'}`}>
            {listening ? <><Square className="h-3.5 w-3.5 fill-white" aria-hidden /> Dừng</> : <><Mic className="h-4 w-4" aria-hidden /> Nói</>}
          </button>
        )}

        {pop === 'color' && (
          <div role="group" aria-label="Chọn màu chữ" className="absolute left-1 top-full z-30 mt-1 flex flex-wrap gap-1.5 rounded-2xl border-[1.5px] border-brand-200 bg-white p-2 shadow-lift">
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { exec('foreColor', INK); setPop(null); }} aria-label="Màu mặc định (đen)" title="Màu mặc định"
              className="h-8 w-8 rounded-full border-2 border-white shadow ring-1 ring-brand-200 max-lg:h-11 max-lg:w-11" style={{ background: INK }} />
            {RICH_COLORS.map((c) => (
              <button key={c.hex} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { exec('foreColor', c.hex); setPop(null); }} aria-label={`Màu ${c.name}`} title={c.name}
                className="h-8 w-8 rounded-full border-2 border-white shadow ring-1 ring-brand-200 max-lg:h-11 max-lg:w-11" style={{ background: c.hex }} />
            ))}
          </div>
        )}
        {pop === 'font' && (
          <div role="group" aria-label="Chọn phông chữ" className="absolute left-1 top-full z-30 mt-1 max-h-64 w-[min(18rem,calc(100vw-3rem))] overflow-y-auto rounded-2xl border-[1.5px] border-brand-200 bg-white p-1.5 shadow-lift">
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { exec('fontName', 'inherit'); setPop(null); }}
              className="flex min-h-[40px] w-full items-center rounded-lg px-3 text-left text-sm font-bold text-ink-2 hover:bg-brand-50">Phông mặc định của bảng</button>
            {Object.keys(FONTS).map((k) => (
              <button key={k} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { exec('fontName', FONTS[k].label); setPop(null); }}
                style={{ fontFamily: FONTS[k].family }} className="flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-base hover:bg-brand-50 max-lg:min-h-[44px]">
                <span>{FONTS[k].label}</span><span className="text-[10px] font-bold uppercase text-ink-3" style={{ fontFamily: 'inherit' }}>{FONTS[k].group}</span>
              </button>
            ))}
          </div>
        )}
        {pop === 'size' && (
          <div role="group" aria-label="Chọn cỡ chữ" className="absolute left-1 top-full z-30 mt-1 flex flex-wrap gap-1.5 rounded-2xl border-[1.5px] border-brand-200 bg-white p-2 shadow-lift">
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { exec('fontSize', '3'); setPop(null); }}
              className="min-h-[40px] rounded-lg bg-brand-50 px-3 text-sm font-extrabold text-brand-700 hover:bg-brand-100 max-lg:min-h-[44px]">Vừa</button>
            {RICH_SIZES.map((z) => (
              <button key={z.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { exec('fontSize', String(z.html)); setPop(null); }}
                style={{ fontSize: `${Math.min(z.em, 1.4)}rem` }} className="min-h-[40px] rounded-lg bg-brand-50 px-3 font-extrabold text-brand-700 hover:bg-brand-100 max-lg:min-h-[44px]">{z.label}</button>
            ))}
          </div>
        )}
        {pop === 'emoji' && (
          <div role="group" aria-label="Biểu tượng minh họa" className="absolute left-1 top-full z-30 mt-1 w-[min(23rem,calc(100vw-3rem))] rounded-2xl border-[1.5px] border-brand-200 bg-white p-2 shadow-lift">
            <div role="tablist" aria-label="Chủ đề biểu tượng" className="mb-1.5 flex flex-wrap gap-1">
              {EMOJI_TABS.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onMouseDown={(e) => e.preventDefault()} onClick={() => setTab(t.id)}
                  className={`rounded-full px-2.5 py-1 text-xs font-extrabold max-lg:min-h-[40px] ${tab === t.id ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700 hover:bg-brand-100'}`}>{t.label}</button>
              ))}
            </div>
            <div className="grid grid-cols-8 gap-0.5">
              {items.map((em) => (
                <button key={em} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(em)} aria-label={`Chèn ${em}`}
                  className="flex h-10 w-full items-center justify-center rounded-lg text-2xl transition hover:bg-brand-50 max-lg:h-11">{em}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="relative">
        {empty && <span className="pointer-events-none absolute left-3 top-2 text-ink-3" style={{ fontSize: large ? '1rem' : '0.95rem' }}>{placeholder}</span>}
        <div ref={ed} contentEditable role="textbox" aria-multiline="true" aria-labelledby={labelledBy} spellCheck lang="vi"
          onInput={sync} onPaste={onPaste} onKeyDown={onKeyDown} onMouseDown={() => setPop(null)}
          className={`w-full overflow-y-auto whitespace-pre-wrap break-words rounded-b-xl px-3 py-2 text-ink outline-none ${large ? 'text-base' : 'text-[0.95rem]'}`}
          style={{ minHeight, maxHeight }} />
      </div>
      {(listening || voiceMsg) && (
        <p role={voiceMsg ? 'alert' : 'status'} className={`border-t border-brand-100 px-3 py-1.5 text-xs font-bold ${voiceMsg ? 'text-rose-700' : 'text-brand-700'}`}>
          {voiceMsg || (interim ? `Đang nghe: ${interim}` : 'Đang nghe… hãy nói vào micro, bấm “Dừng” khi xong.')}
        </p>
      )}
    </div>
  );
}
