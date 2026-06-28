import { useState } from 'react';
import { usePwaUpdate } from '@/pwa/pwa';

/**
 * PWA update UX:
 *   - a MANDATORY click-through "Update available" overlay (no ✕, no backdrop
 *     close, excluded from any Esc handler) shown when a new worker is waiting;
 *   - a utility modal (opened from the top-bar ⟳) to check for updates or clear
 *     a broken cache and reload.
 *
 * The waiting worker never activates on its own this session, so there is no
 * auto-reload to race — but the user must explicitly accept (or cold-restart).
 */
export function UpdateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    updateAvailable,
    status,
    acceptRefreshAvailable,
    checkForUpdate,
    clearCachesAndReload,
  } = usePwaUpdate();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void> | void) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const statusLabel: Record<UpdateStatusKey, string> = {
    idle: '',
    checking: 'Checking for updates…',
    uptodate: 'You have the latest version.',
    error: 'Service worker unavailable in this context.',
  };

  return (
    <>
      {/* MANDATORY overlay — no dismiss path; only "Refresh now" closes it. */}
      {updateAvailable && (
        <div className="modal-backdrop" data-mandatory="true">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="updateAvailableTitle"
          >
            <h2 className="modal-title" id="updateAvailableTitle">
              Update available
            </h2>
            <p className="hint">
              A new version is ready. Tap <strong>Refresh now</strong> to update —
              or just close the app fully and reopen it. Your saved diagrams stay
              on this device and won’t be affected.
            </p>
            <div className="modal-actions">
              <button
                className="mini accept"
                onClick={() => run('apply', acceptRefreshAvailable)}
              >
                {busy === 'apply' ? 'Refreshing…' : 'Refresh now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Utility modal — dismissible. */}
      {open && (
        <div className="modal-backdrop" onClick={onClose}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="App updates and cache"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="modal-title">App updates &amp; cache</h2>
            <p className="hint">
              This app works offline by caching itself. A new version installs in
              the background and is applied only when you choose. If something
              looks stale or broken, check for an update or clear the cache.
            </p>

            {statusLabel[status] && <p className="status-line">{statusLabel[status]}</p>}
            {updateAvailable && (
              <p className="status-line">An update is ready — see the prompt.</p>
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

type UpdateStatusKey = 'idle' | 'checking' | 'uptodate' | 'error';
