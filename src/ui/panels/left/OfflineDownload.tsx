import { useEffect, useRef, useState } from 'react';
import {
  downloadCorpus,
  requestPersistentStorage,
  storageEstimate,
  clearCorpusCache,
  type OfflineCorpus,
  type WarmProgress,
} from '@/io';

/**
 * Opt-in "download this testament for offline use". Warms the service worker's
 * runtime cache so search / reading works with no network, with a progress bar
 * and a live storage-usage readout. This fills DISK (Cache Storage), never the
 * app's install size, and it's best-effort — the browser may evict it — so it's
 * framed as a convenience, not a guarantee.
 */
const mb = (bytes: number) => `${Math.round(bytes / 1e6)} MB`;

export function OfflineDownload({ corpus, testament }: { corpus: OfflineCorpus; testament: string }) {
  const [progress, setProgress] = useState<WarmProgress | null>(null);
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = () => void storageEstimate().then(setEstimate);
  useEffect(() => {
    refresh();
    return () => abortRef.current?.abort();
  }, []);

  const run = async () => {
    await requestPersistentStorage(); // ask for durable storage (best-effort)
    const ac = new AbortController();
    abortRef.current = ac;
    setProgress({ done: 0, total: 1, label: '' });
    try {
      await downloadCorpus(corpus, { signal: ac.signal, onProgress: setProgress });
    } finally {
      if (abortRef.current === ac) {
        setProgress(null);
        abortRef.current = null;
        refresh();
      }
    }
  };
  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setProgress(null);
    refresh();
  };
  const clear = async () => {
    await clearCorpusCache();
    refresh();
  };

  const pct = progress && progress.total ? (progress.done / progress.total) * 100 : 0;

  return (
    <div className="offline-box" style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line, #d2d9e0)' }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted, #667)', fontWeight: 600 }}>
        Offline
      </div>
      {estimate && estimate.quota > 0 && (
        <div style={{ fontSize: 12, color: 'var(--ink-soft, #667)', margin: '4px 0' }}>
          Using {mb(estimate.usage)} of ~{mb(estimate.quota)} on this device
        </div>
      )}

      {progress ? (
        <>
          <div style={{ fontSize: 12, color: 'var(--ink-soft, #667)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span>
              Downloading {progress.label || '…'} — {progress.done}/{progress.total}
            </span>
            <button className="mini" onClick={stop}>
              Stop
            </button>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'var(--line, #ddd)', overflow: 'hidden', marginTop: 4 }} role="progressbar" aria-valuenow={progress.done} aria-valuemax={progress.total}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent, #b90e31)', transition: 'width 120ms linear' }} />
          </div>
        </>
      ) : (
        <div className="row" style={{ gap: 6 }}>
          <button className="mini" onClick={run} title={`Fetch every book of the ${testament} for offline use`}>
            Download {testament}
          </button>
          {estimate && estimate.usage > 0 && (
            <button className="mini" onClick={clear} title="Remove the downloaded offline data">
              Clear
            </button>
          )}
        </div>
      )}

      <p className="hint" style={{ fontSize: 11, color: 'var(--muted, #667)', margin: '6px 0 0' }}>
        Stores the books on this device (not part of the app download) so search works offline. Best-effort — the browser
        may clear it under storage pressure; search still fetches on a miss.
      </p>
    </div>
  );
}
