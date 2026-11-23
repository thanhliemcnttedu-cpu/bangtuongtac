// Lớp truy cập Google Drive của giáo viên qua "cổng Drive" (Google Apps Script chạy bằng tài khoản giáo viên).
// Không dùng Google Cloud, không cần mã khách hay biến môi trường: giáo viên chỉ dán địa chỉ cổng vào trang một lần.

import type { Attachment, BoardSettings } from '../types/board';

export interface GatewayConfig { url: string; secret: string }

/** Địa chỉ cổng hợp lệ: ứng dụng web của Apps Script (khi chạy thử trên máy được thêm localhost). */
const URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
const DEV_URL_RE = /^http:\/\/localhost:\d{2,5}\/exec$/;
export const isGatewayUrl = (u: string): boolean => URL_RE.test(u) || (import.meta.env.DEV && DEV_URL_RE.test(u));

export function gatewayOf(s: Pick<BoardSettings, 'driveUrl' | 'driveSecret'> | undefined | null): GatewayConfig | null {
  if (!s?.driveUrl || !s.driveSecret || !isGatewayUrl(s.driveUrl)) return null;
  return { url: s.driveUrl, secret: s.driveSecret };
}

/* ---------- Cấu hình mặc định nhớ trên trình duyệt giáo viên (dùng cho bảng mới) ---------- */
const KEY = 'bt.gateway';
export function loadDefaultGateway(): GatewayConfig | null {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<GatewayConfig> | null; return v && typeof v.url === 'string' && typeof v.secret === 'string' && isGatewayUrl(v.url) ? { url: v.url, secret: v.secret } : null; }
  catch { return null; }
}
export function saveDefaultGateway(c: GatewayConfig): void { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* bỏ qua */ } }

/* ---------- Gọi cổng ---------- */

interface Reply { ok: boolean; error?: string; id?: string; url?: string; size?: number; folderUrl?: string; deleted?: number; root?: string }

async function call(cfg: GatewayConfig, body: Record<string, unknown>, tries = 2): Promise<Reply> {
  let last = '';
  for (let i = 0; i < tries; i += 1) {
    try {
      // text/plain để trình duyệt không gửi yêu cầu dò đường (Apps Script không trả lời được yêu cầu đó).
      const res = await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...body, secret: cfg.secret }) });
      const data = (await res.json()) as Reply;
      if (!data.ok) throw new Error(data.error ?? 'Cổng Drive báo lỗi');
      return data;
    } catch (e) {
      last = e instanceof Error ? e.message : 'lỗi không rõ';
      if (/mật khẩu|không hợp lệ/i.test(last)) break; // lỗi cấu hình: thử lại cũng vô ích
    }
  }
  throw new Error(`Không gọi được cổng Drive: ${last}`);
}

const toBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
  r.onerror = () => reject(new Error('Không đọc được tệp'));
  r.readAsDataURL(blob);
});

export async function gatewayPing(cfg: GatewayConfig): Promise<string> {
  const r = await call(cfg, { action: 'ping' }, 1);
  return r.root ?? '';
}

export interface GatewayFile { id: string; url: string; size: number; folderUrl: string }

/** Giới hạn mỗi tệp qua cổng (Apps Script nhận tối đa khoảng 50 MB, mã hóa base64 làm tăng thêm 1/3). */
export const GATEWAY_MAX_BYTES = 30 * 1024 * 1024;

export async function gatewayUpload(cfg: GatewayConfig, path: string[], name: string, blob: Blob): Promise<GatewayFile> {
  if (blob.size > GATEWAY_MAX_BYTES) throw new Error('Tệp quá lớn để gửi qua cổng Drive (tối đa 30 MB).');
  const r = await call(cfg, { action: 'upload', path, name, mime: blob.type || 'application/octet-stream', data: await toBase64(blob) });
  if (!r.id) throw new Error('Cổng Drive không trả mã tệp.');
  return { id: r.id, url: r.url ?? driveFileUrl(r.id), size: r.size ?? blob.size, folderUrl: r.folderUrl ?? '' };
}

export async function gatewayJson(cfg: GatewayConfig, path: string[], name: string, text: string): Promise<GatewayFile> {
  const r = await call(cfg, { action: 'json', path, name, text });
  return { id: r.id ?? '', url: '', size: text.length, folderUrl: r.folderUrl ?? '' };
}

export async function gatewayDelete(cfg: GatewayConfig, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  return (await call(cfg, { action: 'delete', ids })).deleted ?? 0;
}

/* ---------- Đính kèm trỏ tới tệp trên Drive ---------- */

export const driveFileUrl = (id: string): string => `https://drive.google.com/file/d/${id}/view`;
export const driveFolderUrl = (id: string): string => `https://drive.google.com/drive/folders/${id}`;
const thumbUrl = (id: string, w: number): string => `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;

/**
 * Đính kèm cho một tệp đã nằm trên Drive (cổng đặt quyền "ai có liên kết đều xem"):
 * ảnh hiện trực tiếp bằng ảnh thu nhỏ của Drive; mọi tệp khác nhúng khung xem trước của Drive (PDF, Word, PowerPoint, video, âm thanh).
 */
export function driveAttachment(f: { name: string; mime?: string; size?: number; type?: Attachment['type'] }, id: string): Attachment {
  const base = { name: f.name, mime: f.mime, size: f.size, driveId: id };
  if (f.type === 'image' || (f.mime ?? '').startsWith('image/')) return { ...base, type: 'image', url: thumbUrl(id, 1600) };
  return { ...base, type: 'embed', url: driveFileUrl(id), embed: { provider: 'drive', src: `https://drive.google.com/file/d/${id}/preview`, thumb: thumbUrl(id, 480) } };
}

/* ---------- Giao diện chung dùng cho sao lưu ---------- */

export interface DriveFile { id: string; name: string; url?: string }

export interface DriveApi {
  /** true = Drive giả lập trong bộ nhớ (chế độ thử), không chạm tới Drive thật. */
  readonly fake: boolean;
  /** Thư mục được biểu diễn bằng chuỗi đường dẫn (ví dụ "Bảng tương tác lớp học/Lớp 4A"). */
  ensureFolder(name: string, parentId?: string): Promise<string>;
  uploadFile(name: string, blob: Blob, parentId: string): Promise<DriveFile>;
  upsertJson(name: string, json: string, parentId: string): Promise<DriveFile>;
  deleteFile(id: string): Promise<void>;
  folderUrl(id: string): string;
}

/** Cổng thật: mỗi "thư mục" là một đường dẫn; cổng tự tạo thư mục còn thiếu khi nhận tệp. */
export function createGatewayDrive(cfg: GatewayConfig): DriveApi {
  const urls = new Map<string, string>();
  const pathOf = (id: string): string[] => id.split('/');
  const keep = (id: string, folderUrl: string): void => { if (folderUrl) urls.set(id, folderUrl); };
  return {
    fake: false,
    async ensureFolder(name, parentId) { return parentId ? `${parentId}/${name}` : name; },
    async uploadFile(name, blob, parentId) {
      const r = await gatewayUpload(cfg, pathOf(parentId), name, blob);
      keep(parentId, r.folderUrl);
      return { id: r.id, name, url: r.url };
    },
    async upsertJson(name, json, parentId) {
      const r = await gatewayJson(cfg, pathOf(parentId), name, json);
      keep(parentId, r.folderUrl);
      return { id: r.id, name };
    },
    async deleteFile(id) { await gatewayDelete(cfg, [id]); },
    folderUrl: (id) => urls.get(id) ?? [...urls.values()][0] ?? '',
  };
}

/* ---------- Drive giả lập (chế độ thử, không cần tài khoản) ---------- */

export interface FakeEntry { id: string; name: string; parent?: string; folder: boolean; size: number; deleted?: boolean; text?: string }

export function createFakeDrive(): DriveApi {
  const w = window as unknown as { __fakeDrive?: Map<string, FakeEntry> };
  const store = (w.__fakeDrive ??= new Map<string, FakeEntry>());
  const next = (): string => `fake-${store.size + 1}`;
  const find = (name: string, parent: string | undefined, folder: boolean): FakeEntry | undefined =>
    [...store.values()].find((e) => !e.deleted && e.name === name && e.parent === parent && e.folder === folder);
  return {
    fake: true,
    async ensureFolder(name, parentId) {
      const hit = find(name, parentId, true);
      if (hit) return hit.id;
      const e: FakeEntry = { id: next(), name, parent: parentId, folder: true, size: 0 };
      store.set(e.id, e);
      return e.id;
    },
    async uploadFile(name, blob, parentId) {
      const e: FakeEntry = { id: next(), name, parent: parentId, folder: false, size: blob.size };
      store.set(e.id, e);
      return { id: e.id, name };
    },
    async upsertJson(name, json, parentId) {
      const hit = find(name, parentId, false);
      if (hit) { hit.size = json.length; hit.text = json; return { id: hit.id, name }; }
      const e: FakeEntry = { id: next(), name, parent: parentId, folder: false, size: json.length, text: json };
      store.set(e.id, e);
      return { id: e.id, name };
    },
    async deleteFile(id) { const e = store.get(id); if (e) e.deleted = true; },
    folderUrl: (id) => `#drive-gia-lap-${id}`,
  };
}

/** Có cổng thì dùng cổng; không có cổng mà đang ở chế độ thử thì dùng Drive giả lập; còn lại báo cần kết nối. */
export function getDrive(mock: boolean, cfg: GatewayConfig | null): DriveApi {
  if (cfg) return createGatewayDrive(cfg);
  if (mock) return createFakeDrive();
  throw new Error('Chưa kết nối cổng Google Drive. Mở Thêm → Lưu lên Google Drive của tôi để kết nối.');
}
