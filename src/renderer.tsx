/**
 * Renderer entrypoint. Boots the React timeline editor into #root.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('root element not found');
}
createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
