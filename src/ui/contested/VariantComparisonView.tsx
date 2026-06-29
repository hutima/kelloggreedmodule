import { useMemo } from 'react';
import { useEditorStore } from '@/state';
import { getReadingById, diffBaseAndAlternate } from '@/domain/contested';
import { StaticDiagramFrame } from './StaticDiagramFrame';
import { DifferenceLegend } from './DifferenceLegend';
import { useLinkedDiagramView } from './useLinkedDiagramView';

/**
 * Desktop side-by-side comparison: the base 1904/WLC parse on the left, the
 * selected alternate on the right, in the SAME diagram mode, with linked
 * scrolling and subtle difference highlighting. Only the changed elements are
 * outlined — never the whole passage.
 */
export function VariantComparisonView() {
  const baseDoc = useEditorStore((s) => s.baseDoc ?? s.doc);
  const previewDoc = useEditorStore((s) => s.previewDoc);
  const diagramMode = useEditorStore((s) => s.diagramMode);
  const linked = useEditorStore((s) => s.contested.linkedScrolling);
  const setLinked = useEditorStore((s) => s.setLinkedScrolling);
  const readingId = useEditorStore(
    (s) => s.contested.previewAlternateReadingId ?? s.contested.selectedAlternateReadingId,
  );

  const reading = readingId ? getReadingById(readingId) : undefined;
  const diff = useMemo(
    () => (reading && previewDoc ? diffBaseAndAlternate(baseDoc, previewDoc, reading) : null),
    [reading, previewDoc, baseDoc],
  );

  const { leftRef, rightRef, onLeftScroll, onRightScroll } = useLinkedDiagramView(linked);

  if (!previewDoc || !reading) return null;

  return (
    <div className="variant-compare">
      <div className="variant-compare-bar">
        <DifferenceLegend />
        <label className="vc-link-toggle">
          <input type="checkbox" checked={linked} onChange={(e) => setLinked(e.target.checked)} />
          Link scrolling
        </label>
      </div>
      <div className="variant-compare-frames">
        <StaticDiagramFrame
          ref={leftRef}
          doc={baseDoc}
          mode={diagramMode}
          title="Base 1904 parse"
          onScrollSync={onLeftScroll}
        />
        <StaticDiagramFrame
          ref={rightRef}
          doc={previewDoc}
          mode={diagramMode}
          diff={diff}
          title={`Alternate: ${reading.shortLabel ?? reading.label}`}
          onScrollSync={onRightScroll}
        />
      </div>
    </div>
  );
}
