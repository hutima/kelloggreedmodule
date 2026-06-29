import { useEditorStore } from '@/state';
import { getIssuesForPassage } from '@/domain/contested';

/**
 * The discreet badge shown ONLY when the current passage carries contested
 * data. Tapping it opens the alternate-readings panel/sheet. The label leans on
 * "reading", never "error" — a debated passage is not a mistake.
 */
export function ContestedBadge() {
  const baseDoc = useEditorStore((s) => s.baseDoc ?? s.doc);
  const openContestedPanel = useEditorStore((s) => s.openContestedPanel);
  const panelOpen = useEditorStore((s) => s.contested.showAlternateParsePanel);

  const issues = getIssuesForPassage(baseDoc);
  if (!issues.length) return null;

  const hasAlternates = issues.some((i) => i.alternateReadingIds.length > 0);
  const label = hasAlternates ? 'Alternate parses' : 'Review syntax';

  return (
    <button
      type="button"
      className={`contested-badge${panelOpen ? ' active' : ''}`}
      title="This passage has a debated syntactic or textual decision"
      aria-pressed={panelOpen}
      onClick={() => openContestedPanel(issues[0]!.id)}
    >
      <span className="contested-badge-dot" aria-hidden="true" />
      {label}
      {issues.length > 1 && <span className="contested-badge-count">{issues.length}</span>}
    </button>
  );
}
