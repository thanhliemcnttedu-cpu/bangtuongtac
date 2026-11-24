import type { Attachment, BoardData, TaskItem } from '../types/board';
import { gatewayFetchFiles, gatewayOf } from './drive';
import { boardFolderName } from './driveBackup';
import { buildTaskReport, reportRows } from './taskReport';
import { toCsv } from './csv';
import { buildZip } from './zip';
import type { ZipEntry } from './zip';

export interface EvidenceResult { files: number; people: number; skipped: string[] }

const slug = (s: string, max = 40): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, max);
/** Tên tệp / thư mục giữ nguyên chữ có dấu (ZIP ghi UTF-8), chỉ bỏ các ký tự Windows không cho phép. */
const fileSafe = (s: string, max = 60): string => s.replace(/[\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
const pad = (n: number): string => String(n).padStart(2, '0');
const extOf = (name: string): string => { const m = /\.[A-Za-z0-9]{1,8}$/.exec(name); return m ? m[0].toLowerCase() : ''; };
const b64ToBytes = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Tệp minh chứng thật (không phải liên kết) của một bài. */
const isFile = (a: Attachment): boolean => a.type !== 'link' && a.type !== 'embed' && a.type !== 'text';

/**
 * Gom minh chứng của một công việc vào MỘT tệp ZIP: mỗi tệp đặt tên "01-Họ tên-minh-chung.ext" theo thứ tự danh sách,
 * kèm bảng báo cáo CSV. Tệp trong kho hệ thống tải trực tiếp; tệp ở Drive của giáo viên tải qua cổng (cần mã cổng phiên bản 3).
 * Tệp nào không lấy được thì bỏ qua và ghi vào `skipped`, không làm hỏng cả gói.
 */
export async function buildEvidenceZip(board: BoardData, task: TaskItem, onProgress?: (done: number, total: number) => void): Promise<{ blob: Blob; result: EvidenceResult }> {
  const report = buildTaskReport(board, task);
  const folder = fileSafe(task.label, 50) || 'Cong viec';
  const entries: ZipEntry[] = [];
  const skipped: string[] = [];
  const cfg = gatewayOf(board.settings);

  type Job = { who: string; att: Attachment; target: string };
  const jobs: Job[] = [];
  report.done.forEach((d, i) => {
    const files = d.card.attachments.filter(isFile);
    files.forEach((att, j) => {
      const base = `${pad(i + 1)}-${fileSafe(d.member.name, 40) || 'Thanh vien'}-minh chung${files.length > 1 ? `-${j + 1}` : ''}`;
      jobs.push({ who: d.member.name, att, target: `${folder}/${base}${extOf(att.name)}` });
    });
  });

  let finished = 0;
  const tick = (): void => { finished += 1; onProgress?.(finished, jobs.length); };
  const viaDrive: Job[] = [];
  for (const job of jobs) {
    if (job.att.driveId) { viaDrive.push(job); continue; }
    if (!job.att.url) { skipped.push(`${job.who}: ${job.att.name} (không có địa chỉ tệp)`); tick(); continue; }
    try {
      const res = await fetch(job.att.url);
      if (!res.ok) throw new Error(String(res.status));
      entries.push({ name: job.target, data: new Uint8Array(await res.arrayBuffer()) });
    } catch { skipped.push(`${job.who}: ${job.att.name} (không tải được)`); }
    tick();
  }

  // Tệp ở Drive: cổng đọc giúp, mỗi lượt vài tệp để không vượt giới hạn trả lời của Apps Script.
  if (viaDrive.length > 0 && !cfg) {
    viaDrive.forEach((j) => skipped.push(`${j.who}: ${j.att.name} (bảng chưa nối cổng Drive)`));
  } else if (viaDrive.length > 0 && cfg) {
    const batches: Job[][] = [];
    let cur: Job[] = []; let size = 0;
    for (const j of viaDrive) {
      const s = j.att.size ?? 4_000_000;
      if (cur.length > 0 && size + s > 12_000_000) { batches.push(cur); cur = []; size = 0; }
      cur.push(j); size += s;
    }
    if (cur.length > 0) batches.push(cur);
    for (const batch of batches) {
      try {
        const got = await gatewayFetchFiles(cfg, batch.map((j) => j.att.driveId as string));
        for (const j of batch) {
          const f = got.find((x) => x.id === j.att.driveId);
          if (f) entries.push({ name: j.target, data: b64ToBytes(f.b64) }); else skipped.push(`${j.who}: ${j.att.name} (Drive không trả tệp)`);
          tick();
        }
      } catch (e) {
        batch.forEach((j) => { skipped.push(`${j.who}: ${j.att.name} (${e instanceof Error ? e.message : 'lỗi cổng Drive'})`); tick(); });
      }
    }
  }

  const csv = new TextEncoder().encode(`\ufeff${toCsv(reportRows(board, report))}`);
  entries.push({ name: `${folder}/bao-cao.csv`, data: csv });
  if (skipped.length > 0) entries.push({ name: `${folder}/khong-tai-duoc.txt`, data: new TextEncoder().encode(`Các tệp sau không đưa vào gói được:\n${skipped.join('\n')}\n`) });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return { blob: buildZip(entries), result: { files: entries.filter((e) => /minh chung/.test(e.name)).length, people: report.done.length, skipped } };
}

/** Tải gói ZIP về máy. */
export async function downloadEvidenceZip(board: BoardData, task: TaskItem, onProgress?: (done: number, total: number) => void): Promise<EvidenceResult> {
  const { blob, result } = await buildEvidenceZip(board, task, onProgress);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `minh-chung-${slug(task.label) || 'cong-viec'}-${slug(boardFolderName(board), 24)}.zip`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 8000);
  return result;
}
