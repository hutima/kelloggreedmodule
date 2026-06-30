import { useSyncExternalStore } from 'react';

/**
 * Service-worker update controller — race-condition-safe, hardened against iOS
 * standalone PWAs freezing on update.
 *
 * Invariants (mirror src/sw.ts):
 *   1. The new worker installs and WAITS; never skipWaiting() on install.
 *   2. The page reloads ONLY for a user-accepted update (`refreshAccepted`
 *      gate). A controllerchange at launch / cold start must NOT reload.
 *   3. The SKIP_WAITING message is the sole on-demand activation path.
 *   4. activate never force-navigates clients.
 *   5. The prompt re-surfaces on tab refocus, not just at first registration.
 *   6. acceptRefreshAvailable has a ~1.5s fallback reload so the tap is never a
 *      no-op.
 *   7. The first install never shows the prompt (guarded on
 *      navigator.serviceWorker.controller).
 */

export type UpdateStatus = 'idle' | 'checking' | 'uptodate' | 'error';

interface PwaState {
  updateAvailable: boolean;
  status: UpdateStatus;
}

let state: PwaState = { updateAvailable: false, status: 'idle' };
const listeners = new Set<() => void>();
function set(patch: Partial<PwaState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

// Reload ONLY for a user-initiated update. Auto-reloading on controllerchange
// at launch froze iOS standalone PWAs; the worker waits until "Refresh now", so
// the reload runs inside the user gesture, which iOS handles.
let pendingWorker: ServiceWorker | null = null;
let reloading = false;
let refreshAccepted = false;
let registration: ServiceWorkerRegistration | undefined;
let initialised = false;

function showRefreshAvailable(sw: ServiceWorker) {
  pendingWorker = sw;
  set({ updateAvailable: true });
}

/** Wired to the mandatory "Refresh now" button — the only activation trigger. */
export function acceptRefreshAvailable(): void {
  refreshAccepted = true;
  if (pendingWorker) {
    try {
      pendingWorker.postMessage({ type: 'SKIP_WAITING' });
    } catch {
      /* ignore — fallback below still reloads */
    }
  }
  // Belt-and-suspenders: if controllerchange never fires, reload anyway.
  setTimeout(() => {
    if (!reloading) {
      reloading = true;
      location.reload();
    }
  }, 1500);
}

function trackUpdates(reg: ServiceWorkerRegistration) {
  // Returning user already has a new version waiting -> prompt now.
  if (reg.waiting && navigator.serviceWorker.controller) {
    showRefreshAvailable(reg.waiting);
  }
  reg.addEventListener('updatefound', () => {
    const sw = reg.installing;
    if (!sw) return;
    sw.addEventListener('statechange', () => {
      // controller check => this is an update, not the very first install.
      if (sw.state === 'installed' && navigator.serviceWorker.controller) {
        showRefreshAvailable(sw);
      }
    });
  });
}

/** Register the service worker and start tracking updates. Call once. */
export function initPwa(): void {
  if (initialised) return;
  initialised = true;
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshAccepted || reloading) return; // INVARIANT 2
    reloading = true;
    location.reload();
  });

  const register = () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' })
      .then((reg) => {
        registration = reg;
        trackUpdates(reg);
        // reg.update() rejects ASYNCHRONOUSLY when the worker byte-for-byte
        // re-check can't load sw.js (a transient 404 mid-deploy, an offline
        // refocus, a network blip). A synchronous try/catch can't catch a
        // rejected promise, so those rejections escaped as an unhandledrejection
        // ("Script …/sw.js load failed"). Handle it on the promise itself — a
        // failed re-check is expected and harmless; the active worker keeps serving.
        void reg.update().catch(() => {});
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState !== 'visible') return;
          void reg.update().catch(() => {});
          // INVARIANT 5: re-surface a worker that went waiting while
          // backgrounded — trackUpdates' one-time check only runs at register.
          if (reg.waiting && navigator.serviceWorker.controller) {
            showRefreshAvailable(reg.waiting);
          }
        });
      })
      .catch(() => {
        /* no service worker in this context (e.g. dev) — harmless */
      });
  };

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

/** Manually ask the browser to re-check the server for a newer worker. */
export async function checkForUpdate(): Promise<void> {
  set({ status: 'checking' });
  try {
    await registration?.update();
    // trackUpdates flips updateAvailable if a new worker was found.
    setTimeout(() => {
      if (!state.updateAvailable && state.status === 'checking') {
        set({ status: 'uptodate' });
      }
    }, 800);
  } catch {
    set({ status: 'error' });
  }
}

/**
 * Last-resort cache fix: unregister every service worker, delete every Cache
 * Storage entry, then reload from the network. Runs inside a user gesture, so
 * the reload is safe. Resolves a corrupted/stale precache an update can't.
 */
export async function clearCachesAndReload(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } finally {
    reloading = true;
    location.reload();
  }
}

// --- React binding ------------------------------------------------------------

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot(): PwaState {
  return state;
}

export function usePwaUpdate(): PwaState & {
  acceptRefreshAvailable: typeof acceptRefreshAvailable;
  checkForUpdate: typeof checkForUpdate;
  clearCachesAndReload: typeof clearCachesAndReload;
} {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { ...snap, acceptRefreshAvailable, checkForUpdate, clearCachesAndReload };
}
