// Máy khách Google Drive chạy hoàn toàn trong trình duyệt của giáo viên.
// Quyền xin: drive.file (chỉ thấy và sửa các tệp do chính ứng dụng này tạo; không đọc được phần còn lại của Drive).
// Mã truy cập sống khoảng 1 giờ và chỉ nằm trong bộ nhớ trang, không gửi đi đâu và không lưu lại.

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GOOGLE_CLIENT_ID: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined;

export interface DriveFile { id: string; name: string }

export interface DriveApi {
  /** true = Drive giả lập trong bộ nhớ (chế độ dữ liệu mẫu), không chạm tới Drive thật. */
  readonly fake: boolean;
  ensureFolder(name: string, parentId?: string): Promise<string>;
  /** Tải một tệp lên thư mục; trả về mã tệp trên Drive. */
  uploadFile(name: string, blob: Blob, parentId: string): Promise<DriveFile>;
  /** Ghi (tạo mới hoặc ghi đè) một tệp JSON theo tên trong thư mục. */
  upsertJson(name: string, json: string, parentId: string): Promise<DriveFile>;
  deleteFile(id: string): Promise<void>;
  folderUrl(id: string): string;
  fileUrl(id: string): string;
}

export const driveFileUrl = (id: string): string => `https://drive.google.com/file/d/${id}/view`;
export const driveFolderUrl = (id: string): string => `https://drive.google.com/drive/folders/${id}`;

/* ============ Drive giả lập (thử giao diện, không cần tài khoản) ============ */

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
    fileUrl: (id) => `#drive-gia-lap-${id}`,
  };
}

/* ============ Drive thật ============ */

interface TokenResponse { access_token?: string; expires_in?: number; error?: string }
interface TokenClient { requestAccessToken: (o?: { prompt?: string }) => void }
interface GoogleGlobal { accounts: { oauth2: { initTokenClient: (c: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type?: string }) => void }) => TokenClient } } }

let gsiLoading: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if ((window as unknown as { google?: GoogleGlobal }).google?.accounts?.oauth2) return Promise.resolve();
  gsiLoading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gsiLoading = null; reject(new Error('Không tải được dịch vụ đăng nhập của Google. Hãy kiểm tra mạng.')); };
    document.head.appendChild(s);
  });
  return gsiLoading;
}

let token: { value: string; expiresAt: number } | null = null;

/** Xin quyền Drive (hiện cửa sổ của Google ở lần đầu hoặc khi hết hạn). Phải gọi từ thao tác bấm của người dùng. */
export async function requestDriveToken(forcePrompt = false): Promise<string> {
  if (!GOOGLE_CLIENT_ID) throw new Error('Chưa cấu hình VITE_GOOGLE_CLIENT_ID.');
  if (!forcePrompt && token && token.expiresAt - Date.now() > 60_000) return token.value;
  await loadGsi();
  const g = (window as unknown as { google: GoogleGlobal }).google;
  return new Promise<string>((resolve, reject) => {
    const client = g.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID as string,
      scope: DRIVE_SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) { reject(new Error(r.error === 'access_denied' ? 'Bạn chưa cho phép ứng dụng dùng Google Drive.' : `Google từ chối cấp quyền (${r.error ?? 'không rõ'}).`)); return; }
        token = { value: r.access_token, expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000 };
        resolve(r.access_token);
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'Bạn đã đóng cửa sổ xin quyền Google Drive.' : 'Không mở được cửa sổ xin quyền. Hãy cho phép cửa sổ bật lên (popup) rồi thử lại.')),
    });
    client.requestAccessToken({ prompt: token ? '' : 'consent' });
  });
}

const esc = (s: string): string => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function call(url: string, init: RequestInit & { retry?: boolean } = {}): Promise<Response> {
  const t = await requestDriveToken();
  const res = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${t}` } });
  if (res.status === 401 && !init.retry) { token = null; return call(url, { ...init, retry: true }); }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google Drive báo lỗi ${res.status}${body ? `: ${body.slice(0, 160)}` : ''}`);
  }
  return res;
}

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const SMALL = 5 * 1024 * 1024;

async function createMultipart(name: string, blob: Blob, parentId: string, type: string): Promise<DriveFile> {
  const boundary = `bt${Math.random().toString(36).slice(2)}`;
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [parentId] })}\r\n--${boundary}\r\nContent-Type: ${type}\r\n\r\n`;
  const body = new Blob([head, blob, `\r\n--${boundary}--`]);
  const res = await call(`${UPLOAD}?uploadType=multipart&fields=id,name`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
  return (await res.json()) as DriveFile;
}

async function createResumable(name: string, blob: Blob, parentId: string, type: string): Promise<DriveFile> {
  const init = await call(`${UPLOAD}?uploadType=resumable&fields=id,name`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': type, 'X-Upload-Content-Length': String(blob.size) },
    body: JSON.stringify({ name, parents: [parentId] }),
  });
  const loc = init.headers.get('Location');
  if (!loc) throw new Error('Google Drive không trả địa chỉ tải lên.');
  const put = await fetch(loc, { method: 'PUT', headers: { 'Content-Type': type }, body: blob });
  if (!put.ok) throw new Error(`Tải lên Drive không thành công (${put.status}).`);
  return (await put.json()) as DriveFile;
}

export function createRealDrive(): DriveApi {
  return {
    fake: false,
    async ensureFolder(name, parentId) {
      const q = `name='${esc(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${parentId ?? 'root'}' in parents`;
      const list = await (await call(`${API}?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`)).json() as { files?: DriveFile[] };
      if (list.files && list.files.length > 0) return list.files[0].id;
      const made = await (await call(`${API}?fields=id`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', ...(parentId ? { parents: [parentId] } : {}) }),
      })).json() as { id: string };
      return made.id;
    },
    async uploadFile(name, blob, parentId) {
      const type = blob.type || 'application/octet-stream';
      return blob.size <= SMALL ? createMultipart(name, blob, parentId, type) : createResumable(name, blob, parentId, type);
    },
    async upsertJson(name, json, parentId) {
      const q = `name='${esc(name)}' and trashed=false and '${parentId}' in parents`;
      const list = await (await call(`${API}?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`)).json() as { files?: DriveFile[] };
      const blob = new Blob([json], { type: 'application/json' });
      const hit = list.files?.[0];
      if (!hit) return createMultipart(name, blob, parentId, 'application/json');
      await call(`${UPLOAD}/${hit.id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: blob });
      return { id: hit.id, name };
    },
    async deleteFile(id) {
      try { await call(`${API}/${id}`, { method: 'DELETE' }); }
      catch (e) { if (e instanceof Error && /\b404\b/.test(e.message)) return; throw e; } // đã bị xóa từ trước thì coi như xong
    },
    folderUrl: driveFolderUrl,
    fileUrl: driveFileUrl,
  };
}

/** Chế độ dữ liệu mẫu dùng Drive giả lập; chế độ thật cần có mã khách Google. */
export function getDrive(mock: boolean): DriveApi {
  if (mock) return createFakeDrive();
  if (!GOOGLE_CLIENT_ID) throw new Error('Chưa cấu hình Google Drive (thiếu VITE_GOOGLE_CLIENT_ID). Xem hướng dẫn trong docs/HUONG-DAN-GOOGLE-DRIVE.md.');
  return createRealDrive();
}
