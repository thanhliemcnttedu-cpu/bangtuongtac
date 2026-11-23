// Sinh khối SQL danh sách từ chặn từ src/data/blockedTerms.json và ghi vào docs/schema.sql
// giữa hai dòng đánh dấu BEGIN/END. Chạy: npm run gen:moderation
// Mục đích: một nguồn duy nhất cho bộ lọc ở trình duyệt (moderation.ts) và ở CSDL (hàm comment_problem).
import { readFileSync, writeFileSync } from 'node:fs';

const terms = JSON.parse(readFileSync(new URL('../src/data/blockedTerms.json', import.meta.url), 'utf8'));
const schemaPath = new URL('../docs/schema.sql', import.meta.url);
let sql = readFileSync(schemaPath, 'utf8');

const esc = (s) => s.replace(/'/g, "''");
const rows = [
  ...terms.accent.map((t) => `('${esc(t.toLowerCase())}','accent')`),
  ...terms.plain.map((t) => `('${esc(t.toLowerCase())}','plain')`),
  ...terms.allow.map((t) => `('${esc(t.toLowerCase())}','allow')`),
];
const block = [
  '-- BEGIN moderation terms (tự sinh từ src/data/blockedTerms.json; sửa ở đó rồi chạy `npm run gen:moderation`)',
  'delete from public.blocked_terms;',
  `insert into public.blocked_terms(term, kind) values\n  ${rows.join(',\n  ')}\non conflict do nothing;`,
  '-- END moderation terms',
].join('\n');

const re = /-- BEGIN moderation terms[\s\S]*?-- END moderation terms/;
if (!re.test(sql)) {
  console.error('Không thấy khối BEGIN/END moderation terms trong docs/schema.sql');
  process.exit(1);
}
sql = sql.replace(re, () => block);
writeFileSync(schemaPath, sql, 'utf8');
console.log(`Đã ghi ${rows.length} từ vào docs/schema.sql`);
