import { GraduationCap } from 'lucide-react';

interface Props {
  error: string;
  onLogin: () => void;
}

/** Màn hình đầu khi dùng Supabase thật mà chưa đăng nhập và không mở bằng link chia sẻ. */
export function LoginScreen({ error, onLogin }: Props) {
  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-glow">
        <GraduationCap className="h-8 w-8" aria-hidden />
      </span>
      <h1 className="text-3xl font-extrabold tracking-tight">Bảng tương tác lớp học</h1>
      <p className="text-ink-2">Giáo viên và báo cáo viên đăng nhập bằng Gmail. Học sinh, học viên chỉ cần mở link hoặc quét mã QR của bảng.</p>
      <button type="button" onClick={onLogin} className="btn-primary !min-h-[52px] w-full text-base">
        <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
          <path fill="#fff" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z" />
        </svg>
        Tiếp tục với Google
      </button>
      {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p>}
    </main>
  );
}
