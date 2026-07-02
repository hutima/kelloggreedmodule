import { useMemo, useState } from 'react';
import { useDiscourseStore, useEditorStore } from '@/state';
import type { DiscourseSuggestion } from '@/domain/schema';
import { formatRange } from '@/domain/discourse';

/**
 * SUGGESTIONS PANEL — non-authoritative discourse hints (possible markers,
 * breaks, grounds, contrasts, μέν/δέ pairs, repeated lemmas, inclusio
 * candidates). Nothing here alters the diagram by itself:
 *
 *   - ACCEPT (Edit mode) turns a hint into an ordinary editable manual
 *     relation or split — the only path from hint to structure;
 *   - DISMISS hides it (persisted, reversible via Reset edits);
 *   - ignoring it costs nothing.
 *
 * The language is always "possible / candidate" — the machine may point at
 * γάρ; it does not preach the sermon.
 */

const TYPE_LABELS: Record<DiscourseSuggestion['type'], string> = {
  possibleMarker: 'possible marker',
  possibleBreak: 'possible break',
  possibleGround: 'possible ground',
  possibleContrast: 'possible contrast',
  possibleInference: 'possible inference',
  possibleSeries: 'possible series',
  possibleParallel: 'possible parallel',
  possibleInclusio: 'possible inclusio',
  possibleChiasm: 'possible chiasm',
  repeatedLemma: 'repeated lemma',
  repeatedPhrase: 'repeated phrase',
};

export function DiscourseSuggestions() {
  const doc = useDiscourseStore((s) => s.doc);
  const select = useDiscourseStore((s) => s.select);
  const acceptSuggestion = useDiscourseStore((s) => s.acceptSuggestion);
  const rejectSuggestion = useDiscourseStore((s) => s.rejectSuggestion);
  const setSuggestionsOpen = useDiscourseStore((s) => s.setSuggestionsOpen);
  const canEdit = useEditorStore((s) => s.appMode === 'edit');
  const [showAccepted, setShowAccepted] = useState(false);

  const suggestions = useMemo(() => {
    const all = doc?.suggestions ?? [];
    const rank = { medium: 0, low: 1, high: -1 } as const;
    return [...all].sort(
      (a, b) => Number(!!a.accepted) - Number(!!b.accepted) || rank[a.confidence] - rank[b.confidence],
    );
  }, [doc?.suggestions]);

  if (!doc) return null;
  const pending = suggestions.filter((s) => !s.accepted);
  const accepted = suggestions.filter((s) => s.accepted);
  const shown = showAccepted ? suggestions : pending;

  const unitLabel = (id: string) => {
    const u = doc.units.find((x) => x.id === id);
    return u ? u.label || formatRange(u.refStart, u.refEnd) || u.kind : id;
  };

  return (
    <aside className="discourse-suggestions" aria-label="Discourse hints">
      <div className="discourse-suggestions-head">
        <strong>Hints</strong>
        <span className="discourse-note" style={{ margin: 0 }}>
          {pending.length} open{accepted.length ? ` · ${accepted.length} accepted` : ''}
        </span>
        <button className="mini" onClick={() => setSuggestionsOpen(false)} aria-label="Hide hints">
          ✕
        </button>
      </div>
      <p className="discourse-suggestions-blurb">
        Candidates from the source's particles and repetition — <em>clues, not
        conclusions</em>. Accepting one creates a normal editable relation (or
        break); nothing is applied silently.
      </p>
      {accepted.length > 0 && (
        <label className="checkbox-row" style={{ fontSize: 12 }}>
          <input type="checkbox" checked={showAccepted} onChange={(e) => setShowAccepted(e.target.checked)} />
          <span>Show accepted</span>
        </label>
      )}
      {shown.length === 0 && <p className="discourse-note">No open hints for this range.</p>}
      <ul className="discourse-suggestion-list">
        {shown.map((s) => (
          <li key={s.id} className={`discourse-suggestion${s.accepted ? ' accepted' : ''}`}>
            <div className="discourse-suggestion-head">
              <span className="discourse-suggestion-type">{TYPE_LABELS[s.type]}</span>
              <span className={`discourse-suggestion-conf conf-${s.confidence}`}>{s.confidence}</span>
              {s.label && <span className="discourse-suggestion-label greek">{s.label}</span>}
            </div>
            <p className="discourse-suggestion-expl">{s.explanation}</p>
            {s.unitIds.length > 0 && (
              <div className="discourse-suggestion-units">
                {s.unitIds.slice(0, 4).map((id) => (
                  <button key={id} className="mini" title="Select this unit" onClick={() => select({ unitId: id })}>
                    {unitLabel(id)}
                  </button>
                ))}
                {s.unitIds.length > 4 && <span className="discourse-note">+{s.unitIds.length - 4} more</span>}
              </div>
            )}
            <div className="discourse-suggestion-actions">
              {s.accepted ? (
                <span className="discourse-note" style={{ margin: 0 }}>
                  Accepted — edit or delete it like any relation.
                </span>
              ) : canEdit ? (
                <>
                  <button className="mini accept" onClick={() => acceptSuggestion(s.id)}>
                    Accept
                  </button>
                  <button className="mini" onClick={() => rejectSuggestion(s.id)}>
                    Dismiss
                  </button>
                </>
              ) : (
                <span className="discourse-note" style={{ margin: 0 }}>
                  Switch to Edit mode to accept or dismiss.
                </span>
              )}
              <span className="discourse-suggestion-prov" title={s.provenance.reason}>
                {s.provenance.source === 'inferred' ? 'source-derived hint' : s.provenance.source}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
