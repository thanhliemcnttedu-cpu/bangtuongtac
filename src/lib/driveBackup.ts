import type { Attachment, BoardData, SubmissionCard } from '../types/board';
import type { DriveApi } from './drive';
import { driveAttachment } from './drive';

export interface BackupOptions {
  /** Ghi bản sao bảng (lớp, bài học, bài tập, danh sách, bài nộp) thành một tệp JSON gọn. */
  saveBoard: boolean;
  /** Chép tệp đính kèm của bài nộp (ảnh, PDF, PowerPoint…) sang Drive. */
  saveFiles: boolean;
  /** Sau khi chép xong thì xóa tệp khỏi hệ thống để giải phóng dung lượng (bài nộp chuyển sang trỏ tới Drive). */
  removeAfter: boolean;
}

export interface BackupProgress { phase: string; done: number; total: number }

export interface BackupResult {
  folderId: string;
  folderUrl: string;
  jsonSaved: boolean;
  filesSaved: number;
  filesFailed: number;
  bytesSaved: number;
  /** Số byte đã giải phóng khỏi hệ thống (chỉ khi chọn xóa sau khi lưu). */
  bytesFreed: number;
  /** Các bài có đính kèm đã đổi: ghi lại vào CSDL và bộ nhớ. */
  updates: Array<{ cardId: string; attachments: Attachment[] }>;
  errors: string[];
}

/** Tệp đã lưu rồi (có driveId) hoặc không phải tệp thật (liên kết, nhúng, văn bản) thì bỏ qua. */
export const isUploadable = (a: Attachment): boolean => !!a.url && !a.driveId && a.type !== 'link' && a.type !== 'embed' && a.type !== 'text';

export function pendingFiles(board: BoardData): { count: number; bytes: number } {
  let count = 0; let bytes = 0;
  for (const c of board.cards) for (const a of c.attachments) if (isUploadable(a)) { count += 1; bytes += a.size ?? 0; }
  return { count, bytes };
}

export const ROOT_FOLDER = 'Bảng tương tác lớp học';
export const safe = (s: string, max = 60): string => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) || 'khong-ten';

/** Tên thư mục của một bảng trên Drive: tên bảng + 6 ký tự mã bảng để không trùng khi hai lớp cùng tên. */
export const boardFolderName = (b: { title: string; shareToken: string }): string => `${safe(b.title, 80)} · ${b.shareToken.slice(0, 6)}`;

/** Bản sao bảng gọn nhất có thể: không có địa chỉ tạm, chỉ giữ thông tin cần để khôi phục và đọc lại. */
export function boardToJson(board: BoardData, cards: SubmissionCard[] = board.cards): string {
  const att = (a: Attachment) => ({ type: a.type, name: a.name, size: a.size, mime: a.mime, label: a.label, driveId: a.driveId, archived: a.archived, url: a.driveId ? undefined : a.url });
  const data = {
    app: 'bang-tuong-tac', version: 1, exportedAt: new Date().toISOString(),
    board: { title: board.title, subtitle: board.subtitle, mode: board.mode, program: board.program, goals: board.goals, settings: { ...board.settings, driveUrl: undefined, driveSecret: undefined } },
    lessons: board.lessons,
    tasks: board.tasks,
    roster: board.roster.map((m) => ({ name: m.name, unit: m.unit })),
    resources: board.pinned.map((r) => ({ title: r.title, description: r.description, kind: r.kind, lessonId: r.lessonId, badge: r.badge, color: r.color, steps: r.steps, attachments: (r.attachments ?? []).map(att) })),
    submissions: cards.map((c) => ({
      author: c.authorName, unit: c.unit, title: c.title, task: c.taskId, body: c.body, status: c.status, at: c.submittedAt, late: c.late,
      grade: c.grade, stars: c.teacherStars, note: c.teacherNote, poll: c.poll, location: c.loc,
      comments: (c.comments ?? []).map((m) => ({ author: m.author, body: m.body, at: m.at })),
      files: c.attachments.map(att),
    })),
  };
  return JSON.stringify(data);
}

async function pool<T>(items: T[], size: number, run: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const worker = async (): Promise<void> => { while (i < items.length) { const item = items[i]; i += 1; await run(item); } };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}

/**
 * Sao lưu bảng lên Drive của giáo viên:
 *   Bảng tương tác lớp học / <tên bảng> · <mã> / bang.json + Bài nộp / (tệp)
 * Chép từng tệp (3 tệp cùng lúc), ghi lại mã tệp trên Drive vào đính kèm; nếu chọn xóa sau khi lưu thì đổi địa chỉ sang Drive
 * và gọi `removeFromSystem` để xóa tệp gốc khỏi kho. Một tệp lỗi không làm hỏng cả đợt.
 */
export async function backupBoardToDrive(
  board: BoardData, drive: DriveApi, opts: BackupOptions,
  onProgress: (p: BackupProgress) => void,
  removeFromSystem: (attachments: Attachment[]) => Promise<void>,
): Promise<BackupResult> {
  onProgress({ phase: 'Chuẩn bị thư mục trên Drive…', done: 0, total: 1 });
  const root = await drive.ensureFolder(ROOT_FOLDER);
  const boardFolder = await drive.ensureFolder(boardFolderName(board), root);
  const result: BackupResult = { folderId: boardFolder, folderUrl: drive.folderUrl(boardFolder), jsonSaved: false, filesSaved: 0, filesFailed: 0, bytesSaved: 0, bytesFreed: 0, updates: [], errors: [] };

  const nextAtts = new Map<string, Attachment[]>(board.cards.map((c) => [c.id, c.attachments.map((a) => ({ ...a }))]));

  if (opts.saveFiles) {
    const jobs: Array<{ card: SubmissionCard; idx: number }> = [];
    for (const card of board.cards) card.attachments.forEach((a, idx) => { if (isUploadable(a)) jobs.push({ card, idx }); });
    if (jobs.length > 0) {
      const files = await drive.ensureFolder('Bài nộp', boardFolder);
      let done = 0;
      const removable: Attachment[] = [];
      await pool(jobs, 3, async ({ card, idx }) => {
        const a = card.attachments[idx];
        try {
          const res = await fetch(a.url as string);
          if (!res.ok) throw new Error(`không tải được tệp (${res.status})`);
          const blob = await res.blob();
          const name = `${safe(card.authorName, 30)} - ${safe(card.title, 30)} - ${safe(a.name, 50)}`;
          const up = await drive.uploadFile(name, blob, files);
          const cur = nextAtts.get(card.id) ?? [];
          // Chuyển hẳn: đính kèm trỏ tới tệp trên Drive (xem được ngay trong trang). Chỉ chép: giữ tệp cũ, ghi thêm mã Drive để xóa theo.
          cur[idx] = opts.removeAfter
            ? { ...driveAttachment({ name: a.name, mime: a.mime, size: a.size ?? blob.size, type: a.type }, up.id), label: a.label }
            : { ...a, driveId: up.id };
          nextAtts.set(card.id, cur);
          if (opts.removeAfter) removable.push(a);
          result.filesSaved += 1; result.bytesSaved += blob.size;
        } catch (e) {
          result.filesFailed += 1;
          result.errors.push(`${a.name}: ${e instanceof Error ? e.message : 'lỗi không rõ'}`);
        }
        done += 1;
        onProgress({ phase: `Đang chép tệp ${done}/${jobs.length}…`, done, total: jobs.length });
      });
      if (opts.removeAfter && removable.length > 0) {
        try { await removeFromSystem(removable); result.bytesFreed = removable.reduce((n, a) => n + (a.size ?? 0), 0); }
        catch (e) { result.errors.push(`Đã chép sang Drive nhưng chưa xóa được tệp cũ khỏi hệ thống: ${e instanceof Error ? e.message : ''}`); }
      }
    }
  }

  for (const card of board.cards) {
    const after = nextAtts.get(card.id) ?? card.attachments;
    if (after.some((a, i) => a.driveId !== card.attachments[i]?.driveId)) result.updates.push({ cardId: card.id, attachments: after });
  }

  if (opts.saveBoard) {
    onProgress({ phase: 'Ghi bản sao bảng (JSON)…', done: 0, total: 1 });
    const cards = board.cards.map((c) => ({ ...c, attachments: nextAtts.get(c.id) ?? c.attachments }));
    await drive.upsertJson('bang.json', boardToJson(board, cards), boardFolder);
    result.jsonSaved = true;
  }
  onProgress({ phase: 'Xong', done: 1, total: 1 });
  return result;
}
