import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './electron.d'; // 타입 선언 로드

const root = document.getElementById('root');
if (!root) throw new Error('#root 엘리먼트가 없습니다.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
