import { useEditorStore } from '@/state';
import type { ContestedSyntaxIssue } from '@/domain/schema';
import { getAlternateReadings } from '@/domain/contested';
import { sourceOfDoc } from '@/io';
import type { Corpus } from '@/state/types';
import type { KrDocument } from '@/domain/schema';

/**
 * The label for the "__base__" option — the source parse the sentence loaded
 * with. NOT hardcoded to "1904 / WLC": a user's own typed/imported sentence has
 * no such source, so it just reads "Base parse".
 */
function baseReadingLabel(corpus: Corpus, doc: KrDocument): string {
  if (corpus === 'gnt') return sourceOfDoc(doc) === 'opentext' ? 'Base parse (OpenText)' : 'Base parse (Nestle 1904)';
  if (corpus === 'ot') return 'Base parse (WLC)';
  return 'Base parse';
}

/**
 * Pick the reading to show: the BASE parse or one of the alternates — always a
 * labelled dropdown (on both mobile and desktop) so the choice is obvious and the
 * pane stays compact. Selecting an alternate previews it (temporary, unsaved);
 * selecting Base returns to the source parse.
 */
export function ReadingChoiceControl({
  issue,
}: {
  issue: ContestedSyntaxIssue;
  variant?: 'mobile' | 'desktop';
}) {
  const previewId = useEditorStore((s) => s.contested.previewAlternateReadingId);
  const preview = useEditorStore((s) => s.previewAlternateReading);
  const returnToBase = useEditorStore((s) => s.returnToBaseReading);
  const corpus = useEditorStore((s) => s.corpus);
  const baseDoc = useEditorStore((s) => s.baseDoc ?? s.doc);
  const readings = getAlternateReadings(issue.id);

  return (
    <label className="reading-choice-select">
      <span className="reading-choice-select-label">Reading</span>
      <select
        value={previewId ?? '__base__'}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '__base__') returnToBase();
          else preview(v);
        }}
      >
        <option value="__base__">{baseReadingLabel(corpus, baseDoc)}</option>
        {readings.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
    </label>
  );
}
