import { useEffect } from 'react';

/** "About the author" + data‑source attribution dialog (opened from the top bar). */
export function AboutModal({ onClose }: { onClose: () => void }) {
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
        aria-label="About"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>About &amp; contact</h2>
          <button className="modal-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="about-body">
          <h3>Contact the author</h3>
          <p>
            This app is maintained by <strong>Timothy Hutama</strong>, an MTS student at Wycliffe
            College. It was originally prepared for the 2026 Summer Intensive. The author makes no
            guarantees about the content but has made a best attempt to make sure everything is
            accurate.
          </p>
          <p>
            Timothy blogs at{' '}
            <a href="https://definedfaith.wordpress.com" target="_blank" rel="noopener noreferrer">
              definedfaith.wordpress.com
            </a>
            .
          </p>
          <p>If you have comments or issues, please reach out on LinkedIn.</p>

          <p className="about-label">Other projects by Timothy:</p>
          <ul className="about-links">
            <li>
              Greek vocabulary and parsing:{' '}
              <a href="https://hutima.github.io/duff_study_tool/" target="_blank" rel="noopener noreferrer">
                duff_study_tool
              </a>
            </li>
            <li>
              Bible &amp; catechism memorization:{' '}
              <a href="https://hutima.github.io/Lectio-Memorization/" target="_blank" rel="noopener noreferrer">
                Lectio-Memorization
              </a>
            </li>
            <li>
              PCA ordination study:{' '}
              <a href="https://hutima.github.io/PCA_Ordination_Study/" target="_blank" rel="noopener noreferrer">
                PCA_Ordination_Study
              </a>
            </li>
          </ul>

          <p>
            If you’d like to buy me a coffee as thanks, you can send me a gift via e‑transfer to{' '}
            <a href="mailto:t.hutama@queensu.ca">t.hutama@queensu.ca</a> or Venmo at{' '}
            <strong>@hutima</strong>.
          </p>

          <h3>Sources &amp; attribution</h3>
          <ul className="about-sources">
            <li>
              <strong>Greek New Testament</strong> — Nestle 1904 “Lowfat” syntax trees, from
              biblicalhumanities / Clear‑Bible{' '}
              <a href="https://github.com/biblicalhumanities/greek-new-testament" target="_blank" rel="noopener noreferrer">
                macula‑greek
              </a>{' '}
              (CC BY‑SA 4.0).
            </li>
            <li>
              <strong>English parallel text</strong> — the{' '}
              <a href="https://berean.bible" target="_blank" rel="noopener noreferrer">
                Berean Standard Bible
              </a>{' '}
              (public domain), word‑aligned to the Greek by Clear‑Bible{' '}
              <a href="https://github.com/Clear-Bible/Alignments" target="_blank" rel="noopener noreferrer">
                Alignments
              </a>{' '}
              (CC BY 4.0).
            </li>
            <li>
              <strong>Polytonic Greek fonts</strong> — Gentium Plus, Cardo, New Athena Unicode, and
              GFS Didot (open / SIL OFL licences).
            </li>
            <li>
              <strong>Diagram conventions</strong> — the traditional Reed‑Kellogg (Kellogg‑Reed)
              sentence‑diagramming system.
            </li>
          </ul>
          <p className="about-foot">
            Scripture data is used under the licences above; this application is an independent study
            aid and is not affiliated with the source projects.
          </p>
        </div>
      </div>
    </div>
  );
}
