import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './index.css';

// Hide loading spinner
const loadingEl = document.getElementById('app-loading');
if (loadingEl) loadingEl.style.display = 'none';

const rootEl = document.getElementById('root');
if (!rootEl) {
  // Show error visibly
  const errEl = document.getElementById('app-error');
  const errText = document.getElementById('app-error-text');
  if (errEl) errEl.style.display = 'flex';
  if (errText)
    errText.textContent = 'Fatal: #root element not found. The HTML template may be corrupted.';
  throw new Error('Root element not found');
}

try {
  const root = createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} catch (err) {
  // Show React initialization errors
  const errEl = document.getElementById('app-error');
  const errText = document.getElementById('app-error-text');
  if (errEl) errEl.style.display = 'flex';
  if (errText) errText.textContent = String(err);
  console.error('React mount failed:', err);
}

// Catch unhandled errors from React rendering
window.addEventListener('error', (event) => {
  const errEl = document.getElementById('app-error');
  const errText = document.getElementById('app-error-text');
  if (errText) {
    errText.textContent = (errText.textContent || '') + '\n\n' + event.message;
  }
  if (errEl) errEl.style.display = 'flex';
});
