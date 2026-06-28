import { useState } from 'react';
import { usePwaUpdate } from '@/pwa/pwa';

/**
 * PWA update UX:
 *   - an auto banner when a new version is available (offers a one-click reload),
 *   - a modal (opened from the top bar) to check for updates, reload, or clear a
 *     broken cache and reload from the network.
 */
export function UpdateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { needRefresh, status, applyUpdate, checkForUpdate, clearCachesAndReload } =
    usePwaUpdate();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const statusLabel: Record<string, string> = {
    idle: '',
    checking: 'Checking for updates…',
    uptodate: 'You have the latest version.',
    available: 'A new version is available.',
    offlineReady: 'Ready to work offline.',
    error: 'Service worker unavailable in this context.',
  };

  return (
    <>
      {/* Auto banner — appears whenever a new version is waiting. */}
      {needRefresh && (
        <div className="update-banner" role="alert">
          <span>A new version is available.</span>
          <button className="mini accept" onClick={() => run('apply', applyUpdate)}>
            {busy === 'apply' ? 'Reloading…' : 'Refresh now'}
          </button>
        </div>
      )}

      {open && (
        <div className="modal-backdrop" onClick={onClose}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="App updates"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="modal-title">App updates &amp; cache</h2>
            <p className="hint">
              This app works offline by caching itself. If something looks stale
              or broken, check for an update or clear the cache and reload.
            </p>

            {statusLabel[status] && (
              <p className={`status-line${status === 'error' ? ' err' : ''}`}>
                {statusLabel[status]}
              </p>
            )}

            <div className="modal-actions">
              <button
                className="mini"
                disabled={busy !== null}
                onClick={() => run('check', checkForUpdate)}
              >
                {busy === 'check' ? 'Checking…' : 'Check for updates'}
              </button>
              <button
                className="mini accept"
                disabled={busy !== null || !needRefresh}
                onClick={() => run('apply', applyUpdate)}
                title={needRefresh ? 'Reload into the new version' : 'No update waiting'}
              >
                Reload into new version
              </button>
              <button
                className="mini reject"
                disabled={busy !== null}
                onClick={() => run('reset', clearCachesAndReload)}
                title="Unregister the service worker, delete all caches, and reload from the network"
              >
                {busy === 'reset' ? 'Clearing…' : 'Clear cache & reload'}
              </button>
            </div>

            <div style={{ textAlign: 'right', marginTop: 14 }}>
              <button className="mini" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
