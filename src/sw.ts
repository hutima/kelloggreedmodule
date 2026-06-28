/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

// Hand-written service worker (injectManifest). See src/pwa/pwa.ts for the page
// side. The invariants below were hardened against iOS standalone PWAs freezing
// on update — do not "simplify" them back to skipWaiting-on-install.

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null } | string>;
};

// INVARIANT 1: install precaches and then WAITS — NO skipWaiting() here.
// Activating on install fires controllerchange while the page is mid-launch,
// which froze iOS standalone PWAs (page renders, every tap dead, needs
// force-quit). precacheAndRoute fetches each entry with `cache: 'reload'` so a
// release always precaches fresh copies even if a hash bump was missed.
precacheAndRoute(self.__WB_MANIFEST);

// Drop precaches that are no longer in the current manifest.
cleanupOutdatedCaches();

// INVARIANT 3: the SKIP_WAITING message is the ONLY on-demand activation path,
// and the page only sends it from inside a user tap ("Refresh now").
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

// INVARIANT 4: activate claims clients but NEVER force-navigates them
// (competing navigations on the same URL wedged iOS launches). The page's
// controllerchange listener owns reloading, and it only reloads for a
// user-accepted update.
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
