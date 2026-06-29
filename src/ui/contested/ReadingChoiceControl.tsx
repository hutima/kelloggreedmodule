import { useEditorStore } from '@/state';
import type { ContestedSyntaxIssue } from '@/domain/schema';
import { getAlternateReadings } from '@/domain/contested';

/**
 * Pick the reading to show: the BASE parse or one of the alternates. On MOBILE
 * (or whenever there is more than one alternate) this is a labelled dropdown so
 * the choice is obvious in a cramped sheet; with a single alternate on desktop it
 * is a compact Base/alternate segmented control. Selecting an alternate previews
 * it (temporary, unsaved); selecting Base returns to the 1904/WLC parse.
 */
export function ReadingChoiceControl({
  issue,
  variant = 'desktop',
}: {
  issue: ContestedSyntaxIssue;
  variant?: 'mobile' | 'desktop';
}) {
  const previewId = useEditorStore((s) => s.contested.previewAlternateReadingId);
  const preview = useEditorStore((s) => s.previewAlternateReading);
  const returnToBase = useEditorStore((s) => s.returnToBaseReading);
  const readings = getAlternateReadings(issue.id);

  if (variant === 'mobile' || readings.length > 1) {
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

  return (
    <div className="reading-choice" role="group" aria-label="Choose reading">
      <button
        type="button"
        className={`reading-choice-opt${!previewId ? ' active' : ''}`}
        onClick={() => returnToBase()}
      >
        Base
      </button>
      {readings.map((r, i) => (
        <button
          key={r.id}
          type="button"
          className={`reading-choice-opt${previewId === r.id ? ' active' : ''}`}
          title={r.label}
          onClick={() => preview(r.id)}
        >
          {r.shortLabel ?? `Alt ${i + 1}`}
        </button>
      ))}
    </div>
  );
}
