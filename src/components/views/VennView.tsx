import { useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { StatusBadge } from '../StatusBadge';
import { EmptyLayout, withCards } from './viewTypes';
import type { CardRow, LayoutViewProps } from './viewTypes';
import type { VennRegion } from '../../types/board';

type Zone = VennRegion | 'none';

/** Biểu đồ Venn hai vòng: giáo viên kéo thả (hoặc chọn trong danh sách) để xếp bài vào vòng A, phần giao nhau hoặc vòng B. */
export function VennView({ rows, board, canManage, onOpen, onLayout }: LayoutViewProps) {
  const items = useMemo(() => withCards(rows), [rows]);
  const [over, setOver] = useState<Zone | null>(null);
  const [a, b] = board.settings.vennLabels;

  const zoneOf = (r: CardRow): Zone => r.card.venn ?? 'none';
  const inZone = (z: Zone): CardRow[] => items.filter((r) => zoneOf(r) === z);

  if (items.length === 0) return <EmptyLayout />;

  const drop = (e: DragEvent, z: Zone): void => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData('text/plain');
    if (id && canManage) onLayout(id, { venn: z === 'none' ? null : z });
  };

  const chip = (r: CardRow) => (
    <li key={r.card.id} draggable={canManage} onDragStart={(e) => e.dataTransfer.setData('text/plain', r.card.id)}
      className={`rounded-2xl border-[1.5px] border-brand-200 bg-white p-2 shadow-soft ${canManage ? 'cursor-grab active:cursor-grabbing' : ''}`}>
      <button type="button" onClick={() => onOpen(r.card.id)} className="block w-full text-left" aria-label={`Xem bài ${r.card.title} của ${r.card.authorName}`}>
        <span className="block text-sm font-extrabold leading-snug">{r.card.title}</span>
        <span className="flex flex-wrap items-center gap-1 text-xs text-ink-2">{r.card.authorName}<StatusBadge progress={r.card.status} /></span>
      </button>
      {canManage && (
        <select aria-label={`Xếp bài ${r.card.title} vào vùng`} value={zoneOf(r)} onChange={(e) => { const z = e.target.value as Zone; onLayout(r.card.id, { venn: z === 'none' ? null : z }); }}
          className="mt-1 w-full rounded-lg border border-brand-200 bg-white px-1 py-1 text-xs">
          <option value="none">Chưa xếp</option>
          <option value="a">Chỉ {a}</option>
          <option value="ab">Cả hai</option>
          <option value="b">Chỉ {b}</option>
        </select>
      )}
    </li>
  );

  const zone = (z: VennRegion, title: string, tone: string) => (
    <section aria-label={title} onDragOver={(e) => { if (canManage) { e.preventDefault(); setOver(z); } }} onDragLeave={() => setOver(null)} onDrop={(e) => drop(e, z)}
      className={`relative z-10 flex min-h-[160px] flex-col rounded-3xl p-3 transition duration-150 sm:min-h-0 sm:bg-transparent ${tone} ${over === z ? 'ring-4 ring-brand-400' : ''}`}>
      <h3 className="mb-2 text-center text-sm font-extrabold">{title} <span className="font-normal text-ink-2">({inZone(z).length})</span></h3>
      <ul className="flex-1 space-y-2 overflow-y-auto sm:max-h-[420px]">{inZone(z).map(chip)}</ul>
    </section>
  );

  const loose = inZone('none');

  return (
    <div className="space-y-4">
      <div className="relative flex flex-col gap-3 sm:grid sm:min-h-[460px] sm:grid-cols-[36%_28%_36%] sm:gap-0">
        {/* Hai vòng trang trí chỉ hiện từ màn hình vừa trở lên; trên điện thoại xếp thành ba khối dọc. */}
        <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[64%] rounded-[50%] border-[3px] border-brand-400 bg-brand-400/15 sm:block" aria-hidden />
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[64%] rounded-[50%] border-[3px] border-teal2-500 bg-teal2-500/15 sm:block" aria-hidden />
        {zone('a', `Chỉ ${a}`, 'bg-brand-50 sm:px-6 sm:py-10')}
        {zone('ab', 'Cả hai', 'bg-violet-50 sm:px-3 sm:py-10')}
        {zone('b', `Chỉ ${b}`, 'bg-teal2-50 sm:px-6 sm:py-10')}
      </div>

      <section aria-label="Chưa xếp" onDragOver={(e) => { if (canManage) { e.preventDefault(); setOver('none'); } }} onDragLeave={() => setOver(null)} onDrop={(e) => drop(e, 'none')}
        className={`glass rounded-3xl p-3 transition duration-150 ${over === 'none' ? 'ring-4 ring-brand-400' : ''}`}>
        <h3 className="mb-2 text-sm font-extrabold">Chưa xếp vào vòng nào <span className="font-normal text-ink-2">({loose.length})</span></h3>
        {loose.length === 0 ? <p className="text-sm text-ink-3">Mọi bài đã được xếp.</p> : <ul className="grid grid-cols-1 gap-2 min-[560px]:grid-cols-2 min-[1024px]:grid-cols-4">{loose.map(chip)}</ul>}
      </section>
    </div>
  );
}
