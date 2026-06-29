import { useEffect } from 'react';

/**
 * "How to use" guide (opened from the top bar). Holds the usage instructions
 * that used to sit inline above each passage picker — moving them here frees
 * vertical space in the picker, which matters most on a phone.
 */
export function GuideModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal about-modal"
        role="dialog"
        aria-modal="true"
        aria-label="User guide"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>How to use</h2>
          <button className="modal-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="about-body">
          <h3>Open a passage</h3>
          <ol className="guide-steps">
            <li>
              Pick the corpus with the <strong>GNT</strong> (Greek New Testament) or{' '}
              <strong>OT</strong> (Hebrew Bible) tab.
            </li>
            <li>
              Choose a <strong>book</strong> (and <strong>chapter</strong>, for the OT) and press{' '}
              <strong>Load</strong>.
            </li>
            <li>
              Tick any number of sentences, then press <strong>Open</strong> to diagram them together
              as one passage — the published gold-standard parse, ready to edit.
            </li>
          </ol>
          <p>
            Only Philippians ships with the app; other GNT books and all OT chapters download on
            first use. <strong>Save offline</strong> keeps the current one for later, and an opened
            passage is cached automatically.
          </p>

          <h3>Read the diagram</h3>
          <ul className="guide-list">
            <li>
              <strong>Pan</strong> by dragging, <strong>zoom</strong> with the wheel or a pinch, and{' '}
              <strong>⤢ Fit</strong> recentres it. Greek reads left-to-right; Hebrew is drawn
              right-to-left.
            </li>
            <li>
              <strong>Tap a word</strong> (or a line) to see its part of speech, role, and full
              parsing in a popover.
            </li>
            <li>
              For the GNT you can switch the source strip between <strong>Greek</strong> and{' '}
              <strong>English</strong> (Berean Standard Bible); hovering a word highlights its
              translation in lock-step.
            </li>
            <li>
              Use <strong>◀ / ▶</strong> in the source bar to step through the passage sentence by
              sentence, and the <strong>↕</strong> controls to loosen or tighten row spacing.
            </li>
          </ul>

          <h3>Save &amp; share</h3>
          <p>
            <strong>Export</strong> (top bar) saves the diagram as SVG, PNG, JSON, or a printable
            page. Your work autosaves locally, and notes you add to a passage are restored when you
            reopen it.
          </p>
        </div>
      </div>
    </div>
  );
}
