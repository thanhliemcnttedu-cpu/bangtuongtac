import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { L, createBaseMap, pinIcon } from '../../lib/leafletMap';
import { EmptyLayout, withCards } from './viewTypes';
import type { CardRow, LayoutViewProps } from './viewTypes';

const PIN_COLOR: Record<string, string> = { pending: '#f59e0b', approved: '#129a4b', featured: '#eab308', needs_edit: '#e11d48' };

function popupFor(r: CardRow, onOpen: (id: string) => void): HTMLElement {
  const box = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = r.card.title;
  const who = document.createElement('div');
  who.textContent = `${r.card.authorName}${r.card.unit ? ` · ${r.card.unit}` : ''}`;
  const place = document.createElement('div');
  place.textContent = r.card.loc?.name ?? '';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Xem bài';
  btn.style.cssText = 'margin-top:6px;padding:4px 12px;border-radius:999px;background:#1668f2;color:#fff;font-weight:700;border:0;cursor:pointer';
  btn.addEventListener('click', () => onOpen(r.card.id));
  box.append(title, who, place, btn);
  return box;
}

/** Bản đồ: bài có vị trí hiện thành ghim trên OpenStreetMap. Giáo viên đặt vị trí cho bài chưa có bằng cách bấm lên bản đồ. */
export default function MapView({ rows, canManage, onOpen, onLayout }: LayoutViewProps) {
  const items = useMemo(() => withCards(rows), [rows]);
  const located = items.filter((r) => r.card.loc);
  const loose = items.filter((r) => !r.card.loc);
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const groupRef = useRef<L.LayerGroup | null>(null);
  const placingRef = useRef<string | null>(null);
  const fittedRef = useRef(false);
  const [placing, setPlacing] = useState<string | null>(null);
  placingRef.current = placing;

  // Tạo bản đồ một lần.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const map = createBaseMap(el);
    groupRef.current = L.layerGroup().addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => {
      const id = placingRef.current;
      if (!id) return;
      onLayout(id, { loc: { lat: Math.round(e.latlng.lat * 1e5) / 1e5, lng: Math.round(e.latlng.lng * 1e5) / 1e5 } });
      setPlacing(null);
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; groupRef.current = null; fittedRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Vẽ lại ghim khi dữ liệu đổi.
  useEffect(() => {
    const map = mapRef.current;
    const group = groupRef.current;
    if (!map || !group) return;
    group.clearLayers();
    const pts: L.LatLngTuple[] = [];
    for (const r of located) {
      const loc = r.card.loc;
      if (!loc) continue;
      pts.push([loc.lat, loc.lng]);
      L.marker([loc.lat, loc.lng], { icon: pinIcon(PIN_COLOR[r.card.status] ?? '#1668f2'), title: r.card.title, alt: r.card.title })
        .bindPopup(popupFor(r, onOpen)).addTo(group);
    }
    if (!fittedRef.current && pts.length > 0) {
      map.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 14 });
      fittedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [located.map((r) => `${r.card.id}:${r.card.loc?.lat}:${r.card.loc?.lng}:${r.card.status}`).join('|')]);

  useEffect(() => { if (boxRef.current) boxRef.current.style.cursor = placing ? 'crosshair' : ''; }, [placing]);

  if (items.length === 0) return <EmptyLayout />;

  return (
    <div className="space-y-3">
      {placing && (
        <p role="status" className="flex items-center justify-between gap-2 rounded-2xl bg-brand-50 px-4 py-2 text-sm font-bold text-brand-800">
          Bấm lên bản đồ để đặt vị trí cho bài “{items.find((r) => r.card.id === placing)?.card.title}”.
          <button type="button" onClick={() => setPlacing(null)} className="btn-ghost btn-sm"><X className="h-3.5 w-3.5" aria-hidden /> Hủy</button>
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
        <div ref={boxRef} className="z-0 h-[62vh] min-h-[340px] overflow-hidden rounded-3xl border-[1.5px] border-brand-200" role="application" aria-label="Bản đồ bài nộp" />
        <aside className="glass max-h-[62vh] overflow-y-auto rounded-3xl p-3" aria-label="Bài chưa có vị trí">
          <h3 className="mb-2 text-sm font-extrabold">Chưa có vị trí <span className="font-normal text-ink-2">({loose.length})</span></h3>
          {loose.length === 0 ? <p className="text-sm text-ink-3">Mọi bài đều đã có vị trí.</p> : (
            <ul className="space-y-2">
              {loose.map((r) => (
                <li key={r.card.id} className="rounded-2xl bg-white p-2 ring-1 ring-brand-100">
                  <p className="text-sm font-bold leading-snug">{r.card.title}</p>
                  <p className="text-xs text-ink-2">{r.card.authorName}</p>
                  {canManage && <button type="button" onClick={() => setPlacing(r.card.id)} className="btn-ghost btn-sm mt-1"><MapPin className="h-3.5 w-3.5" aria-hidden /> Đặt vị trí</button>}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
