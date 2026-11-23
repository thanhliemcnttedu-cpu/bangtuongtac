import { useEffect, useRef, useState } from 'react';
import { Camera, SwitchCamera } from 'lucide-react';
import { describeMediaError } from '../../lib/media';

interface Props {
  onCapture: (file: File) => void;
  onClose: () => void;
}

/** Chụp ảnh bằng máy ảnh của thiết bị. Tắt máy ảnh ngay khi đóng hoặc chụp xong. */
export function CameraCapture({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setReady(false);
    setError('');
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('insecure');
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) { v.srcObject = stream; await v.play().catch(() => undefined); }
        setReady(true);
      } catch (e) {
        if (alive) setError(describeMediaError(e, 'máy ảnh'));
      }
    })();
    return () => {
      alive = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing]);

  const snap = (): void => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')?.drawImage(v, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) onCapture(new File([blob], `anh-chup-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  };

  if (error) {
    return (
      <div className="space-y-3 rounded-2xl bg-rose-50 p-4 text-sm text-rose-800" role="alert">
        <p>{error}</p>
        <button type="button" onClick={onClose} className="btn-ghost btn-sm">Đóng</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl bg-ink">
        <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full object-cover" aria-label="Hình từ máy ảnh" />
        {!ready && <p className="absolute inset-0 flex items-center justify-center text-sm text-white" role="status">Đang mở máy ảnh…</p>}
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        <button type="button" onClick={onClose} className="btn-ghost">Đóng</button>
        <div className="flex gap-2">
          <button type="button" onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))} className="btn-ghost" aria-label="Đổi máy ảnh trước/sau">
            <SwitchCamera className="h-4 w-4" aria-hidden /> Đổi camera
          </button>
          <button type="button" onClick={snap} disabled={!ready} className="btn-primary"><Camera className="h-4 w-4" aria-hidden /> Chụp ảnh</button>
        </div>
      </div>
    </div>
  );
}
