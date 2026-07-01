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

// Corpus syntax trees (GNT · Hebrew OT · OpenText) are fetched on demand — they
// are far too large to precache (the GNT alone is ~80 MB) — and cache-first in a
// runtime cache so a book opened once (or an offline download, see io/offline.ts)
// stays available with no network. These XML trees are immutable. The cache name
// is kept as 'gnt-books-v1' for continuity, though it now holds every corpus.
self.addEventListener('fetch', (event) => {
  const p = new URL(event.request.url).pathname;
  const isCorpus =
    (p.endsWith('.xml') &&
      (p.includes('/gnt/') ||
        p.includes('nestle1904-lowfat') ||
        p.includes('/ot/') ||
        p.includes('macula-hebrew') ||
        p.includes('/opentext/') ||
        p.includes('OpenText-org'))) ||
    // The Strong's lexicon JSON (fetched on demand by the add-a-word search) —
    // large, immutable, cache-first so it's instant on re-open and works offline.
    (p.includes('/lexicon/') && p.endsWith('.json'));
  if (event.request.method !== 'GET' || !isCorpus) return;
  event.respondWith(
    caches.open('gnt-books-v1').then(async (cache) => {
      const hit = await cache.match(event.request);
      if (hit) return hit;
      const res = await fetch(event.request);
      if (res.ok) cache.put(event.request, res.clone());
      return res;
    }),
  );
});

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
