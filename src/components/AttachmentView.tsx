import { ExternalLink, Mic } from 'lucide-react';
import type { Attachment } from '../types/board';
import { parseEmbed } from '../lib/embeds';
import { safeHref } from '../lib/safeUrl';
import { docKindOf } from '../lib/media';
import { FileFallback, OfficeViewer, PdfViewer, TextViewer } from './FileViewers';

/** Xem đầy đủ tệp đính kèm (dùng trong chế độ trình chiếu): phát video/âm thanh, nhúng YouTube/Drive/Spotify. */
export function AttachmentView({ attachment }: { attachment: Attachment }) {
  const url = safeHref(attachment.url);

  if (attachment.type === 'image' && url) {
    return <img src={url} alt={attachment.name} className="viewer-media max-h-[62vh] w-full rounded-3xl bg-brand-50 object-contain" />;
  }
  if (attachment.type === 'video' && url) {
    return <video src={url} controls playsInline className="viewer-media max-h-[62vh] w-full rounded-3xl bg-ink" aria-label={attachment.name} />;
  }
  if (attachment.type === 'audio' && url) {
    return (
      <div className="flex w-full flex-col items-center gap-4 rounded-3xl bg-gradient-to-br from-teal2-500 to-brand-600 p-8 text-white">
        <Mic className="h-14 w-14" aria-hidden />
        <p className="max-w-full truncate text-lg font-bold">{attachment.name}</p>
        <audio src={url} controls className="w-full" />
      </div>
    );
  }
  if (attachment.type === 'embed') {
    // Không dùng trường embed lưu sẵn: dựng lại từ liên kết gốc qua bộ nhận dạng có danh sách nhà cung cấp cố định.
    const e = attachment.url ? parseEmbed(attachment.url) : null;
    const src = e?.embed?.src;
    if (src) {
      const provider = e.embed?.provider;
      const height = provider === 'spotify' ? 'h-[352px]' : provider === 'drive' ? 'aspect-[4/3]' : 'aspect-video';
      return (
        <iframe src={src} title={attachment.name} loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
          allow="fullscreen; autoplay; encrypted-media; picture-in-picture" allowFullScreen
          className={`w-full rounded-3xl border-0 bg-brand-50 ${height}`} />
      );
    }
  }
  if (attachment.type === 'link') {
    return url ? (
      <a href={url} target="_blank" rel="noopener noreferrer" className="btn-primary w-fit"><ExternalLink className="h-4 w-4" aria-hidden /> Mở liên kết: {attachment.name}</a>
    ) : <p className="text-sm text-ink-3">Liên kết không hợp lệ.</p>;
  }

  // Tệp tài liệu: xem trực tiếp theo loại.
  const kind = docKindOf(attachment);
  if (kind === 'pdf') return <PdfViewer attachment={attachment} />;
  if (kind === 'text' || kind === 'csv') return <TextViewer attachment={attachment} csv={kind === 'csv'} />;
  if (kind === 'word' || kind === 'excel' || kind === 'powerpoint') return <OfficeViewer attachment={attachment} kind={kind} />;
  return <FileFallback attachment={attachment} kind="other" />;
}
