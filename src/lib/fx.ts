/** Hiệu ứng nhỏ dùng chung: gợn sóng khi bấm nút và quầng sáng theo con trỏ trên thẻ. Tắt khi người dùng chọn giảm chuyển động. */
export function initFx(): void {
  if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  document.addEventListener('pointermove', (e) => {
    const card = (e.target as Element | null)?.closest?.('article.rounded-3xl') as HTMLElement | null;
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });

  document.addEventListener('click', (e) => {
    const btn = (e.target as Element | null)?.closest?.('.btn, .btn-primary, .btn-ghost') as HTMLElement | null;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height);
    const dot = document.createElement('span');
    dot.className = 'rip';
    dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    btn.appendChild(dot);
    window.setTimeout(() => dot.remove(), 650);
  });
}

/** Chọn biểu tượng theo chữ trên nút (nút đã có biểu tượng thì bỏ qua). */
const ICON_RULES: Array<[RegExp, string]> = [
  [/^(hủy|đóng|bỏ)/i, 'x'], [/^xóa/i, 'trash'], [/nhân bản/i, 'copy'], [/^lưu/i, 'save'],
  [/^(xong|đồng ý|xác nhận)/i, 'check'], [/^giao bài/i, 'list'], [/^(nộp|gửi)/i, 'send'],
  [/^xem/i, 'eye'], [/^(mở|làm ngay)/i, 'ext'], [/^(thêm|tạo)/i, 'plus'],
];

function decorateButtons(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('.btn-primary, .btn-ghost').forEach((b) => {
    if (b.querySelector('svg')) { b.removeAttribute('data-ic'); return; }
    const label = (b.textContent ?? '').trim();
    const hit = ICON_RULES.find(([re]) => re.test(label));
    if (hit && label.length > 1) { if (b.dataset.ic !== hit[1]) b.dataset.ic = hit[1]; } else b.removeAttribute('data-ic');
  });
}

export function initButtonIcons(): void {
  if (typeof document === 'undefined') return;
  let queued = false;
  const run = (): void => { queued = false; decorateButtons(document); };
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(run); } })
    .observe(document.body, { childList: true, subtree: true, characterData: true });
  run();
}
