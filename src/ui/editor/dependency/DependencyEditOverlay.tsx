import { useEditorStore } from '@/state';
import { nodeName } from '../common';

/**
 * Dependency Basic-Edit overlay — the discoverable, stateful hint band for visual
 * linking. It makes the pending-link state unmistakable: prompt to pick a
 * dependent, then prompt to pick its head. The arc preview itself is drawn in the
 * SVG (LinkPreviewOverlay); this is the words-and-buttons half. Rendered only in
 * Dependency mode while the Link tool is active.
 */
export function DependencyEditOverlay() {
  const doc = useEditorStore((s) => s.doc);
  const appMode = useEditorStore((s) => s.appMode);
  const diagramMode = useEditorStore((s) => s.diagramMode);
  const activeEditTool = useEditorStore((s) => s.activeEditTool);
  const editTier = useEditorStore((s) => s.editTier);
  const pendingLinkStart = useEditorStore((s) => s.pendingLinkStart);
  const relationshipDraft = useEditorStore((s) => s.relationshipDraft);
  const cancelVisualLink = useEditorStore((s) => s.cancelVisualLink);

  if (
    appMode !== 'edit' ||
    editTier !== 'basic' ||
    diagramMode !== 'dependency' ||
    activeEditTool !== 'link' ||
    relationshipDraft
  ) {
    return null;
  }

  return (
    <div className="dep-link-banner">
      {pendingLinkStart ? (
        <>
          Now tap the word that <strong>{nodeName(doc, pendingLinkStart)}</strong> depends on.
          <button className="mini" onClick={cancelVisualLink}>
            Cancel
          </button>
        </>
      ) : (
        <>Tap the dependent word, then tap the word it depends on.</>
      )}
    </div>
  );
}
