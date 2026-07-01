import { useMemo } from 'react';
import { useEditorStore } from '@/state';
import { glossDoc } from '@/domain/model';
import { getReadingById, diffBaseAndAlternate, alignedDiff } from '@/domain/contested';
import { StaticDiagramFrame } from './StaticDiagramFrame';
import { BlockOutlineFrame } from './BlockOutlineFrame';

/**
 * Single-frame alternate preview (mobile and desktop default). The one diagram
 * shows the selected alternate — temporary, never saved — with a clear status
 * pill and a one-tap return to the base. Difference highlighting is subtle.
 */
export function SinglePreviewView() {
  // For a cross-boundary issue the base is the COMBINED document (the spanned
  // sentences merged) so the diff against the overlay lines up; otherwise the
  // single-sentence base.
  const baseDoc = useEditorStore((s) => s.contestedBaseDoc ?? s.baseDoc ?? s.doc);
  const previewDoc = useEditorStore((s) => s.previewDoc);
  const diagramMode = useEditorStore((s) => s.diagramMode);
  const glossMode = useEditorStore((s) => s.glossMode);
  const readingId = useEditorStore((s) => s.contested.previewAlternateReadingId);
  const returnToBase = useEditorStore((s) => s.returnToBaseReading);
  const preferAppDiff = useEditorStore((s) => s.preferAppDiff);

  const reading = readingId ? getReadingById(readingId) : undefined;
  const diff = useMemo(() => {
    if (!reading || !previewDoc) return null;
    // A full-doc (imported) variant has its own ids — align by surface. Otherwise
    // the curated overlay shares base ids, so diff by id.
    if (reading.fullDoc) {
      const res = alignedDiff(baseDoc, previewDoc, preferAppDiff ? undefined : reading.diffWords);
      return res.matched ? res.diff : null; // unmatched → show the variant without highlighting
    }
    return diffBaseAndAlternate(baseDoc, previewDoc, reading);
  }, [reading, previewDoc, baseDoc, preferAppDiff]);

  const gloss = glossMode && diagramMode !== 'morphology';
  const baseShow = useMemo(() => (gloss ? glossDoc(baseDoc) : baseDoc), [gloss, baseDoc]);
  const variantShow = useMemo(
    () => (gloss && previewDoc ? glossDoc(previewDoc) : previewDoc),
    [gloss, previewDoc],
  );

  if (!previewDoc || !reading || !variantShow) return null;

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
          baseDoc={baseShow}
          variantDoc={variantShow}
          role="variant"
          diff={diff}
          title=""
        />
      ) : (
        <StaticDiagramFrame doc={variantShow} mode={diagramMode} diff={diff} title="" />
      )}
    </div>
  );
}
