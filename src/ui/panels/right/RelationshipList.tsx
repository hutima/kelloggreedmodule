import { useMemo } from 'react';
import { useEditorStore } from '@/state';
import { getNode, nodeText } from '@/domain/model';
import { relationHighlightColors } from '@/ui/sermon/highlights';
import { HighlightToolbar } from '@/ui/sermon/HighlightToolbar';

/**
 * All relations in the analysis; click to select. A highlighted relation shows
 * its category colour, and the selected relation gets an inline highlight palette
 * so it can be highlighted right here in the Relations tab (sermon-prep data —
 * rendered as a swash along the connector line in the diagram).
 */
export function RelationshipList() {
  const doc = useEditorStore((s) => s.doc);
  const sel = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const highlights = useEditorStore((s) => s.sermon.highlights);
  const hlByRelation = useMemo(() => relationHighlightColors(highlights), [highlights]);

  if (doc.syntax.relations.length === 0) {
    return <p className="empty">No relations yet. Build structure in the Parse tab.</p>;
  }

  const name = (id: string) => {
    const n = getNode(doc.syntax, id);
    return n ? nodeText(doc, n) || n.label || n.kind : id;
  };

  return (
    <>
      <ul className="rel-list">
        {doc.syntax.relations.map((r) => {
          const hl = hlByRelation.get(r.id);
          return (
            <li
              key={r.id}
              className={sel.relationId === r.id ? 'selected' : ''}
              onClick={() => select({ relationId: r.id })}
            >
              {hl && (
                <span className="rel-hl-swatch" style={{ background: hl }} aria-hidden="true" />
              )}
              <span className={doc.language === 'grc' ? 'greek' : undefined}>
                {name(r.headId)} → {name(r.dependentId)}
              </span>
              <span className="rel-type">{r.type}</span>
            </li>
          );
        })}
      </ul>
      {sel.relationId && (
        <div className="rel-highlight">
          <span className="rel-highlight-label">Highlight this relation</span>
          <HighlightToolbar anchor={{ type: 'relation', relationId: sel.relationId }} />
        </div>
      )}
    </>
  );
}
