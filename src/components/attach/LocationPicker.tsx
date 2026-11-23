import { useEffect, useRef, useState } from 'react';
import { Check, LocateFixed } from 'lucide-react';
import { L, createBaseMap, pinIcon } from '../../lib/leafletMap';
import type { CardLocation } from '../../types/board';

interface Props {
  value: CardLocation | null;
  onChange: (loc: CardLocation) => void;
  onClose: () => void;
}

/** Chọn vị trí của bài trên bản đồ: bấm lên bản đồ hoặc dùng vị trí hiện tại của thiết bị. */
export default function LocationPicker({ value, onChange, onClose }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [pick, setPick] = useState<{ lat: number; lng: number } | null>(value ? { lat: value.lat, lng: value.lng } : null);
  const [name, setName] = useState(value?.name ?? '');
  const [message, setMessage] = useState('');

  const place = (lat: number, lng: number, fly = false): void => {
    const map = mapRef.current;
    if (!map) return;
    const ll: L.LatLngTuple = [Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5];
    if (markerRef.current) markerRef.current.setLatLng(ll);
    else markerRef.current = L.marker(ll, { icon: pinIcon('#1668f2') }).addTo(map);
    if (fly) map.setView(ll, Math.max(map.getZoom(), 13));
    setPick({ lat: ll[0], lng: ll[1] });
  };

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const map = createBaseMap(el);
    mapRef.current = map;
    if (value) { place(value.lat, value.lng); map.setView([value.lat, value.lng], 13); }
    map.on('click', (e: L.LeafletMouseEvent) => place(e.latlng.lat, e.latlng.lng));
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locate = (): void => {
    setMessage('');
    if (!navigator.geolocation) { setMessage('Thiết bị này không hỗ trợ định vị.'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => place(p.coords.latitude, p.coords.longitude, true),
      (err) => setMessage(err.code === err.PERMISSION_DENIED ? 'Bạn chưa cho phép định vị. Hãy bấm trực tiếp lên bản đồ để chọn vị trí.' : 'Không xác định được vị trí. Hãy bấm lên bản đồ để chọn.'),
      { timeout: 8000 },
    );
  };

  return (
    <div className="space-y-2">
      <div ref={boxRef} className="z-0 h-56 overflow-hidden rounded-2xl border-[1.5px] border-brand-200" role="application" aria-label="Bản đồ chọn vị trí" />
      <p className="text-xs text-ink-2">{pick ? `Đã chọn: ${pick.lat}, ${pick.lng}` : 'Bấm lên bản đồ để chọn vị trí.'}</p>
      <label htmlFor="loc-name" className="sr-only">Tên địa điểm</label>
      <input id="loc-name" className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Tên địa điểm (không bắt buộc), ví dụ: Chùa Một Cột" />
      {message && <p role="alert" className="text-xs font-bold text-rose-700">{message}</p>}
      <div className="flex flex-wrap justify-between gap-2">
        <button type="button" onClick={onClose} className="btn-ghost btn-sm">Đóng</button>
        <div className="flex gap-2">
          <button type="button" onClick={locate} className="btn-ghost btn-sm"><LocateFixed className="h-3.5 w-3.5" aria-hidden /> Vị trí của tôi</button>
          <button type="button" disabled={!pick} onClick={() => { if (pick) { onChange({ ...pick, name: name.trim() || undefined }); onClose(); } }} className="btn-primary btn-sm"><Check className="h-3.5 w-3.5" aria-hidden /> Dùng vị trí này</button>
        </div>
      </div>
    </div>
  );
}
