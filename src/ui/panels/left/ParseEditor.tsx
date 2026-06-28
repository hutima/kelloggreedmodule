import { useState } from 'react';
import { useEditorStore } from '@/state';
import { makeId, nodeText } from '@/domain/model';
import { NODE_KIND_OPTIONS, ROLE_OPTIONS } from '@/ui/options';
import type { NodeKind, Relation, SyntacticRole, SyntaxNode } from '@/domain/schema';

/**
 * Structural editor: build the syntax graph by hand. Create nodes (optionally
 * from surface tokens), then connect them with typed relations. This is the
 * backbone of Manual Diagram Mode and of correcting an assisted parse.
 */
export function ParseEditor() {
  const doc = useEditorStore((s) => s.doc);
  const upsertNode = useEditorStore((s) => s.upsertNode);
  const removeNode = useEditorStore((s) => s.removeNode);
  const upsertRelation = useEditorStore((s) => s.upsertRelation);
  const select = useEditorStore((s) => s.select);

  const nodeLabel = (n: SyntaxNode) =>
    `${n.role ?? n.kind}: ${nodeText(doc, n) || n.label || '∅'}`;

  // --- new node form ---
  const [nKind, setNKind] = useState<NodeKind>('word');
  const [nRole, setNRole] = useState<SyntacticRole | ''>('');
  const [nTokens, setNTokens] = useState<string[]>([]);
  const [nLabel, setNLabel] = useState('');

  const addNode = () => {
    const node: SyntaxNode = {
      id: makeId('node'),
      kind: nKind,
      ...(nRole ? { role: nRole } : {}),
      tokenIds: nTokens,
      ...(nLabel ? { label: nLabel } : {}),
      provenance: { source: 'manual', confidence: 'high' },
    };
    upsertNode(node);
    select({ nodeId: node.id });
    setNTokens([]);
    setNLabel('');
  };

  // --- new relation form ---
  const [rType, setRType] = useState<SyntacticRole>('subject');
  const [rHead, setRHead] = useState('');
  const [rDep, setRDep] = useState('');
  const [rLabel, setRLabel] = useState('');

  const addRelation = () => {
    if (!rHead || !rDep || rHead === rDep) return;
    const relation: Relation = {
      id: makeId('rel'),
      type: rType,
      headId: rHead,
      dependentId: rDep,
      ...(rLabel ? { label: rLabel } : {}),
      provenance: { source: 'manual', confidence: 'high' },
    };
    upsertRelation(relation);
    select({ relationId: relation.id });
    setRLabel('');
  };

  return (
    <div>
      <h3 className="section-title">Nodes</h3>
      {doc.syntax.nodes.map((n) => (
        <div
          key={n.id}
          className="token-row"
          style={{ gridTemplateColumns: '1fr auto' }}
          onClick={() => select({ nodeId: n.id })}
        >
          <div>
            <span className={doc.language === 'grc' ? 'greek' : undefined}>
              {nodeLabel(n)}
            </span>
            {n.id === doc.syntax.rootId && <span className="badge" style={{ marginLeft: 6 }}>root</span>}
          </div>
          {n.id !== doc.syntax.rootId && (
            <button
              className="mini reject"
              title="Remove node and its subtree"
              onClick={(e) => {
                e.stopPropagation();
                removeNode(n.id);
              }}
            >
              ✕
            </button>
          )}
        </div>
      ))}

      <div className="divider" />
      <h3 className="section-title">New node</h3>
      <div className="row">
        <select value={nKind} onChange={(e) => setNKind(e.target.value as NodeKind)}>
          {NODE_KIND_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <select value={nRole} onChange={(e) => setNRole(e.target.value as SyntacticRole)}>
          <option value="">— role —</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <p className="hint" style={{ margin: '8px 0 4px' }}>
        Tokens (optional — leave empty for implied elements):
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {[...doc.tokens]
          .sort((a, b) => a.index - b.index)
          .map((t) => {
            const on = nTokens.includes(t.id);
            return (
              <button
                key={t.id}
                className={`badge${on ? ' high' : ''}`}
                onClick={() =>
                  setNTokens((cur) =>
                    on ? cur.filter((x) => x !== t.id) : [...cur, t.id],
                  )
                }
              >
                <span className={doc.language === 'grc' ? 'greek' : undefined}>
                  {t.surface || `#${t.index}`}
                </span>
              </button>
            );
          })}
      </div>
      <input
        type="text"
        placeholder="label (e.g. (he) for implied)"
        value={nLabel}
        onChange={(e) => setNLabel(e.target.value)}
        style={{ marginTop: 8 }}
      />
      <button className="mini accept" onClick={addNode} style={{ marginTop: 8 }}>
        + Add node
      </button>

      <div className="divider" />
      <h3 className="section-title">New relation</h3>
      <select value={rType} onChange={(e) => setRType(e.target.value as SyntacticRole)}>
        {ROLE_OPTIONS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <div className="row" style={{ marginTop: 8 }}>
        <select value={rHead} onChange={(e) => setRHead(e.target.value)}>
          <option value="">— head —</option>
          {doc.syntax.nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {nodeLabel(n)}
            </option>
          ))}
        </select>
        <select value={rDep} onChange={(e) => setRDep(e.target.value)}>
          <option value="">— dependent —</option>
          {doc.syntax.nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {nodeLabel(n)}
            </option>
          ))}
        </select>
      </div>
      <input
        type="text"
        placeholder="connector label (optional)"
        value={rLabel}
        onChange={(e) => setRLabel(e.target.value)}
        style={{ marginTop: 8 }}
      />
      <button
        className="mini accept"
        onClick={addRelation}
        disabled={!rHead || !rDep || rHead === rDep}
        style={{ marginTop: 8 }}
      >
        + Add relation
      </button>
    </div>
  );
}
