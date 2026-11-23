import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { initButtonIcons, initFx } from './lib/fx';

initFx();
initButtonIcons();

const root = document.getElementById('root');
if (!root) throw new Error('Không tìm thấy phần tử #root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
