import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

export default defineConfig({
  plugins: [react()],
  // Phiên bản lấy từ package.json; giờ cập nhật là lúc build (ISO), trình duyệt đổi sang giờ máy của người xem.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7)),
  },
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // Tách thư viện ít đổi ra gói riêng: lần cập nhật sau trình duyệt chỉ tải lại phần mã của dự án.
        manualChunks: {
          react: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
