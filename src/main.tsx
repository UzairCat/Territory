import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from './app/App';
import './app/base.css';

const rootElement = document.querySelector<HTMLDivElement>('#root');

if (rootElement === null) {
  throw new Error('Territory could not find its root element.');
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
