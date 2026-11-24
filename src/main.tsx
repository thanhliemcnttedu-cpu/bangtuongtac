import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { initButtonIcons, initFx } from './lib/fx';

const SharedTasksPage = lazy(() => import('./components/SharedTasksPage'));
// Link chia sẻ "Công việc của tôi": /v/<mã> mở trang chỉ xem, không qua ứng dụng đăng nhập.
const shared = window.location.pathname.match(/^\/v\/([A-Za-z0-9_-]{16,64})\/?$/);

initFx();
initButtonIcons();

const root = document.getElementById('root');
if (!root) throw new Error('Không tìm thấy phần tử #root');
createRoot(root).render(
  <StrictMode>
    {shared ? <Suspense fallback={<p className="p-10 text-center" role="status">Đang tải…</p>}><SharedTasksPage shareKey={shared[1]} /></Suspense> : <App />}
  </StrictMode>,
);
