// Làm sạch HTML sinh ra từ tệp Word của người khác trước khi hiển thị trong trang.
// Theo hướng danh sách cho phép: giữ thẻ văn bản/bảng/ảnh cơ bản, bỏ mọi thẻ chủ động (script, iframe, form…),
// mọi thuộc tính sự kiện (onclick…) và mọi địa chỉ không phải http(s)/mailto/ảnh base64.

const BLOCKED_TAGS = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT',
  'BASE', 'SVG', 'MATH', 'AUDIO', 'VIDEO', 'SOURCE', 'TRACK', 'CANVAS', 'TEMPLATE', 'NOSCRIPT',
]);
const ALLOWED_ATTRS = new Set(['href', 'src', 'alt', 'title', 'colspan', 'rowspan']);
const SAFE_HREF = /^(https?:|mailto:|#)/i;
const SAFE_SRC = /^(https?:|data:image\/(png|jpe?g|gif|webp);base64,)/i;

export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.body.querySelectorAll('*').forEach((el) => {
    if (BLOCKED_TAGS.has(el.tagName.toUpperCase())) { el.remove(); return; }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();
      if (!ALLOWED_ATTRS.has(name)) el.removeAttribute(attr.name);
      else if (name === 'href' && !SAFE_HREF.test(value)) el.removeAttribute(attr.name);
      else if (name === 'src' && !SAFE_SRC.test(value)) el.removeAttribute(attr.name);
    }
    if (el.tagName === 'A' && el.hasAttribute('href')) {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }
  });
  return doc.body.innerHTML;
}
