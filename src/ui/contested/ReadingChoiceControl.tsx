import { useEditorStore } from '@/state';
import type { ContestedSyntaxIssue } from '@/domain/schema';
import { getAlternateReadings } from '@/domain/contested';

/**
 * Pick the reading to show: the BASE parse or one of the alternates — always a
 * labelled dropdown (on both mobile and desktop) so the choice is obvious and the
 * pane stays compact. Selecting an alternate previews it (temporary, unsaved);
 * selecting Base returns to the 1904/WLC parse.
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
        <option value="__base__">Base parse (1904 / WLC)</option>
        {readings.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
    </label>
  );
}
