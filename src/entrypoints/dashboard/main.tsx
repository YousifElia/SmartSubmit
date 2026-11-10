import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/ui/styles.css';
import { initClient } from '@/ui/client';
import { App } from './App';

initClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
