import type { SermonAnchor } from '@/domain/schema';
import { useEditorStore } from '@/state';
import { HIGHLIGHT_CATEGORIES } from './highlights';

/**
 * A compact palette of highlight categories for the current selection. Tapping a
 * category toggles a highlight on the selected node/relation (or passage). Used
 * in the sermon drawer and the mobile sermon sheet.
 */
export function HighlightToolbar({ anchor }: { anchor: SermonAnchor }) {
  const highlights = useEditorStore((s) => s.sermon.highlights);
  const toggleHighlight = useEditorStore((s) => s.toggleHighlight);

  const activeFor = (cat: string) =>
    highlights.some(
      (h) =>
        h.category === cat &&
        (h.anchor.nodeId ?? '') === (anchor.nodeId ?? '') &&
        (h.anchor.relationId ?? '') === (anchor.relationId ?? '') &&
        (h.anchor.verseRef ?? '') === (anchor.verseRef ?? ''),
    );

  return (
    <div className="highlight-toolbar" role="group" aria-label="Highlight">
      {HIGHLIGHT_CATEGORIES.map((c) => (
        <button
          key={c.id}
          className={`hl-chip${activeFor(c.id) ? ' active' : ''}`}
          style={{ ['--hl' as string]: c.color }}
          title={c.label}
          onClick={() => toggleHighlight({ anchor, category: c.id })}
        >
          <span className="hl-swatch" style={{ background: c.color }} />
          {c.label}
        </button>
      ))}
    </div>
  );
}
