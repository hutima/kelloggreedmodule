import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClauseType, KrDocument, SyntacticRole, SyntaxNode } from '@/domain/schema';
import { useEditorStore } from '@/state';
import {
  buildOutline,
  clauseAncestor,
  descendantIds,
  getNode,
  parentRelations,
  type OutlineNode,
} from '@/domain/model';
import { nodeHighlightColors } from '@/ui/sermon/highlights';
import { dispatchEditIntent } from '../dispatch';
import { nodeName } from '../common';
import { ROLE_LABEL } from '../roles';
import { canDemote, canPromote, moveTargets } from '../hierarchy';

/**
 * The grammatical FUNCTIONS a word can take, grouped for the Basic-edit dropdown.
 * "Verb" (predicate) is a first-class clause part here — assigning the verb is as
 * easy as assigning the subject, which the old chip row couldn't do. Picking a
 * function re-roles the word AND re-homes it (subject/verb to the clause, objects
 * to the verb) via the shared `setRole` logic.
 */
const FUNCTION_GROUPS: { label: string; roles: SyntacticRole[] }[] = [
  {
    label: 'Clause parts',
    roles: [
      'subject',
      'predicate',
      'copula',
      'directObject',
      'indirectObject',
      'predicateNominative',
      'predicateAdjective',
      'objectComplement',
      'dativeComplement',
      'genitiveComplement',
      'agent',
    ],
  },
  {
    label: 'Modifiers',
    roles: ['adjectival', 'adverbial', 'determiner', 'genitive', 'apposition', 'prepositionalPhrase', 'prepositionObject'],
  },
  { label: 'Connectives', roles: ['coordinator', 'conjunct', 'particle', 'vocative', 'interjection'] },
  { label: 'Other', roles: ['conjunction', 'adjunct', 'unknown'] },
];

/** Friendlier, plain-English labels for the function dropdown (overrides ROLE_LABEL). */
const PART_LABEL: Partial<Record<SyntacticRole, string>> = {
  subject: 'Subject',
  predicate: 'Verb',
  copula: 'Linking verb',
  directObject: 'Direct object',
  indirectObject: 'Indirect object',
  predicateNominative: 'Predicate noun',
  predicateAdjective: 'Predicate adjective',
  objectComplement: 'Object complement',
  dativeComplement: 'Dative complement',
  genitiveComplement: 'Genitive complement',
  agent: 'Agent (of passive)',
  adjectival: 'Adjective / adjectival',
  adverbial: 'Adverb / adverbial',
  determiner: 'Article',
  genitive: 'Genitive',
  apposition: 'Apposition',
  prepositionalPhrase: 'Prepositional phrase',
  prepositionObject: 'Object of preposition',
  conjunction: 'Conjunction',
  coordinator: 'Conjunction',
  conjunct: 'Coordinated element',
  particle: 'Particle',
  vocative: 'Direct address',
  interjection: 'Interjection',
  adjunct: 'Unspecified',
  unknown: 'Unknown',
};

const partLabel = (role: SyntacticRole): string => PART_LABEL[role] ?? ROLE_LABEL[role] ?? role;

/** Drag-and-drop reparenting state + handlers, threaded down to each row. */
interface RowDnd {
  enabled: boolean;
  dragId: string | null;
  dropTarget: string | null;
  canDrop: (id: string) => boolean;
  onPointerDown: (id: string, e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  wasDrag: () => boolean;
}

/** Nodes a drag may NOT land on: the dragged node itself and its descendants. */
function dragInvalidFor(nodeId: string, doc: KrDocument): Set<string> {
  return new Set([nodeId, ...descendantIds(doc.syntax, nodeId)]);
}

/** Clause subtypes offered in the Basic clause-type dropdown. */
const CLAUSE_TYPE_OPTIONS: { ct: ClauseType; label: string }[] = [
  { ct: 'independent', label: 'Main clause' },
  { ct: 'adverbial', label: 'Supporting (adverbial) clause' },
  { ct: 'relative', label: 'Relative clause' },
  { ct: 'complement', label: 'Complement clause' },
  { ct: 'participial', label: 'Participial clause' },
  { ct: 'infinitival', label: 'Infinitive clause' },
  { ct: 'coordinate', label: 'Coordinate clauses' },
];

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

  // --- drag-and-drop reparenting (POINTER-based, not flaky HTML5 DnD) ---------
  // Grab a row's handle and drag it onto another block to nest it there. Built on
  // pointer events + elementFromPoint + pointer capture, so it works the same in
  // every browser and on touch — the word follows the cursor (a floating ghost),
  // the block under the cursor highlights, and releasing drops it there.
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; label: string } | null>(null);
  // Live refs so the pointer handlers (bound once at drag start) read current state.
  const dragRef = useRef<{ id: string; invalid: Set<string>; drop: string | null }>({
    id: '',
    invalid: new Set(),
    drop: null,
  });
  // Set true on a real drag so the click that follows pointer-up doesn't also
  // fire a selection on the handle's row.
  const draggedRef = useRef(false);
  // Reactive "can't drop here" set (self + descendants) for the row highlighting.
  const dragInvalid = useMemo(
    () => (dragId ? new Set([dragId, ...descendantIds(doc.syntax, dragId)]) : null),
    [dragId, doc],
  );

  // Drag-and-drop is the alternative to the Move-under tool; suppress it while a
  // tool-driven move or a grouping selection is in progress, and while any row's
  // inline edit menu is open. Now that a second click on the open row closes its
  // menu, leaving the handle live at the same time invites a mis-tap to be read
  // as a drag start instead of a close — so the handles only reappear once the
  // menu is closed.
  const dndEnabled = !moving && !grouping && !selectedId;
  // A row's inline menu is open (selected, outside the move/group tools). The
  // banner below stays mounted in this state too — only its text swaps — so
  // opening/closing the first menu doesn't also collapse/restore the banner's
  // slot on top of the controls appearing/disappearing below the row.
  const menuOpen = Boolean(selectedId) && !moving && !grouping;

  const canDrop = (id: string | null | undefined): boolean =>
    Boolean(id) && id !== dragRef.current.id && !dragRef.current.invalid.has(id!);

  const endDrag = () => {
    setDragId(null);
    setDropTarget(null);
    setGhost(null);
    dragRef.current = { id: '', invalid: new Set(), drop: null };
  };

  const dnd: RowDnd = {
    enabled: dndEnabled,
    dragId,
    dropTarget,
    canDrop: (id) => Boolean(dragId) && id !== dragId && !dragInvalid?.has(id),
    onPointerDown: (id, e) => {
      // Left button / touch / pen only.
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      draggedRef.current = false;
      dragRef.current = { id, invalid: dragInvalidFor(id, doc), drop: null };
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      } catch {
        /* capture unsupported — elementFromPoint still works */
      }
      setDragId(id);
      setDropTarget(null);
      setGhost({ x: e.clientX, y: e.clientY, label: nodeName(doc, id) });
    },
    onPointerMove: (e) => {
      if (!dragRef.current.id) return;
      draggedRef.current = true;
      setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const row = el?.closest('[data-pbw-node]') as HTMLElement | null;
      const id = row?.getAttribute('data-pbw-node') ?? null;
      const next = id && canDrop(id) ? id : null;
      if (next !== dragRef.current.drop) {
        dragRef.current.drop = next;
        setDropTarget(next);
      }
    },
    onPointerUp: () => {
      const { id, drop } = dragRef.current;
      if (id && drop && canDrop(drop)) {
        dispatchEditIntent({ kind: 'moveNodeUnder', nodeId: id, headId: drop });
      }
      endDrag();
    },
    // True (once) if the just-finished gesture was a real drag, so the handle's
    // trailing click doesn't also fire a selection.
    wasDrag: () => {
      const d = draggedRef.current;
      draggedRef.current = false;
      return d;
    },
  };

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
    // Clicking the already-selected row COLLAPSES its inline edit menu (toggle
    // off); clicking another row closes the open menu and opens that row's — one
    // click, predictable, so rows don't shift unexpectedly mid drag-and-drop.
    select(nodeId === selectedId ? {} : { nodeId });
  };

  return (
    <div className={`pbw${greek ? ' greek' : ''}${hebrew ? ' hebrew' : ''}`}>
      {ghost && (
        <div className="pbw-drag-ghost" style={{ left: ghost.x + 14, top: ghost.y + 8 }} aria-hidden="true">
          {ghost.label}
        </div>
      )}
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
      {/* PERMANENT drag banner (when not in the move/group tools): it occupies the
          same slot whether idle, dragging, or a row's menu is open (handles
          hidden), so neither starting a drag nor opening/closing a menu ever
          shifts the rows by collapsing this slot — only its text swaps. */}
      {!moving && !grouping && (
        <div className={`pbw-banner pbw-banner-dnd${dragId ? ' dragging' : ''}`}>
          {dragId ? (
            <>
              Drop <strong>{nodeName(doc, dragId)}</strong> on a block to nest it under it.
              <button className="mini" onClick={endDrag}>
                Cancel
              </button>
            </>
          ) : menuOpen ? (
            <span className="pbw-banner-hint">Close the menu below to drag-and-drop rows.</span>
          ) : (
            <span className="pbw-banner-hint">
              Drag a row’s <span className="pbw-grip-inline" aria-hidden="true">⠿</span> handle onto
              another block to nest it under it.
            </span>
          )}
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
          dnd={dnd}
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
  dnd,
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
  dnd: RowDnd;
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
  // Drag-and-drop: a non-root row can be dragged; any row that's a legal target
  // while a drag is in progress highlights, and the hovered one is the drop slot.
  const draggable = dnd.enabled && node.id !== doc.syntax.rootId;
  const isDropTarget = dnd.dropTarget === node.id && dnd.canDrop(node.id);
  const isDropCandidate = Boolean(dnd.dragId) && dnd.canDrop(node.id);
  const isDragging = dnd.dragId === node.id;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!selected) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      dispatchEditIntent({ kind: e.shiftKey ? 'promoteNode' : 'demoteNode', nodeId: node.id });
    } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      dispatchEditIntent({ kind: e.key === 'ArrowUp' ? 'promoteNode' : 'demoteNode', nodeId: node.id });
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (node.id === doc.syntax.rootId) return;
      e.preventDefault();
      // Two-step delete: a clause goes away (its words back to the bank); a word
      // detaches to the bank (a second delete there removes it for good).
      const n = getNode(doc.syntax, node.id);
      dispatchEditIntent(
        n?.kind === 'clause'
          ? { kind: 'removeNode', nodeId: node.id }
          : { kind: 'detachWord', nodeId: node.id },
      );
    }
  };

  return (
    <li role="treeitem" aria-selected={selected}>
      <div
        data-pbw-node={node.id}
        className={`pbw-row${selected ? ' selected' : ''}${hot ? ' hovered' : ''}${
          node.tentative ? ' tentative' : ''
        }${isTarget ? ' targetable' : ''}${inRange ? ' in-range' : ''}${
          isDropCandidate ? ' drop-candidate' : ''
        }${isDropTarget ? ' drop-target' : ''}${isDragging ? ' dragging' : ''}`}
        style={{ paddingLeft: 8 + depth * 18 }}
        tabIndex={selected ? 0 : -1}
        onClick={() => onRowClick(node.id)}
        onKeyDown={onKeyDown}
        onMouseEnter={() => onHover(node.id)}
        onMouseLeave={() => onHover(undefined)}
      >
        {/* iOS-style drag handle: a pointer-driven drag (reliable across browsers
            and touch, unlike native HTML5 DnD). Grabbing it collapses the row's
            edit menu (below) and lets you drop the block under any word or clause;
            a plain click (no drag) falls through to select the word. */}
        {draggable && (
          <span
            className="pbw-grip"
            role="button"
            aria-label="Drag to move this block under another"
            title="Drag to move this block under another word or clause"
            onPointerDown={(e) => {
              e.stopPropagation();
              dnd.onPointerDown(node.id, e);
            }}
            onPointerMove={(e) => dnd.onPointerMove(e)}
            onPointerUp={(e) => dnd.onPointerUp(e)}
            onPointerCancel={(e) => dnd.onPointerUp(e)}
            onClick={(e) => {
              // Suppress the click that trails a real drag; a plain tap falls
              // through to the row's onClick (select).
              if (dnd.wasDrag()) e.stopPropagation();
            }}
          >
            ⠿
          </span>
        )}
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
      {selected && !moving && !grouping && !dnd.dragId && (
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
              dnd={dnd}
              onRowClick={onRowClick}
              onHover={onHover}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * The inline control bar under a selected row. Advanced opens the modal editors;
 * Basic is the guided workflow: a word picks its FUNCTION (a dropdown of clause
 * parts incl. Verb) and which CLAUSE it belongs to, sets its level by
 * promote/demote/move-under, and can be removed back to the word bank; a clause
 * picks its TYPE and relates to other clauses by level.
 */
function RowControls({ nodeId, editTier }: { nodeId: string; editTier: 'basic' | 'advanced' }) {
  const doc = useEditorStore((s) => s.doc);

  if (nodeId === doc.syntax.rootId) {
    return (
      <div className="pbw-controls">
        <span className="pbw-parent">Main passage</span>
      </div>
    );
  }

  const node = getNode(doc.syntax, nodeId);
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
        <button className="chip" onClick={() => dispatchEditIntent({ kind: 'openBlockEditor', nodeId })}>
          Block editor…
        </button>
        <button className="chip" onClick={() => dispatchEditIntent({ kind: 'openAdvancedWordDetails', nodeId })}>
          Word details…
        </button>
      </div>
    );
  }

  return (
    <div className="pbw-controls">
      {node?.kind === 'clause' ? (
        <ClauseControls nodeId={nodeId} node={node} />
      ) : (
        <WordControls nodeId={nodeId} headName={headName} />
      )}
    </div>
  );
}

/** Add note · Highlight · Advanced — shared by the word and clause controls. */
function NoteHighlightAdvanced({ nodeId }: { nodeId: string }) {
  return (
    <>
      <button
        className="chip"
        onClick={() => dispatchEditIntent({ kind: 'openNote', anchor: { type: 'node', nodeId } })}
      >
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
    </>
  );
}

/** Basic controls for a WORD: function dropdown, clause membership, level, delete. */
function WordControls({ nodeId, headName }: { nodeId: string; headName: string | null }) {
  const doc = useEditorStore((s) => s.doc);
  const setActiveEditTool = useEditorStore((s) => s.setActiveEditTool);

  const node = getNode(doc.syntax, nodeId);
  const incoming = parentRelations(doc.syntax, nodeId)[0];
  const currentRole: SyntacticRole = incoming?.type ?? node?.role ?? 'adjunct';
  const knownRole = FUNCTION_GROUPS.some((g) => g.roles.includes(currentRole));

  const clauses = useMemo(() => clauseChoices(doc), [doc]);
  const currentClauseId = clauseAncestor(doc.syntax, nodeId)?.id;
  const clauseValue = clauses.some((c) => c.id === currentClauseId) ? currentClauseId : '';

  const grouped = (node?.tokenIds.length ?? 0) > 1;
  // Whether the current function is a modifier — for these "relate to a word"
  // (Move under…) is the meaningful attachment, so we nudge toward it.
  const isModifier = !CLAUSE_HEADED.includes(currentRole) && !VERB_HEADED.includes(currentRole);

  return (
    <>
      <label className="pbw-field">
        <span className="pbw-field-label">Function</span>
        <select
          className="pbw-select"
          value={currentRole}
          onChange={(e) =>
            dispatchEditIntent({ kind: 'setRole', nodeId, role: e.target.value as SyntacticRole })
          }
        >
          {!knownRole && <option value={currentRole}>{partLabel(currentRole)}</option>}
          {FUNCTION_GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.roles.map((r) => (
                <option key={r} value={r}>
                  {partLabel(r)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {clauses.length > 0 && (
        <label className="pbw-field">
          <span className="pbw-field-label">In clause</span>
          <select
            className="pbw-select"
            value={clauseValue}
            onChange={(e) =>
              e.target.value &&
              dispatchEditIntent({ kind: 'assignToClause', nodeId, clauseId: e.target.value })
            }
          >
            {clauseValue === '' && <option value="">Choose a clause…</option>}
            {clauses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="pbw-btns">
        <button
          className="chip"
          disabled={!canPromote(doc, nodeId)}
          title="Move one outline level shallower"
          onClick={() => dispatchEditIntent({ kind: 'promoteNode', nodeId })}
        >
          ▲ Promote
        </button>
        <button
          className="chip"
          disabled={!canDemote(doc, nodeId)}
          title="Nest under the previous block"
          onClick={() => dispatchEditIntent({ kind: 'demoteNode', nodeId })}
        >
          ▼ Demote
        </button>
        <button
          className={`chip${isModifier ? ' suggest' : ''}`}
          title={isModifier ? 'Attach this modifier under the word it modifies' : 'Attach under another word or clause'}
          onClick={() => setActiveEditTool('move')}
        >
          {isModifier && headName ? 'Modifies word…' : 'Move under…'}
        </button>
        {grouped && (
          <button
            className="chip"
            title="Split back into separate words"
            onClick={() => dispatchEditIntent({ kind: 'ungroupNode', nodeId })}
          >
            Ungroup
          </button>
        )}
      </div>

      <div className="pbw-btns">
        <button
          className="chip danger"
          title="Take this word off the diagram — it returns to Unassigned (not deleted)"
          onClick={() => dispatchEditIntent({ kind: 'detachWord', nodeId })}
        >
          Remove from diagram
        </button>
        <NoteHighlightAdvanced nodeId={nodeId} />
      </div>
    </>
  );
}

/** Basic controls for a CLAUSE: clause-type dropdown, level, delete. */
function ClauseControls({ nodeId, node }: { nodeId: string; node: SyntaxNode }) {
  const doc = useEditorStore((s) => s.doc);
  const setActiveEditTool = useEditorStore((s) => s.setActiveEditTool);
  const clauseType = node.clauseType ?? 'independent';
  const knownType = CLAUSE_TYPE_OPTIONS.some((c) => c.ct === clauseType);

  return (
    <>
      <label className="pbw-field">
        <span className="pbw-field-label">Clause type</span>
        <select
          className="pbw-select"
          value={clauseType}
          onChange={(e) =>
            dispatchEditIntent({ kind: 'setClauseType', nodeId, clauseType: e.target.value as ClauseType })
          }
        >
          {!knownType && <option value={clauseType}>{clauseType}</option>}
          {CLAUSE_TYPE_OPTIONS.map((c) => (
            <option key={c.ct} value={c.ct}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <div className="pbw-btns">
        <button
          className="chip"
          disabled={!canPromote(doc, nodeId)}
          title="Raise this clause one level"
          onClick={() => dispatchEditIntent({ kind: 'promoteNode', nodeId })}
        >
          ▲ Promote
        </button>
        <button
          className="chip"
          disabled={!canDemote(doc, nodeId)}
          title="Nest this clause under the previous one"
          onClick={() => dispatchEditIntent({ kind: 'demoteNode', nodeId })}
        >
          ▼ Demote
        </button>
        <button
          className="chip"
          title="Attach this clause under another clause"
          onClick={() => setActiveEditTool('move')}
        >
          Move under…
        </button>
      </div>

      <div className="pbw-btns">
        <button
          className="chip danger"
          title="Delete this clause — its words return to Unassigned"
          onClick={() => dispatchEditIntent({ kind: 'removeNode', nodeId })}
        >
          Delete clause
        </button>
        <NoteHighlightAdvanced nodeId={nodeId} />
      </div>
    </>
  );
}

/** Roles that hang directly off the clause (mirror of the model's slot rules). */
const CLAUSE_HEADED: SyntacticRole[] = ['subject', 'predicate', 'copula'];
const VERB_HEADED: SyntacticRole[] = [
  'directObject',
  'indirectObject',
  'predicateNominative',
  'predicateAdjective',
  'objectComplement',
  'dativeComplement',
  'genitiveComplement',
  'agent',
];

/** Lowest surface index anywhere in a node's subtree (for ordering choices). */
function subtreeMinIndex(doc: KrDocument, id: string): number {
  let m = Infinity;
  for (const k of [id, ...descendantIds(doc.syntax, id)]) {
    const kn = getNode(doc.syntax, k);
    if (kn) for (const t of kn.tokenIds) {
      const tok = doc.tokens.find((x) => x.id === t);
      if (tok) m = Math.min(m, tok.index);
    }
  }
  return m;
}

/** A short "Main clause: ὁ λόγος ἦν…" label for the In-clause dropdown. */
function clauseChoiceLabel(doc: KrDocument, id: string): string {
  const type = getNode(doc.syntax, id)?.clauseType ?? 'independent';
  const typeLabel = CLAUSE_TYPE_OPTIONS.find((c) => c.ct === type)?.label ?? 'Clause';
  const toks: { i: number; s: string }[] = [];
  for (const k of [id, ...descendantIds(doc.syntax, id)]) {
    const kn = getNode(doc.syntax, k);
    if (kn) for (const t of kn.tokenIds) {
      const tok = doc.tokens.find((x) => x.id === t);
      if (tok) toks.push({ i: tok.index, s: tok.surface });
    }
  }
  toks.sort((a, b) => a.i - b.i);
  const preview = toks.slice(0, 4).map((t) => t.s).join(' ');
  return preview ? `${typeLabel}: ${preview}${toks.length > 4 ? '…' : ''}` : typeLabel;
}

/** The clauses a word may be assigned to — real clauses, not coordinate/passage containers. */
function clauseChoices(doc: KrDocument): { id: string; label: string }[] {
  return doc.syntax.nodes
    .filter((n) => n.kind === 'clause' && n.clauseType !== 'coordinate' && n.clauseType !== 'discourse')
    .map((n) => ({ id: n.id, o: subtreeMinIndex(doc, n.id), label: clauseChoiceLabel(doc, n.id) }))
    .sort((a, b) => a.o - b.o)
    .map(({ id, label }) => ({ id, label }));
}
