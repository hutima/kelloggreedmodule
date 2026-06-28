import { useEditorStore } from '@/state';
import { getNode, nodeText } from '@/domain/model';
import type { NodeLayoutHint } from '@/domain/schema';

/** Per-node layout overrides for the selected node. */
export function LayoutHintsEditor() {
  const doc = useEditorStore((s) => s.doc);
  const sel = useEditorStore((s) => s.selection);
  const setLayoutHint = useEditorStore((s) => s.setLayoutHint);

  if (!sel.nodeId) {
    return <p className="empty">Select a node to nudge its position or collapse its subtree.</p>;
  }
  const node = getNode(doc.syntax, sel.nodeId);
  if (!node) return <p className="empty">Node not found.</p>;
  const hint = doc.layoutHints[sel.nodeId] ?? {};

  const patch = (p: Partial<NodeLayoutHint>) =>
    setLayoutHint(sel.nodeId!, { ...hint, ...p });

  return (
    <div>
      <p className="hint">
        Layout hints for{' '}
        <strong className={doc.language === 'grc' ? 'greek' : undefined}>
          {nodeText(doc, node) || node.label || node.kind}
        </strong>
        . Hints adjust the diagram only — they never change the syntax.
      </p>
      <div className="row">
        <label className="field">
          <span>Offset X</span>
          <input
            type="number"
            value={hint.offsetX ?? 0}
            onChange={(e) => patch({ offsetX: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          <span>Offset Y</span>
          <input
            type="number"
            value={hint.offsetY ?? 0}
            onChange={(e) => patch({ offsetY: Number(e.target.value) })}
          />
        </label>
      </div>
      <label className="field row" style={{ alignItems: 'center' }}>
        <input
          type="checkbox"
          style={{ width: 'auto', flex: 'none' }}
          checked={Boolean(hint.collapsed)}
          onChange={(e) => patch({ collapsed: e.target.checked })}
        />
        <span style={{ marginBottom: 0 }}>Collapse subtree</span>
      </label>
      <button className="mini" onClick={() => setLayoutHint(sel.nodeId!, undefined)}>
        Reset hints
      </button>
    </div>
  );
}
