import { useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { buildXlsx } from '../lib/xlsxWrite';
import type { BoardData } from '../types/board';
import { buildRows, computeKpis, rosterMatcher, summarizeByUnit } from '../lib/boardLogic';
import { taskProgress } from '../lib/lessons';

interface Props {
  boards: BoardData[];
  currentId?: string;
}

const COLORS = { done: 'var(--st-done)', wait: 'var(--st-wait)', miss: 'var(--st-miss)', other: 'var(--st-doing)', late: 'var(--st-late)' } as const;
const pad = (n: number): string => String(n).padStart(2, '0');

/** Vòng tròn tỉ lệ: mỗi phần một màu trạng thái; số ở giữa là tỉ lệ hoàn thành. */
function Donut({ parts, center }: { parts: { label: string; value: number; color: string }[]; center: string }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  const R = 52; const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0" role="img" aria-label={`Biểu đồ vòng: ${parts.map((p) => `${p.label} ${p.value}`).join(', ')}`}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="#e2e8f0" strokeWidth="18" />
        {total > 0 && parts.filter((p) => p.value > 0).map((p) => {
          const len = (p.value / total) * C;
          const el = <circle key={p.label} cx="70" cy="70" r={R} fill="none" stroke={p.color} strokeWidth="18" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)" />;
          offset += len;
          return el;
        })}
        <text x="70" y="76" textAnchor="middle" className="fill-ink text-[22px] font-extrabold">{center}</text>
      </svg>
      <ul className="space-y-1 text-sm">
        {parts.map((p) => <li key={p.label} className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ background: p.color }} aria-hidden /> {p.label}: <b>{p.value}</b></li>)}
      </ul>
    </div>
  );
}

/** Cột chồng theo nhóm: đã xong / chờ / chưa nộp trên cùng một thanh. */
function StackedBars({ rows }: { rows: { unit: string; done: number; waiting: number; notSubmitted: number; total: number }[] }) {
  const H = 26;
  return (
    <svg viewBox={`0 0 560 ${rows.length * H + 4}`} className="w-full max-w-[680px]" role="img" aria-label="Biểu đồ cột chồng theo nhóm">
      {rows.map((r, i) => {
        const w = (v: number): number => (r.total === 0 ? 0 : (v / r.total) * 380);
        const other = Math.max(0, r.total - r.done - r.waiting - r.notSubmitted);
        let x = 150;
        const seg = (v: number, color: string, key: string) => { const el = <rect key={key} x={x} y={i * H + 4} width={w(v)} height={H - 8} rx="3" fill={color} />; x += w(v); return el; };
        return (
          <g key={r.unit}>
            <text x="144" y={i * H + 18} textAnchor="end" className="fill-ink text-[12px] font-bold">{r.unit.length > 20 ? `${r.unit.slice(0, 19)}…` : r.unit}</text>
            <rect x="150" y={i * H + 4} width="380" height={H - 8} rx="3" fill="#e2e8f0" />
            {seg(r.done, COLORS.done, 'd')}{seg(r.waiting, COLORS.wait, 'w')}{seg(other, COLORS.other, 'o')}{seg(r.notSubmitted, COLORS.miss, 'n')}
            <text x="536" y={i * H + 18} className="fill-ink-2 text-[11px] font-bold">{r.done}/{r.total}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Số bài nộp mỗi ngày trong 14 ngày gần nhất. */
function DayBars({ days }: { days: { label: string; n: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.n));
  const W = 560; const H = 130; const bw = W / days.length;
  return (
    <svg viewBox={`0 0 ${W} ${H + 22}`} className="w-full max-w-[680px]" role="img" aria-label={`Số bài nộp mỗi ngày: ${days.map((d) => `${d.label} ${d.n}`).join(', ')}`}>
      {days.map((d, i) => {
        const h = (d.n / max) * (H - 18);
        return (
          <g key={d.label}>
            <rect x={i * bw + 5} y={H - h} width={bw - 10} height={Math.max(h, d.n > 0 ? 3 : 0)} rx="3" fill="var(--st-doing)" />
            {d.n > 0 && <text x={i * bw + bw / 2} y={H - h - 4} textAnchor="middle" className="fill-ink text-[11px] font-bold">{d.n}</text>}
            <text x={i * bw + bw / 2} y={H + 14} textAnchor="middle" className="fill-ink-2 text-[10px]">{d.label}</text>
          </g>
        );
      })}
      <line x1="0" y1={H} x2={W} y2={H} stroke="#cbd5e1" />
    </svg>
  );
}

/** Báo cáo của một bảng: số liệu chính, biểu đồ vòng, cột chồng theo nhóm, bài nộp theo ngày, ai chưa nộp / nộp muộn nhiều nhất. */
export function ReportsPage({ boards, currentId }: Props) {
  const list = boards.filter((b) => !b.deletedAt && !b.settings.personal);
  const [id, setId] = useState(() => (list.some((b) => b.id === currentId) ? (currentId as string) : list[0]?.id ?? ''));
  const board = list.find((b) => b.id === id) ?? list[0];

  const data = useMemo(() => {
    if (!board) return null;
    const rows = buildRows(board);
    const k = computeKpis(rows);
    const other = Math.max(0, k.total - k.done - k.waiting - k.notSubmitted);
    const units = summarizeByUnit(rows, board.settings.scope === 'grade');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() - (13 - i)); return d; }).map((d) => {
      const next = new Date(d); next.setDate(next.getDate() + 1);
      return { label: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`, n: board.cards.filter((c) => { const t = Date.parse(c.submittedAt); return t >= d.getTime() && t < next.getTime(); }).length };
    });
    // Ai chưa nộp nhiều việc nhất / nộp muộn nhiều nhất (theo từng việc đã giao).
    const missCount = new Map<string, { name: string; n: number }>();
    for (const t of board.tasks) for (const m of taskProgress(board, t).missing) missCount.set(m.id, { name: m.name, n: (missCount.get(m.id)?.n ?? 0) + 1 });
    const match = rosterMatcher(board.roster);
    const lateCount = new Map<string, { name: string; n: number }>();
    for (const c of board.cards) if (c.late) { const m = match(c); const key = m?.id ?? c.authorName; lateCount.set(key, { name: m?.name ?? c.authorName, n: (lateCount.get(key)?.n ?? 0) + 1 }); }
    const top = (m: Map<string, { name: string; n: number }>) => [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'vi')).slice(0, 5);
    return { k, other, units, days, miss: top(missCount), late: top(lateCount), lateTotal: board.cards.filter((c) => c.late).length };
  }, [board]);

  if (!board || !data) return <main className="mx-auto max-w-3xl p-10 text-center text-ink-2">Chưa có bảng nào để báo cáo.</main>;
  const { k } = data;
  const exportXlsx = (): void => {
    const blob = buildXlsx([
      { name: 'Tổng hợp', widths: [34, 18], rows: [['Chỉ số', 'Giá trị'], ['Bảng', board.title], ['Ngày xuất', new Date().toLocaleString('vi-VN')], ['Tổng người', k.total], ['Đã hoàn thành', k.done], ['Chờ duyệt / đang làm', k.waiting], ['Chưa nộp', k.notSubmitted], ['Khác (cần sửa…)', data.other], ['Tỉ lệ hoàn thành (%)', k.completionPct], ['Bài nộp muộn', data.lateTotal]] },
      { name: 'Theo nhóm', widths: [28, 12, 14, 12, 10], rows: [['Nhóm', 'Hoàn thành', 'Chờ / đang làm', 'Chưa nộp', 'Tổng'], ...data.units.map((u) => [u.unit, u.done, u.waiting, u.notSubmitted, u.total])] },
      { name: 'Cần nhắc', widths: [32, 22, 32, 18], rows: [['Chưa nộp nhiều việc nhất', 'Số việc', 'Nộp muộn nhiều nhất', 'Số bài'], ...Array.from({ length: Math.max(data.miss.length, data.late.length) }, (_, i) => [data.miss[i]?.name ?? '', data.miss[i]?.n ?? '', data.late[i]?.name ?? '', data.late[i]?.n ?? ''])] },
      { name: 'Theo ngày', widths: [14, 14], rows: [['Ngày', 'Số bài nộp'], ...data.days.map((d) => [d.label, d.n])] },
    ]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `bao-cao-${board.title.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60)}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  const card = 'rounded-2xl border-[1.5px] border-brand-100 bg-white p-4';
  const kpi = (label: string, value: string, color: string) => <p className={`${card} text-center`}><b className="block text-3xl font-extrabold" style={{ color }}>{value}</b><span className="text-xs font-bold text-ink-2">{label}</span></p>;

  return (
    <main className="mx-auto w-full max-w-[min(100%,1400px)] space-y-4 px-4 py-5 pb-28 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-extrabold">Báo cáo</h1><p className="text-sm text-ink-2">Tình hình nộp bài và hoàn thành của một bảng.</p></div>
        <div className="flex flex-wrap items-end gap-2"><div className="min-w-[220px]"><label htmlFor="rp-board" className="field-label">Bảng</label>
          <select id="rp-board" className="input" value={board.id} onChange={(e) => setId(e.target.value)}>{list.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</select></div>
          <button type="button" onClick={exportXlsx} className="btn-primary max-lg:min-h-[44px] print:hidden"><Download className="h-4 w-4" aria-hidden /> Xuất Excel</button>
          <button type="button" onClick={() => window.print()} className="btn-ghost max-lg:min-h-[44px] print:hidden"><Printer className="h-4 w-4" aria-hidden /> In / Lưu PDF</button>
        </div>
      </header>

      <section aria-label="Số liệu chính" className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {kpi('Tổng người', String(k.total), 'var(--st-todo)')}{kpi('Đã hoàn thành', String(k.done), COLORS.done)}{kpi('Chờ duyệt / đang làm', String(k.waiting), COLORS.wait)}{kpi('Chưa nộp', String(k.notSubmitted), COLORS.miss)}{kpi('Nộp muộn', String(data.lateTotal), COLORS.late)}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className={card} aria-label="Tỉ lệ hoàn thành"><h2 className="mb-2 text-sm font-extrabold">Tỉ lệ hoàn thành</h2>
          <Donut center={`${k.completionPct}%`} parts={[{ label: 'Đã hoàn thành', value: k.done, color: COLORS.done }, { label: 'Chờ duyệt / đang làm', value: k.waiting, color: COLORS.wait }, { label: 'Khác (cần sửa…)', value: data.other, color: COLORS.other }, { label: 'Chưa nộp', value: k.notSubmitted, color: COLORS.miss }]} /></section>
        <section className={card} aria-label="Bài nộp theo ngày"><h2 className="mb-2 text-sm font-extrabold">Bài nộp 14 ngày gần nhất</h2><DayBars days={data.days} /></section>
        <section className={`${card} lg:col-span-2`} aria-label="Theo nhóm"><h2 className="mb-2 text-sm font-extrabold">Theo {board.settings.scope === 'grade' ? 'lớp' : 'tổ / đơn vị'}</h2>
          {data.units.length === 0 ? <p className="text-sm text-ink-2">Chưa có danh sách thành viên.</p> : <StackedBars rows={data.units} />}
          <p className="mt-2 flex flex-wrap gap-3 text-xs text-ink-2">{[['Hoàn thành', COLORS.done], ['Chờ / đang làm', COLORS.wait], ['Khác', COLORS.other], ['Chưa nộp', COLORS.miss]].map(([l, c]) => <span key={l} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} aria-hidden />{l}</span>)}</p></section>
        <section className={card} aria-label="Chưa nộp nhiều nhất"><h2 className="mb-2 text-sm font-extrabold">Chưa nộp nhiều việc nhất</h2>
          {data.miss.length === 0 ? <p className="text-sm font-bold text-emerald-700">Không ai còn thiếu việc.</p> : <ol className="space-y-1 text-sm">{data.miss.map((m, i) => <li key={m.name} className="flex justify-between gap-2"><span>{i + 1}. {m.name}</span><b style={{ color: COLORS.miss }}>{m.n} việc</b></li>)}</ol>}</section>
        <section className={card} aria-label="Nộp muộn nhiều nhất"><h2 className="mb-2 text-sm font-extrabold">Nộp muộn nhiều nhất</h2>
          {data.late.length === 0 ? <p className="text-sm font-bold text-emerald-700">Chưa có bài nộp muộn.</p> : <ol className="space-y-1 text-sm">{data.late.map((m, i) => <li key={m.name} className="flex justify-between gap-2"><span>{i + 1}. {m.name}</span><b style={{ color: COLORS.late }}>{m.n} lần</b></li>)}</ol>}</section>
      </div>
    </main>
  );
}
