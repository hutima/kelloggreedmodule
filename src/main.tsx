import React from 'react';
import ReactDOM from 'react-dom/client';
import { initPwa } from './pwa/pwa';
import { App } from './ui/App';
import { preventNativeZoom } from './ui/preventNativeZoom';
import { installGlobalErrorLog, breadcrumb, BUILD_ID } from './ui/errorLog';
import './ui/styles/global.css';

// Capture JS errors to an on-device log BEFORE anything else runs, so a crash
// during startup or a pinch gesture survives the blank/reload and is shown by
// the DiagnosticsBanner — the only way to read errors on a phone with no console.
installGlobalErrorLog();
// Stamp the build at startup so the banner proves which build is live (a cached
// PWA build would show an old/no BUILD_ID), and mark the start of a fresh trail.
breadcrumb(`load ${BUILD_ID}`);

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
