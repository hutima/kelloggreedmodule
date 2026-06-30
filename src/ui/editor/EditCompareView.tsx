import { useMemo } from 'react';
import { useEditorStore } from '@/state';
import { glossDoc } from '@/domain/model';
import { diffDocsForCompare } from '@/domain/contested';
import { StaticDiagramFrame } from '@/ui/contested/StaticDiagramFrame';
import { BlockOutlineFrame } from '@/ui/contested/BlockOutlineFrame';
import { useLinkedDiagramView } from '@/ui/contested/useLinkedDiagramView';

/**
 * Edit-mode BEFORE / AFTER comparison: the original parse (the gold-standard
 * base) on the left, the user's current edits on the right, in the same diagram
 * mode with linked scrolling and the changed elements outlined. Reuses the
 * contested side-by-side frames; only the source documents differ (base vs the
 * live edited doc instead of base vs a saved alternate).
 */
export function EditCompareView() {
  const baseDoc = useEditorStore((s) => s.baseDoc);
  const liveDoc = useEditorStore((s) => s.doc);
  const diagramMode = useEditorStore((s) => s.diagramMode);
  const glossMode = useEditorStore((s) => s.glossMode);
  const toggle = useEditorStore((s) => s.toggleCompareToBase);

  // `baseDoc` is guaranteed non-null by the caller's render guard, but keep the
  // hooks unconditional (rules of hooks) and fall back to the live doc.
  const base = baseDoc ?? liveDoc;
  const gloss = glossMode && diagramMode !== 'morphology';
  const diff = useMemo(() => diffDocsForCompare(base, liveDoc), [base, liveDoc]);
  const baseShow = useMemo(() => (gloss ? glossDoc(base) : base), [gloss, base]);
  const liveShow = useMemo(() => (gloss ? glossDoc(liveDoc) : liveDoc), [gloss, liveDoc]);
  const { leftRef, rightRef, onLeftScroll, onRightScroll } = useLinkedDiagramView(true);

  if (!baseDoc) return null;

  return (
    <div className="variant-compare">
      <div className="variant-compare-bar">
        <span className="vc-compare-title">
          Before / after — <strong>your edits</strong> vs the original parse
        </span>
        <div className="vc-compare-actions">
          <button className="mini" onClick={() => toggle(false)} title="Close the comparison">
            Close comparison
          </button>
        </div>
      </div>
      <div className="variant-compare-frames">
        {diagramMode === 'phrase-block' ? (
          <>
            <BlockOutlineFrame
              ref={leftRef}
              baseDoc={baseShow}
              variantDoc={liveShow}
              role="base"
              diff={diff}
              title="Original parse"
              onScrollSync={onLeftScroll}
            />
            <BlockOutlineFrame
              ref={rightRef}
              baseDoc={baseShow}
              variantDoc={liveShow}
              role="variant"
              diff={diff}
              title="Your edits"
              onScrollSync={onRightScroll}
            />
          </>
        ) : (
          <>
            <StaticDiagramFrame
              ref={leftRef}
              doc={baseShow}
              mode={diagramMode}
              diff={diff}
              title="Original parse"
              onScrollSync={onLeftScroll}
            />
            <StaticDiagramFrame
              ref={rightRef}
              doc={liveShow}
              mode={diagramMode}
              diff={diff}
              title="Your edits"
              onScrollSync={onRightScroll}
            />
          </>
        )}
      </div>
    </div>
  );
}
