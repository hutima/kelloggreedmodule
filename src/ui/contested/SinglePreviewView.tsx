import { useMemo } from 'react';
import { useEditorStore } from '@/state';
import { getReadingById, diffBaseAndAlternate } from '@/domain/contested';
import { StaticDiagramFrame } from './StaticDiagramFrame';
import { BlockOutlineFrame } from './BlockOutlineFrame';

/**
 * Single-frame alternate preview (mobile and desktop default). The one diagram
 * shows the selected alternate — temporary, never saved — with a clear status
 * pill and a one-tap return to the base. Difference highlighting is subtle.
 */
export function SinglePreviewView() {
  const baseDoc = useEditorStore((s) => s.baseDoc ?? s.doc);
  const previewDoc = useEditorStore((s) => s.previewDoc);
  const diagramMode = useEditorStore((s) => s.diagramMode);
  const readingId = useEditorStore((s) => s.contested.previewAlternateReadingId);
  const returnToBase = useEditorStore((s) => s.returnToBaseReading);

  const reading = readingId ? getReadingById(readingId) : undefined;
  const diff = useMemo(
    () => (reading && previewDoc ? diffBaseAndAlternate(baseDoc, previewDoc, reading) : null),
    [reading, previewDoc, baseDoc],
  );

  if (!previewDoc || !reading) return null;

  return (
    <div className="single-preview">
      <div className="preview-pill">
        <span className="preview-pill-dot" aria-hidden="true" />
        Previewing: <strong>{reading.shortLabel ?? reading.label}</strong>
        {reading.textualVariant && <span className="preview-pill-variant"> · textual variant</span>}
        <button className="mini" onClick={() => returnToBase()}>
          Return to base
        </button>
      </div>
      {diagramMode === 'phrase-block' ? (
        <BlockOutlineFrame
          baseDoc={baseDoc}
          variantDoc={previewDoc}
          role="variant"
          diff={diff}
          title=""
        />
      ) : (
        <StaticDiagramFrame doc={previewDoc} mode={diagramMode} diff={diff} title="" />
      )}
    </div>
  );
}
