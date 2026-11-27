import { useRef, useState } from 'react';
import { ClipboardPaste, Download, FileSpreadsheet, ListChecks, Plus, Trash2, UserCheck } from 'lucide-react';
import type { BoardData, RosterMember } from '../types/board';
import { COLUMNS, blankMember, membersFromRows } from '../lib/teamRoster';
import { readXlsxRows } from '../lib/xlsxRead';
import { buildXlsx } from '../lib/xlsxWrite';
import { ModalShell } from './ModalShell';

interface Props {
  board: BoardData;
  onApply: (roster: RosterMember[]) => void;
  /** Chỉ chủ bảng: mời người này làm đồng quản lý bằng Gmail. */
  onInvite?: (email: string) => Promise<void>;
  onClose: () => void;
}

/** Hồ sơ thành viên của tổ: sửa từng người, nhập từ Excel hoặc dán, cho tổ phó cùng quản lý. */
export function TeamRosterModal({ board, onApply, onInvite, onClose }: Props) {
  const [rows, setRows] = useState<RosterMember[]>(() => board.roster.map((m) => ({ ...blankMember(m.id), ...m })));
  const [paste, setPaste] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const next = useRef(0);
  const newId = (): string => `${board.id}-moi-${Date.now()}-${(next.current += 1)}`;
  const managers = new Set((board.collaborators ?? []).filter((c) => c.role === 'editor').map((c) => c.email.toLowerCase()));
  const named = rows.filter((m) => m.name.trim());

  const set = (id: string, field: keyof RosterMember, value: string): void => setRows((list) => list.map((m) => (m.id === id ? { ...m, [field]: value } : m)));

  const take = (found: RosterMember[]): void => {
    if (found.length === 0) { setError('Không đọc được người nào. Hãy kiểm tra tệp có cột “Họ và tên”.'); return; }
    setRows(found); setError(''); setPaste(null);
    setMessage(`Đã đọc ${found.length} người. Kiểm tra rồi bấm “Lưu danh sách”.`);
  };

  const pickFile = async (file: File): Promise<void> => {
    setError(''); setMessage('');
    try {
      const table = /\.(csv|txt)$/i.test(file.name)
        ? (await file.text()).replace(String.fromCharCode(0xfeff), '').split(/\r?\n/).map((l) => l.split(l.includes('\t') ? '\t' : l.includes(';') ? ';' : ','))
        : await readXlsxRows(file);
      take(membersFromRows(table, newId()));
    } catch (e) { setError(e instanceof Error ? e.message : 'Không đọc được tệp.'); }
  };

  const template = (): void => {
    const blob = buildXlsx([{ name: 'Thanh vien', rows: [COLUMNS.map((c) => c.label), ...named.map((m) => COLUMNS.map((c) => m[c.field] ?? ''))], widths: COLUMNS.map((c) => c.width) }]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'danh-sach-thanh-vien-to.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const invite = async (email: string): Promise<void> => {
    setError(''); setMessage('');
    try { await onInvite?.(email); setMessage(`Đã cho ${email} cùng quản lý. Người này đăng nhập đúng Gmail là thấy bảng.`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không mời được.'); }
  };

  const save = (): void => {
    onApply(named.map((m) => ({ ...m, name: m.name.trim(), email: (m.email ?? '').trim().toLowerCase(), unit: m.unit.trim() })));
  };

  return (
    <ModalShell title="Thành viên của tổ" onClose={onClose} maxWidth="max-w-6xl">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <label className="btn-primary btn-sm cursor-pointer"><FileSpreadsheet className="h-4 w-4" aria-hidden /> Nhập từ Excel
            <input type="file" accept=".xlsx,.csv,.txt" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void pickFile(f); }} />
          </label>
          <button type="button" onClick={() => setPaste(paste === null ? '' : null)} className="btn-ghost btn-sm"><ClipboardPaste className="h-4 w-4" aria-hidden /> Dán danh sách</button>
          <button type="button" onClick={template} className="btn-ghost btn-sm"><Download className="h-4 w-4" aria-hidden /> {named.length > 0 ? 'Tải danh sách (Excel)' : 'Tải tệp mẫu'}</button>
          <button type="button" onClick={() => setRows((l) => [...l, blankMember(newId())])} className="btn-ghost btn-sm"><Plus className="h-4 w-4" aria-hidden /> Thêm một người</button>
        </div>

        {paste !== null && (
          <div>
            <label htmlFor="team-paste" className="field-label">Dán từ Excel (kèm hàng tiêu đề), mỗi người một dòng. Danh sách đang có sẽ được thay.</label>
            <textarea id="team-paste" className="input min-h-[120px] py-2 font-mono text-[13px]" value={paste} onChange={(e) => setPaste(e.target.value)} spellCheck={false}
              placeholder={COLUMNS.map((c) => c.label).join('\t')} />
            <button type="button" onClick={() => take(membersFromRows(paste.split(/\r?\n/).map((l) => l.split(l.includes('\t') ? '\t' : ',')), newId()))} className="btn-primary btn-sm mt-2">Đọc danh sách vừa dán</button>
          </div>
        )}

        {message && <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900">{message}</p>}
        {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-800">{error}</p>}

        {rows.length === 0 ? (
          <p className="rounded-2xl bg-brand-50 p-4 text-sm">Chưa có thành viên. Nhập từ Excel, dán danh sách hoặc thêm từng người.</p>
        ) : (
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {rows.map((m, i) => {
              const email = (m.email ?? '').trim().toLowerCase();
              return (
                <li key={m.id} className="rounded-2xl border-[1.5px] border-brand-100 bg-white p-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {COLUMNS.map((c) => (
                      <label key={c.field} className="block min-w-0">
                        <span className="block text-xs font-bold text-ink-2">{c.field === 'name' ? `${i + 1}. ${c.label}` : c.label}</span>
                        <input className="input" value={m[c.field] ?? ''} onChange={(e) => set(m.id, c.field, e.target.value)} />
                      </label>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    {onInvite && email && (managers.has(email)
                      ? <span className="chip bg-emerald-100 text-emerald-900 ring-emerald-200">Đang cùng quản lý</span>
                      : <button type="button" onClick={() => void invite(email)} className="btn-ghost btn-sm"><UserCheck className="h-4 w-4" aria-hidden /> Cho cùng quản lý</button>)}
                    <button type="button" onClick={() => setRows((l) => l.filter((x) => x.id !== m.id))} className="btn-ghost btn-sm" aria-label={`Xóa ${m.name || `người thứ ${i + 1}`}`}><Trash2 className="h-4 w-4" aria-hidden /> Xóa</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-xs text-ink-2">Giới tính, ngày sinh, lớp và nhiệm vụ chỉ người quản lý tổ xem được. Người nộp bài chỉ thấy họ tên, nhóm và chức vụ.</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold">{named.length} người · {named.filter((m) => (m.email ?? '').trim()).length} có Gmail</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-ghost">Đóng</button>
            <button type="button" onClick={save} className="btn-primary"><ListChecks className="h-4 w-4" aria-hidden /> Lưu danh sách</button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
