import { useEditorStore } from '@/state';

/**
 * Informational-only notice for the CURRENT multi-sentence selection: flags
 * that one of the included sentences carries a debated syntactic/textual
 * reading, even though the combined view can't be edited/adopted directly —
 * contested data is authored against individual sentence ids, which the
 * combined document's own synthetic id never matches. Tapping it reopens the
 * sources drawer so the reader can pick that sentence out on its own, where
 * the normal badge/bar and full adopt flow are available.
 */
export function MultiSentenceContestedNotice({ mobile = false }: { mobile?: boolean }) {
  const issues = useEditorStore((s) => s.multiSentenceContested);
  const setLeftCollapsed = useEditorStore((s) => s.setLeftCollapsed);
  if (!issues.length) return null;

  const refs = Array.from(new Set(issues.map((i) => i.verseRef)));
  const label =
    issues.length > 1
      ? `${issues.length} included sentences have a debated reading`
      : '1 included sentence has a debated reading';
  const title = `${refs.join(', ')} — open that sentence on its own to review or adopt an alternate reading`;

  if (mobile) {
    return (
      <div className="mcb multi-contested-notice">
        <button type="button" className="mcb-toggle" title={title} onClick={() => setLeftCollapsed(false)}>
          <span className="mcb-dot" aria-hidden="true" />
          <span className="mcb-label">{label}</span>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="contested-badge multi-contested-notice"
      title={title}
      onClick={() => setLeftCollapsed(false)}
    >
      <span className="contested-badge-dot" aria-hidden="true" />
      {label}
    </button>
  );
}
