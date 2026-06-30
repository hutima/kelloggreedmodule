import { useEffect, useMemo, useState } from 'react';
import { useEditorStore } from '@/state';
import { glossDoc } from '@/domain/model';
import type { KrDocument } from '@/domain/schema';
import {
  loadSourcePassage,
  sourceOfDoc,
  sourceLabel,
  SYNTAX_SOURCES,
  type SyntaxSourceId,
} from '@/io';
import { StaticDiagramFrame } from '@/ui/contested/StaticDiagramFrame';
import { useLinkedDiagramView } from '@/ui/contested/useLinkedDiagramView';

/**
 * Desktop side-by-side comparison of TWO syntax SOURCES for the current passage:
 * the source the passage is open from on the left, a second selectable source on
 * the right, in the SAME diagram mode with linked scrolling. The right pane's
 * parse is loaded on demand (and aligned, for OpenText) and re-loads when the
 * passage or the chosen secondary source changes.
 */
export function SourceCompareView() {
  const doc = useEditorStore((s) => s.doc);
  const diagramMode = useEditorStore((s) => s.diagramMode);
  const glossMode = useEditorStore((s) => s.glossMode);
  const secondary = useEditorStore((s) => s.sourceCompare.source);
  const setCompareSource = useEditorStore((s) => s.setCompareSource);
  const toggleSourceCompare = useEditorStore((s) => s.toggleSourceCompare);

  const primary = sourceOfDoc(doc);
  const [linked, setLinked] = useState(true);
  const [state, setState] = useState<{ doc: KrDocument | null; loading: boolean; error: string | null }>(
    { doc: null, loading: true, error: null },
  );

  // Load the secondary source's parse of this passage; ignore stale results.
  useEffect(() => {
    let live = true;
    setState({ doc: null, loading: true, error: null });
    loadSourcePassage(secondary, doc)
      .then((d) => {
        if (!live) return;
        setState({
          doc: d,
          loading: false,
          error: d ? null : `${sourceLabel(secondary)} has no matching parse for ${doc.title}.`,
        });
      })
      .catch((e: unknown) => {
        if (live) setState({ doc: null, loading: false, error: (e as Error).message });
      });
    return () => {
      live = false;
    };
  }, [secondary, doc]);

  const { leftRef, rightRef, onLeftScroll, onRightScroll } = useLinkedDiagramView(linked);

  const gloss = glossMode && diagramMode !== 'morphology';
  const leftDoc = useMemo(() => (gloss ? glossDoc(doc) : doc), [gloss, doc]);
  const rightDoc = useMemo(
    () => (state.doc ? (gloss ? glossDoc(state.doc) : state.doc) : null),
    [gloss, state.doc],
  );

  // Each pane is labelled with its source AND the verses it actually spans —
  // the two sources split sentences differently, so the references can differ
  // (OpenText 1:9–10 vs the Nestle1904 1:7–10 sentence that contains it).
  const verseOf = (title: string) => title.replace(/^.*?(\d+:\d+(?:[–-]\d+)?)\s*$/, '$1');
  const leftTitle = `${sourceLabel(primary)} · ${verseOf(doc.title)}`;
  const rightTitle = state.doc
    ? `${sourceLabel(secondary)} · ${verseOf(state.doc.title)}`
    : sourceLabel(secondary);

  return (
    <div className="variant-compare">
      <div className="variant-compare-bar">
        <span className="vc-compare-title">
          Comparing sources · <strong>{doc.title}</strong>
        </span>
        <label className="field inline">
          <span>Right pane</span>
          <select value={secondary} onChange={(e) => setCompareSource(e.target.value as SyntaxSourceId)}>
            {SYNTAX_SOURCES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
                {s.id === primary ? ' (same as left)' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="vc-compare-actions">
          <label className="vc-link-toggle">
            <input type="checkbox" checked={linked} onChange={(e) => setLinked(e.target.checked)} />
            Link scrolling
          </label>
          <button className="mini" onClick={() => toggleSourceCompare(false)}>
            Close comparison
          </button>
        </div>
      </div>
      <div className="variant-compare-frames">
        <StaticDiagramFrame
          ref={leftRef}
          doc={leftDoc}
          mode={diagramMode}
          title={leftTitle}
          onScrollSync={onLeftScroll}
        />
        {rightDoc ? (
          <StaticDiagramFrame
            ref={rightRef}
            doc={rightDoc}
            mode={diagramMode}
            title={rightTitle}
            onScrollSync={onRightScroll}
          />
        ) : (
          <div className="vc-frame">
            <div className="vc-frame-head">{sourceLabel(secondary)}</div>
            <div className="vc-frame-scroll vc-frame-empty">
              {state.loading ? 'Loading…' : state.error ?? 'No comparison available.'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
