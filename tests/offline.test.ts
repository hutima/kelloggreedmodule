import { describe, it, expect } from 'vitest';
import {
  downloadCorpus,
  storageEstimate,
  requestPersistentStorage,
  type WarmProgress,
} from '@/io/offline';

/**
 * The offline download warms the runtime cache over the network, so the unit
 * tests only pin the parts that DON'T need a live fetch: it bails out cleanly on
 * an already-cancelled download, and the Storage-API helpers degrade gracefully
 * when the API is missing (as it is in the test environment).
 */
describe('offline corpus download', () => {
  it('bails immediately on an already-aborted signal — no fetch, no progress', async () => {
    const ac = new AbortController();
    ac.abort();
    const progress: WarmProgress[] = [];
    await downloadCorpus('nt', { signal: ac.signal, onProgress: (p) => progress.push(p) });
    expect(progress).toEqual([]); // returned before touching the first book
  });

  it('storageEstimate resolves to null or a numeric usage/quota (never throws)', async () => {
    const est = await storageEstimate();
    expect(est === null || (typeof est.usage === 'number' && typeof est.quota === 'number')).toBe(true);
  });

  it('requestPersistentStorage always resolves to a boolean', async () => {
    expect(typeof (await requestPersistentStorage())).toBe('boolean');
  });
});
