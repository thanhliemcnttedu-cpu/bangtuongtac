import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export { L };

/** Bản đồ nền OpenStreetMap (miễn phí, cần ghi nguồn). Cuộn chuột chỉ phóng to khi bản đồ đang được chọn, để không chặn cuộn trang. */
export function createBaseMap(el: HTMLElement): L.Map {
  const map = L.map(el, { scrollWheelZoom: false }).setView([16.0, 106.0], 5); // mặc định: Việt Nam
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
  }).addTo(map);
  map.on('focus', () => map.scrollWheelZoom.enable());
  map.on('blur', () => map.scrollWheelZoom.disable());
  // Khung chứa có thể vừa hiện ra: tính lại kích thước để ô bản đồ không bị cắt.
  window.setTimeout(() => map.invalidateSize(), 150);
  return map;
}

export function pinIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<span class="map-pin" style="--pin:${color}"></span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 26],
    popupAnchor: [0, -24],
  });
}
