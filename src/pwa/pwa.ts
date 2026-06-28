import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';

/**
 * Service-worker update controller.
 *
 * Wraps vite-plugin-pwa's `registerSW` in a tiny external store so the UI can:
 *   - react to a newly available version (auto "refresh" modal),
 *   - manually check for updates,
 *   - and hard-reset a broken cache (unregister SW + delete all caches).
 *
 * Kept framework-light (one module-level state + useSyncExternalStore) so the
 * registration is a singleton no matter how many components read it.
 */
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'uptodate'
  | 'available'
  | 'offlineReady'
  | 'error';

interface PwaState {
  needRefresh: boolean;
  offlineReady: boolean;
  status: UpdateStatus;
}

let state: PwaState = { needRefresh: false, offlineReady: false, status: 'idle' };
const listeners = new Set<() => void>();
let updateSW: ((reload?: boolean) => Promise<void>) | null = null;
let registration: ServiceWorkerRegistration | undefined;
let initialised = false;

function set(patch: Partial<PwaState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

/** Register the service worker. Call once at startup. */
export function initPwa(): void {
  if (initialised) return;
  initialised = true;
  try {
    updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        set({ needRefresh: true, status: 'available' });
      },
      onOfflineReady() {
        set({ offlineReady: true });
      },
      onRegisteredSW(_swUrl, reg) {
        registration = reg;
      },
      onRegisterError() {
        set({ status: 'error' });
      },
    });
  } catch {
    // No service worker in this environment (e.g. dev without PWA) — harmless.
    set({ status: 'error' });
  }
}

/** Activate the waiting worker and reload into the new version. */
export async function applyUpdate(): Promise<void> {
  if (updateSW) await updateSW(true);
  else location.reload();
}

/** Ask the browser to check the server for a newer service worker. */
export async function checkForUpdate(): Promise<void> {
  set({ status: 'checking' });
  try {
    await registration?.update();
    // onNeedRefresh flips status to 'available' if a new worker was found.
    setTimeout(() => {
      if (!state.needRefresh && state.status === 'checking') set({ status: 'uptodate' });
    }, 600);
  } catch {
    set({ status: 'error' });
  }
}

/**
 * Last-resort cache fix: unregister every service worker, delete every Cache
 * Storage entry, then reload from the network. Resolves a corrupted/stale
 * precache that an ordinary update can't.
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
  applyUpdate: typeof applyUpdate;
  checkForUpdate: typeof checkForUpdate;
  clearCachesAndReload: typeof clearCachesAndReload;
} {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { ...snap, applyUpdate, checkForUpdate, clearCachesAndReload };
}
