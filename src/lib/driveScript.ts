/** Mật khẩu ngẫu nhiên cho cổng (chỉ chữ và số, dễ dán). Trang gửi kèm mật khẩu này mỗi lần gọi cổng. */
export function newGatewaySecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
}

/**
 * Mã Google Apps Script của "cổng Drive". Giáo viên dán vào script.google.com và triển khai thành ứng dụng web
 * chạy bằng tài khoản của mình. Cổng nhận tệp từ trang web rồi lưu vào Drive của giáo viên, trong thư mục
 *   Bảng tương tác lớp học / <tên bảng> / Bài nộp
 * Chỉ làm việc bên trong thư mục "Bảng tương tác lớp học": không đọc, không xóa gì ngoài thư mục đó.
 */
export function buildGatewayScript(secret: string): string {
  return `// CỔNG DRIVE CHO "BẢNG TƯƠNG TÁC LỚP HỌC" - chạy bằng tài khoản Google của bạn.
// Không cần sửa gì. Dán nguyên đoạn này, rồi bấm Triển khai > Ứng dụng web.
var SECRET = '${secret}';
var ROOT_NAME = 'Bảng tương tác lớp học';
var VERSION = 2;

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var req = JSON.parse(e.postData.contents);
    if (req.secret !== SECRET) return reply({ ok: false, error: 'Sai mật khẩu cổng' });
    lock.waitLock(25000);
    var out;
    if (req.action === 'ping') out = { ok: true, version: VERSION, root: folderAt([ROOT_NAME]).getUrl() };
    else if (req.action === 'begin') out = begin(req);
    else if (req.action === 'finish') out = finish(req);
    else if (req.action === 'upload') out = upload(req);
    else if (req.action === 'json') out = saveJson(req);
    else if (req.action === 'delete') out = removeFiles(req.ids);
    else out = { ok: false, error: 'Lệnh không hợp lệ' };
    return reply(out);
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function doGet() { return reply({ ok: true, name: 'Cổng Drive của Bảng tương tác lớp học' }); }
function reply(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function child(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function folderAt(path) {
  if (!path || path[0] !== ROOT_NAME) throw new Error('Đường dẫn không hợp lệ');
  var f = DriveApp.getRootFolder();
  for (var i = 0; i < path.length; i++) f = child(f, String(path[i]).slice(0, 120));
  return f;
}

function upload(req) {
  var folder = folderAt(req.path);
  var blob = Utilities.newBlob(Utilities.base64Decode(req.data), req.mime || 'application/octet-stream', req.name);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { ok: true, id: file.getId(), url: file.getUrl(), size: file.getSize(), folderUrl: folder.getUrl() };
}

// Tệp lớn: cổng chỉ mở một "phiên tải lên" của Drive rồi trả địa chỉ phiên về; trình duyệt tự gửi tệp từng phần thẳng lên Google.
function begin(req) {
  var folder = folderAt(req.path);
  var headers = {
    Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
    'X-Upload-Content-Type': req.mime || 'application/octet-stream',
    'X-Upload-Content-Length': String(req.size)
  };
  if (req.origin) headers['Origin'] = req.origin;
  var res = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
    method: 'post', contentType: 'application/json; charset=UTF-8', headers: headers,
    payload: JSON.stringify({ name: req.name, parents: [folder.getId()] }), muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('Drive từ chối: ' + res.getContentText().slice(0, 200));
  var h = res.getHeaders();
  return { ok: true, session: h['Location'] || h['location'], folderUrl: folder.getUrl() };
}

function finish(req) {
  var file = DriveApp.getFileById(req.id);
  if (!inRoot(file)) throw new Error('Tệp không nằm trong thư mục của ứng dụng');
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { ok: true, id: file.getId(), url: file.getUrl(), size: file.getSize() };
}

function saveJson(req) {
  var folder = folderAt(req.path);
  var it = folder.getFilesByName(req.name);
  var file;
  if (it.hasNext()) { file = it.next(); file.setContent(req.text); }
  else file = folder.createFile(req.name, req.text, 'application/json');
  return { ok: true, id: file.getId(), folderUrl: folder.getUrl() };
}

function inRoot(file) {
  var rootId = DriveApp.getRootFolder().getId();
  var node = file;
  for (var i = 0; i < 8; i++) {
    var ps = node.getParents();
    if (!ps.hasNext()) return false;
    var p = ps.next();
    if (p.getName() === ROOT_NAME) { var gp = p.getParents(); return gp.hasNext() && gp.next().getId() === rootId; }
    node = p;
  }
  return false;
}

function removeFiles(ids) {
  var n = 0;
  (ids || []).forEach(function (id) {
    try { var f = DriveApp.getFileById(id); if (inRoot(f)) { f.setTrashed(true); n++; } } catch (e) {}
  });
  return { ok: true, deleted: n };
}
`;
}
