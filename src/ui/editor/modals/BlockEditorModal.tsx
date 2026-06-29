import { useMemo } from 'react';
import type { ClauseType, SyntacticRole } from '@/domain/schema';
import { useEditorStore } from '@/state';
import {
  getNode,
  parentRelations,
  childRelations,
  descendantIds,
  nodeText,
} from '@/domain/model';
import { Modal } from '@/ui/components/common/Modal';
import { selectableNodes } from '../common';

const CLAUSE_TYPES: { id: ClauseType; label: string }[] = [
  { id: 'independent', label: 'Main clause' },
  { id: 'adverbial', label: 'Subordinate (adverbial)' },
  { id: 'relative', label: 'Relative clause' },
  { id: 'complement', label: 'Complement clause' },
  { id: 'participial', label: 'Participial' },
  { id: 'infinitival', label: 'Infinitival' },
  { id: 'coordinate', label: 'Coordinated' },
];

const PHRASE_ROLES: { id: SyntacticRole; label: string }[] = [
  { id: 'prepositionalPhrase', label: 'Prepositional phrase' },
  { id: 'apposition', label: 'Apposition' },
  { id: 'adjectival', label: 'Adjectival' },
  { id: 'adverbial', label: 'Adverbial' },
  { id: 'genitive', label: 'Genitive' },
];

/**
 * Phrase/Block hierarchy editor: change a block's type and reparent it (move
 * under, promote, demote). Reparenting re-points the block's incoming relation
 * in the shared syntax graph, so the Kellogg-Reed and Dependency views reflect
 * the same change.
 */
export function BlockEditorModal({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const doc = useEditorStore((s) => s.doc);
  const setClauseType = useEditorStore((s) => s.setClauseType);
  const setNodeRole = useEditorStore((s) => s.setNodeRole);
  const attachNodeTo = useEditorStore((s) => s.attachNodeTo);

  const node = getNode(doc.syntax, nodeId);
  const greek = doc.language === 'grc';
  const parent = parentRelations(doc.syntax, nodeId)[0];
  const grand = parent ? parentRelations(doc.syntax, parent.headId)[0] : undefined;

  const order = useMemo(() => {
    const idx = new Map(doc.tokens.map((t) => [t.id, t.index]));
    const min = (id: string): number => {
      const n = getNode(doc.syntax, id);
      if (!n) return Infinity;
      const own = n.tokenIds.length ? Math.min(...n.tokenIds.map((t) => idx.get(t) ?? Infinity)) : Infinity;
      const kids = childRelations(doc.syntax, id).map((r) => min(r.dependentId));
      return Math.min(own, ...kids);
    };
    return min;
  }, [doc]);

  const prevSibling = useMemo(() => {
    if (!parent) return undefined;
    const sibs = childRelations(doc.syntax, parent.headId)
      .map((r) => r.dependentId)
      .filter((id) => id !== nodeId)
      .map((id) => ({ id, o: order(id) }))
      .filter((s) => s.o < order(nodeId))
      .sort((a, b) => b.o - a.o);
    return sibs[0]?.id;
  }, [doc, parent, nodeId, order]);

  const moveTargets = useMemo(() => {
    const banned = new Set([nodeId, ...descendantIds(doc.syntax, nodeId)]);
    return selectableNodes(doc).filter((n) => !banned.has(n.id) && n.id !== parent?.headId);
  }, [doc, nodeId, parent]);

  if (!node) return null;
  const word = nodeText(doc, node) || node.label || node.kind;
  const keepType: SyntacticRole = parent?.type ?? 'adjunct';

  return (
    <Modal
      title="Edit block"
      onClose={onClose}
      footer={
        <div className="modal-buttons">
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      }
    >
      <p className="rb-target">
        <span className={greek ? 'greek' : undefined}>{word}</span>
      </p>

      <div className="rb-step">
        <span className="rb-step-label">Block type</span>
        {node.kind === 'clause' ? (
          <div className="rb-chips">
            {CLAUSE_TYPES.map((c) => (
              <button
                key={c.id}
                className={`chip${node.clauseType === c.id ? ' active' : ''}`}
                onClick={() => setClauseType(nodeId, c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="rb-chips">
            {PHRASE_ROLES.map((r) => (
              <button
                key={r.id}
                className={`chip${node.role === r.id ? ' active' : ''}`}
                onClick={() => setNodeRole(nodeId, r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rb-step">
        <span className="rb-step-label">Move</span>
        <div className="rb-chips">
          <button
            className="chip"
            disabled={!grand}
            title={grand ? 'Attach one level up' : 'Already at the top level'}
            onClick={() => grand && attachNodeTo(nodeId, grand.headId, keepType)}
          >
            ▲ Promote one level
          </button>
          <button
            className="chip"
            disabled={!prevSibling}
            title={prevSibling ? 'Nest under the previous block' : 'No previous sibling'}
            onClick={() => prevSibling && attachNodeTo(nodeId, prevSibling, keepType)}
          >
            ▼ Demote under previous
          </button>
        </div>
      </div>

      <div className="rb-step">
        <span className="rb-step-label">Move under…</span>
        <div className="rb-nodelist">
          {moveTargets.map((n) => (
            <button
              key={n.id}
              className={`rb-node${greek ? ' greek' : ''}`}
              onClick={() => attachNodeTo(nodeId, n.id, keepType)}
            >
              {n.label}
              {n.isRoot && <small> (clause)</small>}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
