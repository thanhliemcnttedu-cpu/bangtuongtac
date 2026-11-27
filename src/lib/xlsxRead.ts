/**
 * Đọc trang tính đầu tiên của tệp .xlsx ngay trong trình duyệt, không cần thư viện ngoài:
 * xlsx là gói ZIP gồm vài tệp XML, giải nén bằng DecompressionStream có sẵn.
 */
async function unzip(buf: ArrayBuffer, wanted: (name: string) => boolean): Promise<Map<string, string>> {
  const view = new DataView(buf);
  let end = buf.byteLength - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error('Tệp này không phải Excel (.xlsx). Hãy lưu lại dưới dạng .xlsx.');
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const out = new Map<string, string>();
  const text = new TextDecoder();
  for (let i = 0; i < count; i += 1) {
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const name = text.decode(new Uint8Array(buf, p + 46, nameLen));
    const local = view.getUint32(p + 42, true);
    p += 46 + nameLen + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
    if (!wanted(name)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = buf.slice(start, start + size);
    if (method === 0) out.set(name, text.decode(data));
    else out.set(name, await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text());
  }
  return out;
}

const colIndex = (ref: string): number => [...(ref.match(/^[A-Z]+/)?.[0] ?? 'A')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** Trả về các hàng của trang tính đầu tiên, mỗi ô là chuỗi. */
export async function readXlsxRows(file: Blob): Promise<string[][]> {
  const parts = await unzip(await file.arrayBuffer(), (n) => n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const first = [...parts.keys()].filter((n) => n.startsWith('xl/worksheets/')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))[0];
  if (!first) throw new Error('Không thấy trang tính trong tệp Excel.');
  const xml = (s: string): Document => new DOMParser().parseFromString(s, 'application/xml');
  const textOf = (el: Element): string => Array.from(el.getElementsByTagName('t')).map((t) => t.textContent ?? '').join('');
  const shared = parts.has('xl/sharedStrings.xml') ? Array.from(xml(parts.get('xl/sharedStrings.xml') as string).getElementsByTagName('si')).map(textOf) : [];
  return Array.from(xml(parts.get(first) as string).getElementsByTagName('row')).map((row) => {
    const cells: string[] = [];
    for (const c of Array.from(row.getElementsByTagName('c'))) {
      const type = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      cells[colIndex(c.getAttribute('r') ?? 'A')] = type === 's' ? shared[Number(v)] ?? '' : type === 'inlineStr' ? textOf(c) : v;
    }
    return Array.from(cells, (x) => (x ?? '').trim());
  });
}
