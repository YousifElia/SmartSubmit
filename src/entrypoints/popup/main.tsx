import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/ui/styles.css';
import { initClient } from '@/ui/client';
import { Popup } from './Popup';

initClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
