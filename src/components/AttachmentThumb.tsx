import { AlignLeft, Cloud, FileText, Image as ImageIcon, Link2, Mic, Play } from 'lucide-react';
import type { Attachment } from '../types/board';
import { parseEmbed } from '../lib/embeds';
import { DOC_HUE, DOC_LABEL, docKindOf } from '../lib/media';
import { safeHref } from '../lib/safeUrl';

interface Props {
  attachment: Attachment | null;
  className?: string;
  large?: boolean;
}

function Block({ hue, className, large, children, name }: { hue: number; className: string; large: boolean; children: React.ReactNode; name: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-1 text-white ${className}`}
      style={{ background: `linear-gradient(135deg, hsl(${hue} 80% 55%), hsl(${(hue + 40) % 360} 75% 45%))` }}>
      {children}
      <span className={`max-w-[90%] truncate font-semibold ${large ? 'text-base' : 'text-[11px]'}`}>{name}</span>
    </div>
  );
}

/** Ảnh xem trước trên thẻ: ảnh thật, khung hình đầu của video, ảnh bìa YouTube, hoặc khối màu theo loại tệp. */
export function AttachmentThumb({ attachment, className = '', large = false }: Props) {
  const icon = large ? 'h-12 w-12' : 'h-7 w-7';
  if (!attachment) {
    return (
      <div className={`flex items-center justify-center bg-brand-50 text-brand-700 ${className}`}>
        <AlignLeft className={icon} aria-hidden />
      </div>
    );
  }
  const url = safeHref(attachment.url);
  const hue = attachment.hue ?? 210;

  // Đã chuyển sang Drive: không có ảnh để xem trước, hiện khối "Trên Google Drive".
  if (attachment.archived) return <Block hue={215} className={className} large={large} name={attachment.name}><Cloud className={icon} aria-hidden /></Block>;

  if (attachment.type === 'image' && url) return <img src={url} alt={attachment.name} loading="lazy" className={`object-cover ${className}`} />;

  if (attachment.type === 'video' && url) {
    return (
      <div className={`relative overflow-hidden bg-ink ${className}`}>
        <video src={`${url}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" aria-label={attachment.name} />
        <span className="absolute inset-0 flex items-center justify-center bg-ink/20"><Play className="h-10 w-10 fill-white text-white drop-shadow" aria-hidden /></span>
      </div>
    );
  }

  if (attachment.type === 'audio') {
    return <Block hue={hue === 210 ? 170 : hue} className={className} large={large} name={attachment.name}><Mic className={icon} aria-hidden /></Block>;
  }

  if (attachment.type === 'embed') {
    // Địa chỉ nhúng luôn dựng lại từ liên kết gốc (không tin trường embed lưu trong CSDL).
    const e = attachment.url ? parseEmbed(attachment.url) : null;
    const thumb = safeHref(e?.embed?.thumb);
    if (thumb) {
      return (
        <div className={`relative overflow-hidden bg-ink ${className}`}>
          <img src={thumb} alt={attachment.name} loading="lazy" className="h-full w-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center bg-ink/20"><Play className="h-10 w-10 fill-white text-white drop-shadow" aria-hidden /></span>
        </div>
      );
    }
    return <Block hue={hue === 210 ? 20 : hue} className={className} large={large} name={attachment.name}><Play className={icon} aria-hidden /></Block>;
  }

  if (attachment.type === 'file') {
    const kind = docKindOf(attachment);
    return (
      <Block hue={attachment.hue ?? DOC_HUE[kind]} className={className} large={large} name={attachment.name}>
        <FileText className={icon} aria-hidden />
        <span className={`rounded-full bg-white/25 px-2 font-extrabold ${large ? 'text-sm' : 'text-[10px]'}`}>{DOC_LABEL[kind]}</span>
      </Block>
    );
  }
  const Icon = attachment.type === 'image' ? ImageIcon : Link2;
  return <Block hue={hue} className={className} large={large} name={attachment.name}><Icon className={icon} aria-hidden /></Block>;
}
