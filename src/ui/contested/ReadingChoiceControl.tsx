import { useEditorStore } from '@/state';
import type { ContestedSyntaxIssue } from '@/domain/schema';
import { getAlternateReadings } from '@/domain/contested';

/**
 * Pick the reading to show: the BASE parse or one of the alternates. With a
 * single alternate this is a Base/alternate segmented control; with MORE THAN ONE
 * alternate it becomes a dropdown so the pane stays compact. Selecting an
 * alternate previews it (temporary, unsaved); selecting Base returns to the
 * 1904/WLC parse.
 */
export function ReadingChoiceControl({ issue }: { issue: ContestedSyntaxIssue }) {
  const previewId = useEditorStore((s) => s.contested.previewAlternateReadingId);
  const preview = useEditorStore((s) => s.previewAlternateReading);
  const returnToBase = useEditorStore((s) => s.returnToBaseReading);
  const readings = getAlternateReadings(issue.id);

  // Multiple alternates → dropdown.
  if (readings.length > 1) {
    return (
      <label className="reading-choice-select">
        <span className="sr-only">Choose reading</span>
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
