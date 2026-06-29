import React from 'react';
import ReactDOM from 'react-dom/client';
import { initPwa } from './pwa/pwa';
import { App } from './ui/App';
import { preventNativeZoom } from './ui/preventNativeZoom';
import './ui/styles/global.css';

// Register the service worker (offline support) and wire up the update
// controller that powers the in-app refresh modal and cache-fix controls.
initPwa();

// Stop native page pinch-zoom (the diagram has its own zoom); on iOS a pinch —
// especially zoom-OUT — otherwise leaves the standalone PWA on a blank screen.
preventNativeZoom();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
