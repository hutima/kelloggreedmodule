import { useState } from 'react';
import { useEditorStore } from '@/state';
import { getIssuesForPassage, getAlternateReadings } from '@/domain/contested';
import { ReadingChoiceControl } from './ReadingChoiceControl';

/**
 * Mobile-only contested control. The small panel-head badge is easy to miss on a
 * phone, so when the passage has contested data we show a full-width bar: a clear
 * "Alternate parses" button that TOGGLES an inline reading dropdown underneath
 * (selecting a reading previews it in the single diagram). "Details…" opens the
 * full bottom sheet for the explanation and return-to-base.
 */
export function MobileContestedBar() {
  const baseDoc = useEditorStore((s) => s.baseDoc ?? s.doc);
  const selectedIssueId = useEditorStore((s) => s.contested.selectedContestedIssueId);
  const previewId = useEditorStore((s) => s.contested.previewAlternateReadingId);
  const selectIssue = useEditorStore((s) => s.selectContestedIssue);
  const openPanel = useEditorStore((s) => s.openContestedPanel);
  const [open, setOpen] = useState(false);

  const issues = getIssuesForPassage(baseDoc);
  if (!issues.length) return null;
  const issue = issues.find((i) => i.id === selectedIssueId) ?? issues[0]!;
  const readings = getAlternateReadings(issue.id);

  return (
    <div className={`mcb${open ? ' open' : ''}`}>
      <button
        type="button"
        className="mcb-toggle"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          if (!selectedIssueId) selectIssue(issue.id);
        }}
      >
        <span className="mcb-dot" aria-hidden="true" />
        <span className="mcb-label">
          Alternate parses{issues.length > 1 ? ` (${issues.length})` : ''}
          {previewId ? ' · previewing' : ''}
        </span>
        <span className="mcb-chev" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>

      {open && (
        <div className="mcb-body">
          {issues.length > 1 && (
            <select
              className="mcb-issue"
              value={issue.id}
              onChange={(e) => selectIssue(e.target.value)}
            >
              {issues.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.verseRef} — {i.shortLabel ?? i.label}
                </option>
              ))}
            </select>
          )}
          <div className="mcb-issue-title">{issue.shortLabel ?? issue.label}</div>
          {readings.length > 0 ? (
            <ReadingChoiceControl issue={issue} variant="mobile" />
          ) : (
            <span className="hint">Review only — no alternate structure is encoded.</span>
          )}
          <button className="link-btn mcb-details" onClick={() => openPanel(issue.id)}>
            Details &amp; explanation…
          </button>
        </div>
      )}
    </div>
  );
}
