/** Chỉ cho phép http(s) và blob: dữ liệu từ CSDL do khách nhập nên không được tin: chặn javascript:, data:… */
export function safeHref(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return /^(https?:|blob:)/i.test(url) ? url : undefined;
}
