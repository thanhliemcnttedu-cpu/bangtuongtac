import type { RosterMember } from '../types/board';
import { normalize } from './boardLogic';
import { normalizeName } from './editCode';

export type Field = 'name' | 'gender' | 'birthDate' | 'role' | 'homeroom' | 'teaching' | 'email' | 'unit';

export const COLUMNS: { field: Field; label: string; width: number }[] = [
  { field: 'name', label: 'Họ và tên', width: 26 },
  { field: 'gender', label: 'Giới tính', width: 10 },
  { field: 'birthDate', label: 'Ngày sinh', width: 13 },
  { field: 'role', label: 'Chức vụ', width: 18 },
  { field: 'homeroom', label: 'Lớp chủ nhiệm', width: 14 },
  { field: 'teaching', label: 'Nhiệm vụ giảng dạy', width: 30 },
  { field: 'email', label: 'Gmail', width: 28 },
  { field: 'unit', label: 'Nhóm / khối', width: 14 },
];

/** Tên cột người dùng hay đặt (đã bỏ dấu, viết thường) → trường tương ứng. Thứ tự kiểm tra có ý nghĩa. */
const HEADERS: [RegExp, Field][] = [
  [/ho (va )?ten|^ten$|giao vien/, 'name'],
  [/gioi tinh|^gt$/, 'gender'],
  [/ngay.*sinh|nam sinh|sinh ngay/, 'birthDate'],
  [/chuc vu|chuc danh|vai tro/, 'role'],
  [/chu nhiem|^lop|^cn/, 'homeroom'],
  [/nhiem vu|giang day|phan cong|mon day/, 'teaching'],
  [/mail/, 'email'],
  [/nhom|khoi|don vi|^to$/, 'unit'],
];

const pad = (n: number): string => String(n).padStart(2, '0');

/** Excel lưu ngày dưới dạng số ngày kể từ 30/12/1899: đổi về dd/mm/yyyy; chữ thì giữ nguyên. */
export function birthText(value: string): string {
  const n = Number(value);
  if (!/^\d{4,6}(\.\d+)?$/.test(value) || n < 5000 || n > 80000) return value;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86_400_000);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export const blankMember = (id: string): RosterMember => ({ id, name: '', unit: '', role: '', email: '', gender: '', birthDate: '', homeroom: '', teaching: '' });

/**
 * Đọc bảng (từ Excel hoặc dán): dòng có cột "Họ tên" là dòng tiêu đề, cột nhận theo tên nên thứ tự tùy ý.
 * Không có tiêu đề thì hiểu theo thứ tự cột của tệp mẫu.
 */
export function membersFromRows(rows: string[][], idPrefix: string): RosterMember[] {
  const clean = rows.map((r) => r.map((c) => (c ?? '').trim())).filter((r) => r.some(Boolean));
  const fieldOf = (h: string): Field | undefined => HEADERS.find(([re]) => re.test(normalize(h)))?.[1];
  const headAt = clean.slice(0, 10).findIndex((r) => r.some((c) => fieldOf(c) === 'name' && /ten/.test(normalize(c))));
  let map: (Field | undefined)[] = COLUMNS.map((c) => c.field);
  if (headAt >= 0) {
    const used = new Set<Field>();
    map = clean[headAt].map((h) => { const f = h ? fieldOf(h) : undefined; if (!f || used.has(f)) return undefined; used.add(f); return f; });
  } else if (clean.length > 0 && /^\d+$/.test(clean[0][0] ?? '')) {
    map = [undefined, ...map]; // cột đầu là số thứ tự
  }
  const out: RosterMember[] = [];
  const seen = new Set<string>();
  for (const row of clean.slice(headAt + 1)) {
    const m = blankMember(`${idPrefix}-${out.length + 1}`);
    map.forEach((f, i) => { if (f) m[f] = f === 'birthDate' ? birthText(row[i] ?? '') : row[i] ?? ''; });
    m.email = (m.email ?? '').toLowerCase();
    const key = normalizeName(m.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

/** Chuỗi dùng để giao việc cho đúng một người: Gmail nếu có, không thì theo tên. */
export const assigneeKey = (m: Pick<RosterMember, 'name' | 'email'>): string => (m.email ?? '').trim().toLowerCase() || `ten:${normalizeName(m.name)}`;

/** Người này có nằm trong danh sách được giao không. */
export const isAssignee = (keys: string[], m: { name?: string; email?: string }): boolean =>
  (!!m.email && keys.includes(m.email.trim().toLowerCase())) || (!!m.name && keys.includes(`ten:${normalizeName(m.name)}`));
