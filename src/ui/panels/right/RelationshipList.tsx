import { useEditorStore } from '@/state';
import { getNode, nodeText } from '@/domain/model';

/** All relations in the analysis; click to select and edit in the inspector. */
export function RelationshipList() {
  const doc = useEditorStore((s) => s.doc);
  const sel = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);

  if (doc.syntax.relations.length === 0) {
    return <p className="empty">No relations yet. Build structure in the Parse tab.</p>;
  }

  const name = (id: string) => {
    const n = getNode(doc.syntax, id);
    return n ? nodeText(doc, n) || n.label || n.kind : id;
  };

  return (
    <ul className="rel-list">
      {doc.syntax.relations.map((r) => (
        <li
          key={r.id}
          className={sel.relationId === r.id ? 'selected' : ''}
          onClick={() => select({ relationId: r.id })}
        >
          <span className={doc.language === 'grc' ? 'greek' : undefined}>
            {name(r.headId)} → {name(r.dependentId)}
          </span>
          <span className="rel-type">{r.type}</span>
        </li>
      ))}
    </ul>
  );
}
