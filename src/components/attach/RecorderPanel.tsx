import { useEffect, useRef, useState } from 'react';
import { Check, Circle, RotateCcw, Square } from 'lucide-react';
import { describeMediaError, pickRecorderMime } from '../../lib/media';

export type RecorderKind = 'video' | 'audio' | 'screen';

interface Props {
  kind: RecorderKind;
  onDone: (file: File) => void;
  onClose: () => void;
}

const VIDEO_MIMES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
const AUDIO_MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];

// Giới hạn thời lượng và tốc độ bit để tệp luôn dưới 25 MB: 120 giây × 1,2 Mbps ≈ 18 MB.
const LIMIT_SECONDS: Record<RecorderKind, number> = { video: 120, audio: 300, screen: 120 };
const LABEL: Record<RecorderKind, { device: string; title: string }> = {
  video: { device: 'máy ảnh và micro', title: 'Quay video' },
  audio: { device: 'micro', title: 'Ghi âm' },
  screen: { device: 'màn hình', title: 'Quay màn hình' },
};

const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function RecorderPanel({ kind, onDone, onClose }: Props) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'review'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ file: File; url: string } | null>(null);
  const liveRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const isAudio = kind === 'audio';

  const releaseStream = (): void => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current !== null) { window.clearInterval(timerRef.current); timerRef.current = null; }
  };

  // Dọn máy ảnh/micro khi đóng khung ghi.
  useEffect(() => () => {
    releaseStream();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
  }, []);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  const start = async (): Promise<void> => {
    setError('');
    try {
      if (typeof MediaRecorder === 'undefined') throw new Error('Trình duyệt này chưa hỗ trợ ghi hình. Hãy dùng Chrome, Edge hoặc Firefox bản mới.');
      if (!navigator.mediaDevices) throw new Error('insecure');
      const stream = kind === 'screen'
        ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        : await navigator.mediaDevices.getUserMedia({ audio: true, video: kind === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false });
      streamRef.current = stream;
      if (liveRef.current && !isAudio) { liveRef.current.srcObject = stream; await liveRef.current.play().catch(() => undefined); }

      const mimeType = pickRecorderMime(isAudio ? AUDIO_MIMES : VIDEO_MIMES);
      const rec = new MediaRecorder(stream, { mimeType, ...(isAudio ? { audioBitsPerSecond: 64_000 } : { videoBitsPerSecond: 1_200_000, audioBitsPerSecond: 64_000 }) });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      rec.onstop = () => {
        releaseStream();
        const type = rec.mimeType || mimeType || (isAudio ? 'audio/webm' : 'video/webm');
        const blob = new Blob(chunks, { type });
        const ext = type.includes('mp4') ? 'mp4' : type.includes('ogg') ? 'ogg' : 'webm';
        const file = new File([blob], `${isAudio ? 'ghi-am' : kind === 'screen' ? 'man-hinh' : 'video'}-${Date.now()}.${ext}`, { type });
        setResult({ file, url: URL.createObjectURL(blob) });
        setPhase('review');
      };
      recorderRef.current = rec;
      // Người dùng bấm "Dừng chia sẻ" của trình duyệt khi quay màn hình thì dừng ghi luôn.
      stream.getVideoTracks()[0]?.addEventListener('ended', () => { if (rec.state !== 'inactive') rec.stop(); });
      rec.start(1000);
      setSeconds(0);
      setPhase('recording');
      timerRef.current = window.setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= LIMIT_SECONDS[kind] && rec.state !== 'inactive') rec.stop();
          return s + 1;
        });
      }, 1000);
    } catch (e) {
      releaseStream();
      setError(e instanceof Error && e.message.startsWith('Trình duyệt này') ? e.message : describeMediaError(e, LABEL[kind].device));
      setPhase('idle');
    }
  };

  const stop = (): void => { if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop(); };
  const again = (): void => { setResult(null); setPhase('idle'); setSeconds(0); };

  return (
    <div className="space-y-3">
      <p className="text-sm font-bold">{LABEL[kind].title} <span className="font-normal text-ink-2">· tối đa {mmss(LIMIT_SECONDS[kind])}</span></p>

      {error && <p role="alert" className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

      {phase !== 'review' && (
        <div className={`overflow-hidden rounded-2xl bg-ink ${isAudio ? 'flex h-28 items-center justify-center' : ''}`}>
          {isAudio ? (
            <p className="text-white" role="status">{phase === 'recording' ? '● Đang ghi âm…' : 'Bấm “Bắt đầu” để ghi âm'}</p>
          ) : (
            <video ref={liveRef} muted playsInline className="aspect-video w-full object-contain" aria-label="Hình đang ghi" />
          )}
        </div>
      )}

      {phase === 'review' && result && (
        isAudio
          ? <audio src={result.url} controls className="w-full" />
          : <video src={result.url} controls playsInline className="aspect-video w-full rounded-2xl bg-ink" />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onClose} className="btn-ghost">Đóng</button>
        <div className="flex items-center gap-2">
          {phase === 'recording' && <span className="chip bg-rose-100 text-rose-800 ring-rose-200" aria-live="off"><Circle className="h-3 w-3 animate-pulse fill-current" aria-hidden /> {mmss(seconds)}</span>}
          {phase === 'idle' && <button type="button" onClick={() => void start()} className="btn-primary"><Circle className="h-4 w-4 fill-current" aria-hidden /> Bắt đầu</button>}
          {phase === 'recording' && <button type="button" onClick={stop} className="btn-primary"><Square className="h-4 w-4 fill-current" aria-hidden /> Dừng</button>}
          {phase === 'review' && result && (
            <>
              <button type="button" onClick={again} className="btn-ghost"><RotateCcw className="h-4 w-4" aria-hidden /> Ghi lại</button>
              <button type="button" onClick={() => onDone(result.file)} className="btn-primary"><Check className="h-4 w-4" aria-hidden /> Dùng bản ghi này</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
