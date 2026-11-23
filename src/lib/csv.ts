// Xuất CSV ngay trên trình duyệt. Có BOM UTF-8 để Excel mở đúng tiếng Việt.

function escapeCell(value: string): string {
  // Chặn "CSV injection": ô bắt đầu bằng = + - @ sẽ bị Excel hiểu là công thức.
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: string[][]): string {
  return '﻿' + rows.map((r) => r.map(escapeCell).join(',')).join('\r\n');
}

export function downloadCsv(filename: string, rows: string[][]): void {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
