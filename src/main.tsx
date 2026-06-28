import React from 'react';
import ReactDOM from 'react-dom/client';
import { initPwa } from './pwa/pwa';
import { App } from './ui/App';
import './ui/styles/global.css';

// Register the service worker (offline support) and wire up the update
// controller that powers the in-app refresh modal and cache-fix controls.
initPwa();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
