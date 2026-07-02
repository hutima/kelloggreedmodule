import { useEffect, useState } from 'react';
import { useDiscourseStore, useEditorStore } from '@/state';
import { VisualizationSwitcher } from '@/ui/shell/VisualizationSwitcher';

import { DiscourseView } from './DiscourseView';
import { DiscourseToolbar } from './DiscourseToolbar';

/**
 * DISCOURSE CANVAS — the center-column replacement for `DiagramCanvas` while
 * the Discourse visualization is active. Deliberately shares NOTHING with the
 * syntax canvas: no syntax layout, no gloss/colour/orientation toggles, no
 * contested previews — only discourse concerns. The visualization switcher in
 * the header is the way back to the syntax lenses (which return exactly as
 * they were; neither store reloads on a mode switch).
 */
export function DiscourseCanvas() {
  const appMode = useEditorStore((s) => s.appMode);
  const doc = useDiscourseStore((s) => s.doc);
  const status = useDiscourseStore((s) => s.status);
  const error = useDiscourseStore((s) => s.error);
  const view = useDiscourseStore((s) => s.view);
  const setView = useDiscourseStore((s) => s.setView);
  const collapseAll = useDiscourseStore((s) => s.collapseAll);
  const restoreLastRange = useDiscourseStore((s) => s.restoreLastRange);
  const setLeftCollapsed = useEditorStore((s) => s.setLeftCollapsed);
  const [infoOpen, setInfoOpen] = useState(false);

  // Entering Discourse mode restores the previously loaded range (from the
  // stored pointer) exactly once; an already-loaded document stays put.
  useEffect(() => {
    void restoreLastRange();
  }, [restoreLastRange]);

  const hasContainers = doc?.units.some((u) => doc.units.some((c) => c.parentId === u.id)) ?? false;

  return (
    <div className="canvas discourse-canvas">
      <div className="panel-head">
        <button
          type="button"
          className="diagram-guide-btn"
          aria-label="About discourse mode"
          title="About discourse mode"
          onClick={() => setInfoOpen((v) => !v)}
        >
          ⓘ
        </button>
        <span className="panel-head-title">Discourse</span>
        <div className="canvas-tools">
          <VisualizationSwitcher compact />
          {doc && (
            <>
              <div className="lang-toggle" role="group" aria-label="Text shown">
                <button
                  className={view.showSourceText && !view.showEnglish ? 'active' : ''}
                  title="Show the source text"
                  onClick={() => setView({ showSourceText: true, showEnglish: false })}
                >
                  Ελ
                </button>
                <button
                  className={view.showEnglish && !view.showSourceText ? 'active' : ''}
                  title="Show English glosses"
                  onClick={() => setView({ showSourceText: false, showEnglish: true })}
                >
                  Eng
                </button>
                <button
                  className={view.showSourceText && view.showEnglish ? 'active' : ''}
                  title="Show both"
                  onClick={() => setView({ showSourceText: true, showEnglish: true })}
                >
                  Both
                </button>
              </div>
              <div className="lang-toggle" role="group" aria-label="Overlays">
                <button
                  className={view.showMarkers ? 'active' : ''}
                  aria-pressed={view.showMarkers}
                  title="Show discourse-marker hint chips (γάρ, οὖν, δέ…)"
                  onClick={() => setView({ showMarkers: !view.showMarkers })}
                >
                  Markers
                </button>
                <button
                  className={view.showRelations ? 'active' : ''}
                  aria-pressed={view.showRelations}
                  title="Show relation arcs/brackets"
                  onClick={() => setView({ showRelations: !view.showRelations })}
                >
                  Arcs
                </button>
                <button
                  className={view.showLabels ? 'active' : ''}
                  aria-pressed={view.showLabels}
                  title="Show unit labels"
                  onClick={() => setView({ showLabels: !view.showLabels })}
                >
                  Labels
                </button>
              </div>
              <div className="lang-toggle" role="group" aria-label="Density">
                <button
                  className={!view.compact ? 'active' : ''}
                  aria-pressed={!view.compact}
                  title="Full text blocks"
                  onClick={() => setView({ compact: false })}
                >
                  Full
                </button>
                <button
                  className={view.compact ? 'active' : ''}
                  aria-pressed={view.compact}
                  title="Compact rows (clamped text)"
                  onClick={() => setView({ compact: true })}
                >
                  Compact
                </button>
              </div>
              {hasContainers && (
                <div className="lang-toggle" role="group" aria-label="Collapse">
                  <button title="Collapse all groups" onClick={() => collapseAll(true)}>
                    Collapse all
                  </button>
                  <button title="Expand all groups" onClick={() => collapseAll(false)}>
                    Expand all
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {infoOpen && (
        <div className="discourse-info" role="note">
          <p>
            <strong>Discourse mode</strong> is an interpretive outline and relationship
            layer over the passage. Source data may suggest markers and boundaries,
            but user-authored structure is <em>your</em> analysis — marker chips are
            hints from the text's particles, never conclusions.
          </p>
          <button className="mini" onClick={() => setInfoOpen(false)}>
            Got it
          </button>
        </div>
      )}

      {doc && appMode === 'edit' && <DiscourseToolbar />}

      {doc ? (
        <>
          <div className="discourse-title-row">
            <h2 className="discourse-title">{doc.title}</h2>
            <span className="discourse-title-meta">
              {doc.units.filter((u) => u.tokenIds.length > 0).length} units ·{' '}
              {doc.sourceId === 'opentext' ? 'OpenText' : doc.editionId === 'sblgnt' ? 'SBLGNT' : 'Nestle 1904'}
            </span>
          </div>
          <DiscourseView doc={doc} editing={appMode === 'edit'} />
        </>
      ) : (
        <div className="discourse-empty">
          {status === 'loading' ? (
            <p>Loading range…</p>
          ) : (
            <>
              <p>
                <strong>Choose a discourse range to begin.</strong>
              </p>
              <p className="muted">
                Pick a book and verse range in the panel on the left — a section
                (Ephesians 5:3–33), a sweep of chapters (Romans 9–11), or a whole
                book (Philemon). Your open syntax passage stays loaded; switch back
                any time.
              </p>
              {error && <p className="discourse-error">{error}</p>}
              {appMode !== 'edit' && (
                <button className="mini accept" onClick={() => setLeftCollapsed(false)}>
                  Open the range selector
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
