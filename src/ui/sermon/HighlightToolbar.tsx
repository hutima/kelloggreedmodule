import type { SermonAnchor } from '@/domain/schema';
import { useEditorStore } from '@/state';
import { HIGHLIGHT_CATEGORIES } from './highlights';

type Category = (typeof HIGHLIGHT_CATEGORIES)[number];

/**
 * A compact palette of highlight categories for the current selection. Tapping a
 * category toggles a highlight on the selected node/relation (or passage). Used
 * in the study drawer and the tapped-word detail card. `categories` defaults to
 * the full set; callers (e.g. the phone detail card) can pass a shorter list.
 */
export function HighlightToolbar({
  anchor,
  categories = HIGHLIGHT_CATEGORIES,
}: {
  anchor: SermonAnchor;
  categories?: Category[];
}) {
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
      {categories.map((c) => (
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
