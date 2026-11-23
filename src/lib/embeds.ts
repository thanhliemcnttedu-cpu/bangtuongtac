import type { Attachment } from '../types/board';

// Nhận dạng liên kết YouTube / Vimeo / Google Drive / Spotify và đổi thành địa chỉ nhúng.
// AN TOÀN: chỉ khi khớp đúng mẫu dưới đây mới tạo iframe, địa chỉ nhúng luôn do mã này dựng lại
// từ mã nhận dạng (ID) đã lọc ký tự; không bao giờ nhúng nguyên văn địa chỉ người dùng dán.

const ID = /^[A-Za-z0-9_-]{6,64}$/;

function safeUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

export function parseEmbed(raw: string): Attachment | null {
  const u = safeUrl(raw);
  if (!u) return null;
  const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
  const parts = u.pathname.split('/').filter(Boolean);

  // YouTube
  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'youtu.be') {
    let id = '';
    if (host === 'youtu.be') id = parts[0] ?? '';
    else if (parts[0] === 'watch') id = u.searchParams.get('v') ?? '';
    else if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') id = parts[1] ?? '';
    if (ID.test(id)) {
      return {
        type: 'embed', name: 'Video YouTube', url: u.toString(),
        embed: { provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}`, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` },
      };
    }
  }

  // Vimeo
  if (host === 'vimeo.com') {
    const id = parts.find((p) => /^\d{5,12}$/.test(p));
    if (id) return { type: 'embed', name: 'Video Vimeo', url: u.toString(), embed: { provider: 'vimeo', src: `https://player.vimeo.com/video/${id}` } };
  }

  // Google Drive / Docs / Slides
  if (host === 'drive.google.com' || host === 'docs.google.com') {
    const di = parts.indexOf('d');
    const id = di >= 0 ? parts[di + 1] ?? '' : u.searchParams.get('id') ?? '';
    if (ID.test(id)) {
      if (host === 'docs.google.com' && parts[0] === 'presentation') {
        return { type: 'embed', name: 'Google Slides', url: u.toString(), embed: { provider: 'drive', src: `https://docs.google.com/presentation/d/${id}/embed` } };
      }
      if (host === 'docs.google.com' && (parts[0] === 'document' || parts[0] === 'spreadsheets')) {
        return { type: 'embed', name: parts[0] === 'document' ? 'Google Docs' : 'Google Sheets', url: u.toString(), embed: { provider: 'drive', src: `https://docs.google.com/${parts[0]}/d/${id}/preview` } };
      }
      if (host === 'drive.google.com') {
        return { type: 'embed', name: 'Tệp Google Drive', url: u.toString(), embed: { provider: 'drive', src: `https://drive.google.com/file/d/${id}/preview` } };
      }
    }
  }

  // Spotify
  if (host === 'open.spotify.com') {
    const kinds = ['track', 'album', 'playlist', 'episode', 'show', 'artist'];
    const i = parts.findIndex((p) => kinds.includes(p));
    const id = i >= 0 ? parts[i + 1] ?? '' : '';
    if (i >= 0 && /^[A-Za-z0-9]{10,40}$/.test(id)) {
      return { type: 'embed', name: 'Spotify', url: u.toString(), embed: { provider: 'spotify', src: `https://open.spotify.com/embed/${parts[i]}/${id}` } };
    }
  }
  return null;
}

/** Liên kết bất kỳ → tệp đính kèm: nhúng được thì nhúng, không thì giữ dạng liên kết thường. */
/** Học sinh nhỏ hay quên "https://": thấy dạng tên miền (có dấu chấm, không có khoảng trắng) thì tự thêm vào. */
export function normalizeLink(raw: string): string {
  const t = raw.trim();
  if (!t || /^[a-z][a-z0-9+.-]*:/i.test(t)) return t;
  return /^[^\s/@]+\.[^\s/@]{2,}(\/\S*)?$/.test(t) ? `https://${t}` : t;
}

export function linkToAttachment(raw: string): Attachment {
  const e = parseEmbed(raw);
  if (e) return e;
  const u = safeUrl(raw);
  return { type: 'link', name: u ? u.hostname.replace(/^www\./, '') : raw.trim(), url: u ? u.toString() : undefined };
}
