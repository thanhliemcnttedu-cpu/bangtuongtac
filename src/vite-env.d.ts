/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Khóa công khai VAPID cho nhắc việc đẩy (xem docs/HUONG-DAN-NHAC-VIEC-DAY.md). */
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Hằng số do Vite gắn lúc build (xem vite.config.ts). */
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
declare const __BUILD_COMMIT__: string;
