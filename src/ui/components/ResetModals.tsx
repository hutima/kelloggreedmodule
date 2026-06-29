import { useState } from 'react';
import { useEditorStore } from '@/state';
import { clearAllUserData } from '@/persistence';
import { Modal } from './common/Modal';

/**
 * Reset this passage — remove only the SELECTED categories of local user data
 * and restore the base source assignment where applicable. Base source data is
 * never deleted (it regenerates from source XML).
 */
export function ResetPassageModal({ onClose }: { onClose: () => void }) {
  const resetPassage = useEditorStore((s) => s.resetPassage);
  const baseDoc = useEditorStore((s) => s.baseDoc);
  const [syntax, setSyntax] = useState(true);
  const [layout, setLayout] = useState(true);
  const [sermon, setSermon] = useState(false);
  const [notes, setNotes] = useState(false);

  const run = () => {
    resetPassage({ syntax, layout, sermon, notes });
    onClose();
  };

  return (
    <Modal
      title="Reset this passage"
      onClose={onClose}
      footer={
        <div className="modal-buttons">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn danger" onClick={run}>
            Reset selected
          </button>
        </div>
      }
    >
      <p>
        Reset this passage? This will remove the selected custom data for this passage and restore
        the original source assignment where applicable.
      </p>
      <div className="reset-options">
        <label>
          <input type="checkbox" checked={syntax} onChange={(e) => setSyntax(e.target.checked)} disabled={!baseDoc} />
          Syntax edits {!baseDoc && <small>(no base to restore)</small>}
        </label>
        <label>
          <input type="checkbox" checked={layout} onChange={(e) => setLayout(e.target.checked)} disabled={!baseDoc} />
          Layout edits
        </label>
        <label>
          <input type="checkbox" checked={sermon} onChange={(e) => setSermon(e.target.checked)} />
          Sermon prep (notes, highlights, outline)
        </label>
        <label>
          <input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} />
          Passage notes
        </label>
      </div>
    </Modal>
  );
}

/**
 * Reset ALL local data on this device. Requires typing the confirmation phrase.
 */
export function ResetAllModal({ onClose }: { onClose: () => void }) {
  const [phrase, setPhrase] = useState('');
  const reset = () => {
    if (phrase !== 'RESET ALL') return;
    clearAllUserData();
    // Reload so the in-memory state drops to a clean base.
    if (typeof window !== 'undefined') window.location.reload();
  };
  return (
    <Modal
      title="Reset all local data"
      onClose={onClose}
      footer={
        <div className="modal-buttons">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn danger" onClick={reset} disabled={phrase !== 'RESET ALL'}>
            Reset all
          </button>
        </div>
      }
    >
      <p>
        Reset all local data? This will remove all custom assignments, notes, highlights, and sermon
        prep data stored on this device. This cannot be undone unless you have exported a backup.
      </p>
      <label className="reset-confirm">
        Type <strong>RESET ALL</strong> to confirm:
        <input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="RESET ALL" />
      </label>
    </Modal>
  );
}
