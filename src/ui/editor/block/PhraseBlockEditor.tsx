import { useEffect, useMemo } from 'react';
import { useEditorStore } from '@/state';
import { buildOutline, getNode, parentRelations, type OutlineNode } from '@/domain/model';
import { nodeHighlightColors } from '@/ui/sermon/highlights';
import { dispatchEditIntent } from '../dispatch';
import { adapterFor } from '../adapters';
import { nodeName } from '../common';
import { ROLE_LABEL } from '../roles';
import { canDemote, canPromote, moveTargets } from '../hierarchy';

/**
 * PHRASE / BLOCK WORKBENCH — the interactive sermon-prep editor. Rows are
 * phrases/clauses; indentation shows dependence. Selecting a row exposes inline
 * controls (Promote, Demote, Move under…, plain function chips, Group, Note,
 * Highlight, Advanced). Moving a row under another row re-points its incoming
 * relation in the shared syntax graph, so every other view updates too.
 *
 * Keyboard: Shift+Tab / Alt+↑ promote · Tab / Alt+↓ demote · Delete detach.
 */
export function PhraseBlockEditor({
  hovered,
  onHover,
}: {
  hovered: Set<string>;
  onHover: (id?: string) => void;
}) {
  const doc = useEditorStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const editTier = useEditorStore((s) => s.editTier);
  const activeEditTool = useEditorStore((s) => s.activeEditTool);
  const setActiveEditTool = useEditorStore((s) => s.setActiveEditTool);
  const selectedRange = useEditorStore((s) => s.selectedRange);
  const setSelectedRange = useEditorStore((s) => s.setSelectedRange);
  const highlights = useEditorStore((s) => s.sermon.highlights);
  const hlByNode = useMemo(() => nodeHighlightColors(highlights), [highlights]);

  const outline = useMemo(() => buildOutline(doc), [doc]);
  const greek = doc.language === 'grc';
  const hebrew = doc.language === 'hbo';
  const selectedId = selection.nodeId;

  const moving = activeEditTool === 'move' && Boolean(selectedId);
  const grouping = activeEditTool === 'group';
  const validTargets = useMemo(
    () => (moving && selectedId ? new Set(moveTargets(doc, selectedId).map((n) => n.id)) : null),
    [moving, selectedId, doc],
  );

  const rangeTokens = useMemo(() => new Set(selectedRange), [selectedRange]);

  // Esc cancels move/group; reset multi-select range when leaving group mode.
  useEffect(() => {
    if (!grouping && selectedRange.length) setSelectedRange([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouping]);

  if (!outline) return <p className="empty">No structure to outline yet.</p>;

  const onRowClick = (nodeId: string) => {
    if (moving && selectedId && selectedId !== nodeId) {
      if (!validTargets || validTargets.has(nodeId)) {
        dispatchEditIntent({ kind: 'moveNodeUnder', nodeId: selectedId, headId: nodeId });
        setActiveEditTool('select');
      }
      return;
    }
    if (grouping) {
      const node = getNode(doc.syntax, nodeId);
      if (node?.kind === 'word' && node.tokenIds.length) {
        const has = node.tokenIds.every((t) => rangeTokens.has(t));
        const next = has
          ? selectedRange.filter((t) => !node.tokenIds.includes(t))
          : [...selectedRange, ...node.tokenIds];
        setSelectedRange(next);
      }
      return;
    }
    select({ nodeId });
  };

  return (
    <div className={`pbw${greek ? ' greek' : ''}${hebrew ? ' hebrew' : ''}`}>
      {moving && (
        <div className="pbw-banner">
          Click the block to move <strong>{nodeName(doc, selectedId!)}</strong> under.
          <button className="mini" onClick={() => setActiveEditTool('select')}>
            Cancel
          </button>
        </div>
      )}
      {grouping && (
        <div className="pbw-banner">
          Tap words to group them ({selectedRange.length} selected).
          <button
            className="mini"
            disabled={selectedRange.length < 2}
            onClick={() => {
              dispatchEditIntent({ kind: 'groupTokens', tokenIds: selectedRange });
              setActiveEditTool('select');
            }}
          >
            Group {selectedRange.length} words
          </button>
          <button className="mini" onClick={() => setActiveEditTool('select')}>
            Cancel
          </button>
        </div>
      )}
      <ul className="pbw-tree" role="tree">
        <Row
          node={outline}
          depth={0}
          selectedId={selectedId}
          hovered={hovered}
          highlights={hlByNode}
          rangeTokens={rangeTokens}
          targetable={validTargets}
          moving={moving}
          grouping={grouping}
          editTier={editTier}
          onRowClick={onRowClick}
          onHover={onHover}
        />
      </ul>
    </div>
  );
}

function Row({
  node,
  depth,
  selectedId,
  hovered,
  highlights,
  rangeTokens,
  targetable,
  moving,
  grouping,
  editTier,
  onRowClick,
  onHover,
}: {
  node: OutlineNode;
  depth: number;
  selectedId: string | undefined;
  hovered: Set<string>;
  highlights: Map<string, string>;
  rangeTokens: Set<string>;
  targetable: Set<string> | null;
  moving: boolean;
  grouping: boolean;
  editTier: 'basic' | 'advanced';
  onRowClick: (id: string) => void;
  onHover: (id?: string) => void;
}) {
  const doc = useEditorStore((s) => s.doc);
  const selected = node.id === selectedId;
  const hot = hovered.has(node.id);
  const hl = highlights.get(node.id);
  const isTarget = moving && targetable?.has(node.id);
  const syntaxNode = getNode(doc.syntax, node.id);
  const inRange = grouping && (syntaxNode?.tokenIds.some((t) => rangeTokens.has(t)) ?? false);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!selected) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      dispatchEditIntent({ kind: e.shiftKey ? 'promoteNode' : 'demoteNode', nodeId: node.id });
    } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      dispatchEditIntent({ kind: e.key === 'ArrowUp' ? 'promoteNode' : 'demoteNode', nodeId: node.id });
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      const rel = parentRelations(doc.syntax, node.id)[0];
      if (rel) {
        e.preventDefault();
        dispatchEditIntent({ kind: 'removeRelation', relationId: rel.id });
      }
    }
  };

  return (
    <li role="treeitem" aria-selected={selected}>
      <div
        className={`pbw-row${selected ? ' selected' : ''}${hot ? ' hovered' : ''}${
          node.tentative ? ' tentative' : ''
        }${isTarget ? ' targetable' : ''}${inRange ? ' in-range' : ''}`}
        style={{ paddingLeft: 8 + depth * 18 }}
        tabIndex={selected ? 0 : -1}
        onClick={() => onRowClick(node.id)}
        onKeyDown={onKeyDown}
        onMouseEnter={() => onHover(node.id)}
        onMouseLeave={() => onHover(undefined)}
      >
        <span className="pbw-rail" aria-hidden="true" />
        {node.label && <span className="pbw-label">{node.label}</span>}
        {node.text ? (
          <span
            className={`pbw-text${node.implied ? ' implied' : ''}${hl ? ' highlighted' : ''}`}
            style={hl ? { background: hl } : undefined}
          >
            {node.text}
          </span>
        ) : (
          node.implied && <span className="pbw-text implied">(implied)</span>
        )}
      </div>
      {selected && !moving && !grouping && (
        <RowControls nodeId={node.id} editTier={editTier} />
      )}
      {node.children.length > 0 && (
        <ul role="group">
          {node.children.map((c) => (
            <Row
              key={c.id}
              node={c}
              depth={depth + 1}
              selectedId={selectedId}
              hovered={hovered}
              highlights={highlights}
              rangeTokens={rangeTokens}
              targetable={targetable}
              moving={moving}
              grouping={grouping}
              editTier={editTier}
              onRowClick={onRowClick}
              onHover={onHover}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** The inline control bar under a selected row. */
function RowControls({ nodeId, editTier }: { nodeId: string; editTier: 'basic' | 'advanced' }) {
  const doc = useEditorStore((s) => s.doc);
  const setActiveEditTool = useEditorStore((s) => s.setActiveEditTool);

  if (nodeId === doc.syntax.rootId) {
    return (
      <div className="pbw-controls">
        <span className="pbw-parent">Main passage</span>
      </div>
    );
  }

  const incoming = parentRelations(doc.syntax, nodeId)[0];
  const headName = incoming ? nodeName(doc, incoming.headId) : null;
  const relLabel = incoming ? ROLE_LABEL[incoming.type] : null;

  if (editTier === 'advanced') {
    return (
      <div className="pbw-controls">
        {headName && (
          <span className="pbw-parent">
            {relLabel} of <strong>{headName}</strong>
          </span>
        )}
        <button
          className="chip"
          onClick={() => dispatchEditIntent({ kind: 'openBlockEditor', nodeId })}
        >
          Block editor…
        </button>
        <button
          className="chip"
          onClick={() => dispatchEditIntent({ kind: 'openAdvancedWordDetails', nodeId })}
        >
          Word details…
        </button>
      </div>
    );
  }

  const basic = adapterFor('phrase-block').getBasicActions(doc, { nodeId });
  const chips = basic.filter((a) => a.chip);
  const rows = basic.filter((a) => !a.chip);

  return (
    <div className="pbw-controls">
      {headName ? (
        <span className="pbw-parent">
          {relLabel} of <strong>{headName}</strong>
        </span>
      ) : (
        <span className="pbw-parent">Top level</span>
      )}
      <div className="pbw-btns">
        <button className="chip" disabled={!canPromote(doc, nodeId)} onClick={() => dispatchEditIntent({ kind: 'promoteNode', nodeId })}>
          ▲ Promote
        </button>
        <button className="chip" disabled={!canDemote(doc, nodeId)} onClick={() => dispatchEditIntent({ kind: 'demoteNode', nodeId })}>
          ▼ Demote
        </button>
        <button className="chip" onClick={() => setActiveEditTool('move')}>
          Move under…
        </button>
        {rows
          .filter((a) => a.id === 'ungroup')
          .map((a) => (
            <button key={a.id} className="chip" onClick={() => dispatchEditIntent(a.intent)}>
              {a.label}
            </button>
          ))}
      </div>
      <div className="pbw-fns">
        <span className="pbw-fns-label">Function:</span>
        {chips.map((a) => (
          <button key={a.id} className="chip" title={a.hint} onClick={() => dispatchEditIntent(a.intent)}>
            {a.label}
          </button>
        ))}
      </div>
      <div className="pbw-btns">
        <button className="chip" onClick={() => dispatchEditIntent({ kind: 'openNote', anchor: { type: 'node', nodeId } })}>
          Add note
        </button>
        <button
          className="chip"
          onClick={() =>
            dispatchEditIntent({ kind: 'toggleHighlight', anchor: { type: 'node', nodeId }, category: 'emphasis' })
          }
        >
          Highlight
        </button>
        <button className="chip" onClick={() => dispatchEditIntent({ kind: 'openBlockEditor', nodeId })}>
          Advanced…
        </button>
      </div>
    </div>
  );
}
