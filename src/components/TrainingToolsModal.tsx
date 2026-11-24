import { useEffect, useMemo, useState } from 'react';
import { Award, CalendarCheck, Check, FileSpreadsheet, Medal, Plus, Printer, Trash2, Trophy } from 'lucide-react';
import type { BoardData } from '../types/board';
import type { BoardStore } from '../hooks/useBoardStore';
import { normalize } from '../lib/boardLogic';
import { downloadCsv } from '../lib/csv';
import { certificatesHtml, courseSummary, eligible, memberStatuses, rankShowcase, summaryHtml, summaryRows } from '../lib/training';
import { printHtml } from '../lib/taskReport';
import { ModalShell } from './ModalShell';

export type TrainingTab = 'attendance' | 'certificate' | 'showcase' | 'summary';

interface Props {
  board: BoardData;
  store: BoardStore;
  initialTab: TrainingTab;
  onClose: () => void;
}

const TABS: { id: TrainingTab; label: string; Icon: typeof Award }[] = [
  { id: 'attendance', label: 'Điểm danh', Icon: CalendarCheck }, { id: 'certificate', label: 'Chứng nhận', Icon: Award },
  { id: 'showcase', label: 'Triển lãm', Icon: Trophy }, { id: 'summary', label: 'Tổng kết khóa', Icon: Medal },
];
const todayIso = (): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dayText = (iso: string): string => iso.split('-').reverse().join('/');

/** Công cụ lớp tập huấn: điểm danh từng buổi, giấy chứng nhận, triển lãm sản phẩm theo bình chọn, tổng kết khóa. Chỉ giáo viên dùng. */
export function TrainingToolsModal({ board, store, initialTab, onClose }: Props) {
  const [tab, setTab] = useState<TrainingTab>(initialTab);
  const [minPct, setMinPct] = useState(80);
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<void>): Promise<void> => { setError(''); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Không thực hiện được.'); } };

  useEffect(() => { void run(() => store.loadAttendance(board.id)); /* tải điểm danh một lần khi mở */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.id]);

  const sessions = board.attendance ?? [];
  const [day, setDay] = useState('');
  const current = sessions.find((s) => s.day === day) ?? sessions[sessions.length - 1];
  const [newDay, setNewDay] = useState(todayIso());
  const [newLabel, setNewLabel] = useState('');
  const statuses = useMemo(() => memberStatuses(board), [board]);
  const summary = useMemo(() => courseSummary(board, minPct), [board, minPct]);

  const [picked, setPicked] = useState<ReadonlySet<string> | null>(null);
  const [cert, setCert] = useState({ issuer: '', signerTitle: 'Giảng viên', signerName: '', place: '' });
  const ok = eligible(statuses, minPct);
  const chosen = picked ?? new Set(ok.map((m) => m.member.id));
  const inp = 'input';

  return (
    <ModalShell title="Công cụ lớp tập huấn" onClose={onClose} maxWidth="max-w-4xl">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1 border-b border-brand-100" role="tablist" aria-label="Công cụ">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`-mb-px flex items-center gap-1.5 border-b-[3px] px-3 py-2 text-sm font-extrabold ${tab === id ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-2 hover:text-ink'}`}><Icon className="h-4 w-4" aria-hidden /> {label}</button>
          ))}
        </div>
        {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p>}
        {board.roster.length === 0 && tab !== 'showcase' && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">Bảng chưa có danh sách học viên. Hãy bấm “Danh sách” để dán danh sách trước.</p>}

        {tab === 'attendance' && (
          <section aria-label="Điểm danh" className="grid grid-cols-1 gap-4 md:grid-cols-[220px_1fr]">
            <div className="space-y-2">
              <ul className="max-h-[260px] space-y-1 overflow-y-auto" aria-label="Các buổi">
                {sessions.length === 0 && <li className="text-sm text-ink-2">Chưa có buổi nào.</li>}
                {sessions.map((s) => (
                  <li key={s.day}><button type="button" aria-pressed={current?.day === s.day} onClick={() => setDay(s.day)} className={`w-full rounded-xl border-[1.5px] px-3 py-2 text-left text-sm ${current?.day === s.day ? 'border-brand-500 bg-brand-50' : 'border-brand-100 bg-white hover:bg-brand-50'}`}>
                    <b className="block">{dayText(s.day)}</b><span className="block truncate text-xs text-ink-2">{s.label || 'Buổi tập huấn'} · {s.present.length}/{board.roster.length} có mặt</span></button></li>
                ))}
              </ul>
              <form onSubmit={(e) => { e.preventDefault(); void run(async () => { await store.addAttendanceSession(board.id, newDay, newLabel.trim()); setDay(newDay); setNewLabel(''); }); }} className="space-y-1.5 rounded-2xl bg-brand-50/70 p-2.5">
                <label htmlFor="at-day" className="field-label">Thêm buổi</label>
                <input id="at-day" type="date" className={inp} value={newDay} onChange={(e) => setNewDay(e.target.value)} required />
                <input className={inp} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Tên buổi (không bắt buộc)" aria-label="Tên buổi" />
                <button type="submit" className="btn-primary btn-sm w-full"><Plus className="h-3.5 w-3.5" aria-hidden /> Thêm buổi</button>
              </form>
            </div>
            <div>
              {!current ? <p className="rounded-2xl border border-dashed border-brand-200 p-8 text-center text-ink-2">Thêm một buổi để bắt đầu điểm danh.</p> : (
                <>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <b className="text-sm">{dayText(current.day)}{current.label ? ` · ${current.label}` : ''}: {current.present.length}/{board.roster.length} có mặt</b>
                    <span className="ml-auto flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => void run(async () => { for (const m of board.roster) if (!current.present.includes(normalize(m.name))) await store.setAttendancePresent(board.id, current.day, normalize(m.name), true); })} className="btn-ghost btn-sm">Có mặt cả lớp</button>
                      <button type="button" onClick={() => void run(async () => { for (const k of [...current.present]) await store.setAttendancePresent(board.id, current.day, k, false); })} className="btn-ghost btn-sm">Bỏ chọn hết</button>
                      <button type="button" onClick={() => void run(() => store.removeAttendanceSession(board.id, current.day))} className="btn-ghost btn-sm hover:!border-rose-300 hover:!text-rose-700" aria-label="Xóa buổi này"><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
                    </span>
                  </div>
                  <ul className="grid max-h-[300px] grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                    {board.roster.map((m) => {
                      const k = normalize(m.name); const on = current.present.includes(k);
                      return (
                        <li key={m.id}><label className={`flex cursor-pointer items-center gap-2 rounded-xl border-[1.5px] px-3 py-1.5 text-sm ${on ? 'border-emerald-300 bg-emerald-50' : 'border-brand-100 bg-white'}`}>
                          <input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={on} onChange={(e) => void run(() => store.setAttendancePresent(board.id, current.day, k, e.target.checked))} />
                          <span className="min-w-0 flex-1 truncate font-semibold">{m.name}</span>{m.unit && <span className="truncate text-xs text-ink-2">{m.unit}</span>}</label></li>
                      );
                    })}
                  </ul>
                </>
              )}
              {sessions.length > 0 && <button type="button" onClick={() => downloadCsv('diem-danh.csv', [['STT', 'Họ tên', 'Đơn vị', ...sessions.map((s) => `${dayText(s.day)}${s.label ? ` ${s.label}` : ''}`), 'Có mặt', 'Tỉ lệ'], ...board.roster.map((m, i) => { const k = normalize(m.name); const p = sessions.filter((s) => s.present.includes(k)).length; return [String(i + 1), m.name, m.unit, ...sessions.map((s) => (s.present.includes(k) ? 'x' : '')), String(p), `${Math.round((p / sessions.length) * 100)}%`]; })])} className="btn-ghost btn-sm mt-2"><FileSpreadsheet className="h-3.5 w-3.5" aria-hidden /> Tải bảng điểm danh (CSV)</button>}
            </div>
          </section>
        )}

        {tab === 'certificate' && (
          <section aria-label="Giấy chứng nhận" className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div><label htmlFor="ce-pct" className="field-label">Có mặt tối thiểu (%) <span className="font-normal text-ink-2">— bỏ qua nếu chưa điểm danh</span></label>
                <input id="ce-pct" type="number" min={0} max={100} className={inp} value={minPct} onChange={(e) => { setMinPct(Math.min(100, Math.max(0, Number(e.target.value) || 0))); setPicked(null); }} /></div>
              <div><label htmlFor="ce-issuer" className="field-label">Đơn vị cấp</label><input id="ce-issuer" className={inp} value={cert.issuer} onChange={(e) => setCert({ ...cert, issuer: e.target.value })} placeholder="Phòng Giáo dục và Đào tạo …" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label htmlFor="ce-st" className="field-label">Chức danh ký</label><input id="ce-st" className={inp} value={cert.signerTitle} onChange={(e) => setCert({ ...cert, signerTitle: e.target.value })} /></div>
                <div><label htmlFor="ce-sn" className="field-label">Người ký</label><input id="ce-sn" className={inp} value={cert.signerName} onChange={(e) => setCert({ ...cert, signerName: e.target.value })} /></div>
              </div>
              <div><label htmlFor="ce-pl" className="field-label">Địa danh</label><input id="ce-pl" className={inp} value={cert.place} onChange={(e) => setCert({ ...cert, place: e.target.value })} placeholder="Ví dụ: Vĩnh Long" /></div>
              <button type="button" disabled={chosen.size === 0} onClick={() => printHtml(certificatesHtml(statuses.filter((m) => chosen.has(m.member.id)).map((m) => m.member.name), { course: board.title, ...cert }, new Date()))} className="btn-primary w-full"><Printer className="h-4 w-4" aria-hidden /> In / lưu PDF {chosen.size} giấy</button>
              <p className="text-xs text-ink-2">Mỗi học viên một trang A4 ngang. Trong hộp in chọn “Lưu thành PDF” để gửi qua Zalo.</p>
            </div>
            <div>
              <p className="mb-1 text-sm font-extrabold">Đủ điều kiện: {ok.length}/{statuses.length}</p>
              <ul className="max-h-[300px] space-y-1 overflow-y-auto" aria-label="Học viên đủ điều kiện">
                {ok.map((m) => <li key={m.member.id}><label className="flex cursor-pointer items-center gap-2 rounded-xl border border-brand-100 bg-white px-3 py-1.5 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={chosen.has(m.member.id)} onChange={(e) => { const n = new Set(chosen); if (e.target.checked) n.add(m.member.id); else n.delete(m.member.id); setPicked(n); }} /><span className="flex-1 truncate font-semibold">{m.member.name}</span><span className="text-xs text-ink-2">{m.attendancePct === null ? 'chưa điểm danh' : `có mặt ${m.attendancePct}%`}</span></label></li>)}
                {ok.length === 0 && <li className="text-sm text-ink-2">Chưa ai nộp đủ việc{statuses.some((m) => m.attendancePct !== null) ? ' và đủ số buổi có mặt' : ''}.</li>}
              </ul>
            </div>
          </section>
        )}

        {tab === 'showcase' && (() => {
          const ranked = rankShowcase(board).slice(0, 12);
          const thumb = (i: number) => ranked[i]?.card.attachments.find((a) => a.type === 'image' && a.url && !a.driveId)?.url;
          return (
            <section aria-label="Triển lãm sản phẩm">
              {!board.settings.peerStars && <p className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Đang tắt “Học sinh chấm sao bài của bạn” trong Cài đặt nên chưa có bình chọn mới. Bảng xếp hạng dưới đây dựa trên các lượt đã có.</p>}
              {ranked.length === 0 ? <p className="rounded-2xl border border-dashed border-brand-200 p-8 text-center text-ink-2">Chưa có sản phẩm nào được duyệt.</p> : (
                <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Xếp hạng theo bình chọn">
                  {ranked.map((r, i) => (
                    <li key={r.card.id} className={`flex items-center gap-3 rounded-2xl border-[1.5px] p-2.5 ${i < 3 ? 'border-amber-300 bg-amber-50/60' : 'border-brand-100 bg-white'}`}>
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${i === 0 ? 'bg-amber-400 text-ink' : i === 1 ? 'bg-slate-300 text-ink' : i === 2 ? 'bg-orange-300 text-ink' : 'bg-brand-100 text-brand-800'}`}>{i + 1}</span>
                      {thumb(i) && <img src={thumb(i)} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-xl object-cover" />}
                      <span className="min-w-0 flex-1"><b className="block truncate text-sm">{r.card.title}</b><span className="block truncate text-xs text-ink-2">{r.card.authorName}{r.card.unit ? ` · ${r.card.unit}` : ''}</span></span>
                      <span className="shrink-0 text-right text-xs"><b className="block text-base">{r.votes ? `${r.avg.toFixed(1)}★` : '—'}</b>{r.votes ? `${r.votes} lượt` : 'chưa có'}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          );
        })()}

        {tab === 'summary' && (
          <section aria-label="Tổng kết khóa" className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[['Học viên', summary.list.length], ['Hoàn thành việc', summary.list.filter((m) => m.completed).length], ['Đủ điều kiện', summary.ok.length], ['Buổi điểm danh', summary.sessions.length], ['Có mặt TB', summary.avgAtt === null ? '—' : `${summary.avgAtt}%`]].map(([l, v]) => (
                <p key={String(l)} className="rounded-2xl border-[1.5px] border-brand-100 bg-white px-3 py-2 text-center"><b className="block text-2xl">{v}</b><span className="text-xs text-ink-2">{l}</span></p>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div><label htmlFor="su-pct" className="field-label">Có mặt tối thiểu (%)</label><input id="su-pct" type="number" min={0} max={100} className={`${inp} !w-28`} value={minPct} onChange={(e) => setMinPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} /></div>
              <button type="button" onClick={() => printHtml(summaryHtml(board, minPct))} className="btn-primary"><Printer className="h-4 w-4" aria-hidden /> In / lưu PDF (1 trang)</button>
              <button type="button" onClick={() => downloadCsv('tong-ket-khoa.csv', summaryRows(board, minPct))} className="btn-ghost"><FileSpreadsheet className="h-4 w-4" aria-hidden /> Tải CSV</button>
            </div>
            <ul className="space-y-1 text-sm" aria-label="Theo đơn vị">
              {summary.units.map(([u, x]) => <li key={u} className="flex items-center gap-2"><span className="w-40 truncate font-semibold">{u}</span><span className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200"><span className="block h-full rounded-full bg-[color:var(--st-done)]" style={{ width: `${Math.round((x.completed / x.total) * 100)}%` }} /></span><span className="w-14 text-right text-xs font-bold">{x.completed}/{x.total}</span></li>)}
            </ul>
            {summary.ok.length > 0 && <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-700"><Check className="h-4 w-4" aria-hidden /> {summary.ok.length} học viên đủ điều kiện nhận giấy chứng nhận.</p>}
          </section>
        )}
      </div>
    </ModalShell>
  );
}
