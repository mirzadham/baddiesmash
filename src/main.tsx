import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { registerServiceWorker } from './lib/pwa.ts';
import './styles/index.css';

// Register PWA service worker for app shell caching (DEC-056, Phase 33)
registerServiceWorker();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in document');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
