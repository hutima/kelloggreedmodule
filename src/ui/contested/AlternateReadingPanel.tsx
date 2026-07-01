import { useMemo } from 'react';
import { useEditorStore } from '@/state';
import { type AlternateSourceType, isEmptySyntaxPatch } from '@/domain/schema';
import { diffDocuments, hashBase } from '@/domain/patch';
import {
  getIssuesForPassage,
  getIssueById,
  getReadingById,
  getAlternateReadings,
  diffBaseAndAlternate,
  alignedDiff,
  canAdoptAlternateReading,
  isMergeIssue,
} from '@/domain/contested';
import { ReadingChoiceControl } from './ReadingChoiceControl';

/**
 * Shared body of the alternate-readings panel — used by the desktop drawer and
 * the mobile sheet. It explains the issue, lets the user pick a reading (Base or
 * an alternate, previewed not saved), shows what differs, and — for a structural
 * alternate — offers "Use this parse as my custom reading" (promotes the preview
 * to the saved patch) on both desktop and mobile. Copy stays neutral: "the base
 * tree shows", "this alternate reads".
 */
const TYPE_LABEL: Record<AlternateSourceType, string> = {
  'review-only': 'Review only',
  'semantic-only': 'Semantic',
  'syntax-only': 'Syntax',
  'punctuation-only': 'Punctuation',
  'textual-variant': 'Textual variant',
  'passage-inclusion': 'Passage',
};

export function AlternateReadingPanel({ variant }: { variant: 'mobile' | 'desktop' }) {
  const liveDoc = useEditorStore((s) => s.doc);
  const pristine = useEditorStore((s) => s.baseDoc);
  const baseDoc = pristine ?? liveDoc;
  // For a cross-boundary issue the affected ids / overlay are authored against the
  // COMBINED document, so resolve affected words and the diff against that.
  const contestedBase = useEditorStore((s) => s.contestedBaseDoc) ?? baseDoc;
  const previewDoc = useEditorStore((s) => s.previewDoc);
  const selectedIssueId = useEditorStore((s) => s.contested.selectedContestedIssueId);
  const previewReadingId = useEditorStore((s) => s.contested.previewAlternateReadingId);
  const displayMode = useEditorStore((s) => s.contested.alternateDisplayMode);
  const selectContestedIssue = useEditorStore((s) => s.selectContestedIssue);
  const setDisplayMode = useEditorStore((s) => s.setAlternateDisplayMode);
  const adopt = useEditorStore((s) => s.adoptContestedReading);
  const returnToBase = useEditorStore((s) => s.returnToBaseReading);
  const restoreBase = useEditorStore((s) => s.restoreBaseParse);
  const deleteVariant = useEditorStore((s) => s.deleteImportedVariant);
  const promoteToBase = useEditorStore((s) => s.promoteReadingToBase);
  const preferAppDiff = useEditorStore((s) => s.preferAppDiff);
  const setPreferAppDiff = useEditorStore((s) => s.setPreferAppDiff);

  // The live doc has diverged from the pristine base → a custom/adopted parse is
  // in effect, so offer to restore the original tree.
  const hasCustomParse = useMemo(() => {
    if (!pristine || pristine === liveDoc) return false;
    const patch = diffDocuments(
      pristine,
      liveDoc,
      { corpus: 'custom', passageId: pristine.id, baseHash: hashBase(pristine) },
      liveDoc.updatedAt,
    );
    return !isEmptySyntaxPatch(patch);
  }, [pristine, liveDoc]);

  const issues = getIssuesForPassage(baseDoc);
  const issue = (selectedIssueId && getIssueById(selectedIssueId)) || issues[0];

  const greek = baseDoc.language === 'grc';
  const hebrew = baseDoc.language === 'hbo';
  const semitic = greek || hebrew;

  const affectedWords = useMemo(() => {
    if (!issue) return '';
    const byId = new Map(contestedBase.tokens.map((t) => [t.id, t.surface]));
    return issue.affectedTokenIds.map((id) => byId.get(id)).filter(Boolean).join(' ');
  }, [issue, contestedBase]);

  const previewReading = previewReadingId ? getReadingById(previewReadingId) : undefined;
  // A full-doc (imported) variant is diffed by surface alignment; a curated
  // overlay shares base ids and is diffed by id. `unmatched` drives the
  // "loaded without analysis" note.
  const { diff, unmatched } = useMemo(() => {
    if (!previewReading || !previewDoc) return { diff: null, unmatched: false };
    if (previewReading.fullDoc) {
      const res = alignedDiff(
        contestedBase,
        previewDoc,
        preferAppDiff ? undefined : previewReading.diffWords,
      );
      return { diff: res.diff, unmatched: !res.matched };
    }
    return { diff: diffBaseAndAlternate(contestedBase, previewDoc, previewReading), unmatched: false };
  }, [previewReading, previewDoc, contestedBase, preferAppDiff]);

  if (!issue) return <p className="empty">No contested readings for this passage.</p>;
  const readings = getAlternateReadings(issue.id);

  return (
    <div className="arp">
      {issues.length > 1 && (
        <div className="arp-issues">
          {issues.map((i) => (
            <button
              key={i.id}
              className={`chip${i.id === issue.id ? ' active' : ''}`}
              onClick={() => selectContestedIssue(i.id)}
            >
              {i.shortLabel ?? i.label}
            </button>
          ))}
        </div>
      )}

      <div className="arp-head">
        <span className={`arp-type type-${issue.sourceType}`}>{TYPE_LABEL[issue.sourceType]}</span>
        <span className="arp-ref">{issue.verseRef}</span>
      </div>
      <h3 className="arp-title">{issue.label}</h3>
      {affectedWords && (
        <p className="arp-affected">
          Affected words: <span className={semitic ? (hebrew ? 'hebrew' : 'greek') : undefined}>{affectedWords}</span>
        </p>
      )}
      <p className="arp-summary">{issue.summary}</p>

      <div className="arp-base">
        <span className="arp-base-label">The base tree shows</span>
        <strong>{issue.defaultReading.label}</strong>
        <p>{issue.defaultReading.description}</p>
      </div>

      {hasCustomParse && (
        <div className="arp-custom">
          <span className="arp-custom-note">A custom parse is saved for this passage.</span>
          <button className="btn" onClick={() => restoreBase()} title="Discard the custom parse and restore the base tree">
            Restore base parse
          </button>
        </div>
      )}

      {readings.length > 0 ? (
        <>
          <ReadingChoiceControl issue={issue} variant={variant} />

          {previewReading ? (
            <div className="arp-reading">
              <p className="arp-reading-interp">{previewReading.interpretation}</p>
              <p className="arp-reading-desc">{previewReading.description}</p>
              {unmatched && (
                <p className="arp-variant-note">
                  Variant could not be matched to the base — shown without difference analysis. You
                  can still switch between the base and this reading.
                </p>
              )}
              {diff?.summary?.length ? (
                <ul className="arp-diff">
                  {diff.summary.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              ) : null}
              {previewReading.fullDoc && (
                <label className="check-row" title="Ignore any LLM-supplied difference words and let the app detect differences by aligning lexemes">
                  <input
                    type="checkbox"
                    checked={preferAppDiff}
                    onChange={(e) => setPreferAppDiff(e.target.checked)}
                  />
                  <span>Detect differences in-app (ignore LLM&apos;s)</span>
                </label>
              )}
              {previewReading.textualVariant && (
                <div className="arp-variant-warn">
                  ⚠ Textual variant — depends on a different wording.
                  {previewReading.textualVariant.greekText && (
                    <div className={`arp-variant-text${greek ? ' greek' : ''}${hebrew ? ' hebrew' : ''}`}>
                      {previewReading.textualVariant.greekText}
                    </div>
                  )}
                  {previewReading.textualVariant.note && (
                    <div className="arp-variant-note">{previewReading.textualVariant.note}</div>
                  )}
                </div>
              )}

              {/* Desktop: choose how to display the alternate — replace the one
                  frame, or open a second frame alongside the base. Only shown
                  while an alternate is being previewed. */}
              {variant === 'desktop' && (
                <div className="arp-display" role="group" aria-label="Display alternate as">
                  <span className="arp-display-label">Show as</span>
                  <div className="reading-choice">
                    <button
                      type="button"
                      className={`reading-choice-opt${displayMode !== 'side-by-side' ? ' active' : ''}`}
                      onClick={() => setDisplayMode('single-preview')}
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      className={`reading-choice-opt${displayMode === 'side-by-side' ? ' active' : ''}`}
                      onClick={() => setDisplayMode('side-by-side')}
                    >
                      Second frame
                    </button>
                  </div>
                </div>
              )}

              <div className="arp-actions">
                <button className="btn" onClick={() => returnToBase()}>
                  Return to base
                </button>
                {previewReading.origin === 'user' && previewReading.fullDoc && (
                  <button
                    className="btn"
                    title="Make this reading the base parse — the outgoing base becomes a reading, and every reading then compares against this one"
                    onClick={() => promoteToBase(previewReading.id)}
                  >
                    Make this the base
                  </button>
                )}
                {previewReading.origin === 'user' && (
                  <button
                    className="btn danger"
                    title="Remove this imported reading"
                    onClick={() => {
                      if (
                        typeof window === 'undefined' ||
                        window.confirm('Delete this imported reading?')
                      ) {
                        deleteVariant(previewReading.id);
                      }
                    }}
                  >
                    Delete reading
                  </button>
                )}
                {canAdoptAlternateReading(previewReading) && !isMergeIssue(issue) && (
                  <button
                    className="btn primary"
                    title="Save this parse as your custom reading"
                    onClick={() => adopt(previewReading.id)}
                  >
                    Use this parse as my custom reading
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="hint">Pick an alternate above to preview it. Previewing does not save.</p>
          )}
        </>
      ) : (
        <p className="hint">
          {issue.pastoralNote ?? 'The base reading is one defensible parse; no alternate structure is encoded for this passage.'}
        </p>
      )}

      {issue.pastoralNote && readings.length > 0 && (
        <p className="arp-pastoral">{issue.pastoralNote}</p>
      )}
    </div>
  );
}
