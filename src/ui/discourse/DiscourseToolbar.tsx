import { useState } from 'react';
import { useDiscourseStore } from '@/state';
import { canIndent, canOutdent, childUnits } from '@/domain/discourse';

/**
 * DISCOURSE EDIT TOOLBAR — mounted in the discourse canvas while the app is in
 * Edit mode. Every keyboard shortcut has a button here (accessibility rule),
 * and every button routes to the discourse store's pure-mutation wrappers:
 * split, merge, indent/outdent, move, group/ungroup, label, notes, relate,
 * undo/redo, reset. Nothing here touches the syntax editor.
 */
export function DiscourseToolbar() {
  const doc = useDiscourseStore((s) => s.doc);
  const selection = useDiscourseStore((s) => s.selection);
  const multi = useDiscourseStore((s) => s.multiSelectedUnitIds);
  const splitPickUnitId = useDiscourseStore((s) => s.splitPickUnitId);
  const pendingRelationSource = useDiscourseStore((s) => s.pendingRelationSource);
  const past = useDiscourseStore((s) => s.past);
  const future = useDiscourseStore((s) => s.future);
  const beginSplit = useDiscourseStore((s) => s.beginSplit);
  const mergeWithPrevious = useDiscourseStore((s) => s.mergeWithPrevious);
  const indentUnit = useDiscourseStore((s) => s.indentUnit);
  const outdentUnit = useDiscourseStore((s) => s.outdentUnit);
  const moveUnit = useDiscourseStore((s) => s.moveUnit);
  const wrapUnits = useDiscourseStore((s) => s.wrapUnits);
  const unwrapUnit = useDiscourseStore((s) => s.unwrapUnit);
  const startRelation = useDiscourseStore((s) => s.startRelation);
  const cancelRelation = useDiscourseStore((s) => s.cancelRelation);
  const undo = useDiscourseStore((s) => s.undo);
  const redo = useDiscourseStore((s) => s.redo);
  const resetEdits = useDiscourseStore((s) => s.resetEdits);
  const labelUnit = useDiscourseStore((s) => s.labelUnit);
  const deleteUnit = useDiscourseStore((s) => s.deleteUnit);

  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!doc) return null;
  const unit = selection.unitId ? doc.units.find((u) => u.id === selection.unitId) : undefined;
  const isLeaf = !!unit && unit.tokenIds.length > 0;
  const isContainer = !!unit && unit.tokenIds.length === 0 && childUnits(doc, unit.id).length > 0;
  const siblings = unit ? childUnits(doc, unit.parentId) : [];
  const siblingIndex = unit ? siblings.findIndex((u) => u.id === unit.id) : -1;
  const prevSibling = siblingIndex > 0 ? siblings[siblingIndex - 1] : undefined;
  const canMergePrev = !!unit && !!prevSibling && isLeaf && prevSibling.tokenIds.length > 0;
  const splitting = splitPickUnitId != null;
  const relating = pendingRelationSource != null;

  const promptLabel = () => {
    if (!unit) return;
    // A tiny inline prompt keeps the flow keyboard-friendly; the inspector's
    // label field offers the richer editing surface.
    const next = window.prompt('Unit label (A, B′, “Household code”…)', unit.label ?? '');
    if (next !== null) labelUnit(unit.id, next);
  };

  return (
    <div className="discourse-toolbar" role="toolbar" aria-label="Discourse editing">
      <div className="discourse-toolbar-group">
        <button
          className={`mini${splitting ? ' accept' : ''}`}
          disabled={!isLeaf && !splitting}
          title="Split this unit — then click the word that should START the new unit (Enter)"
          onClick={() => beginSplit(splitting ? null : unit?.id ?? null)}
        >
          {splitting ? 'Cancel split' : 'Split'}
        </button>
        <button
          className="mini"
          disabled={!canMergePrev}
          title="Merge this unit into the previous one (Backspace)"
          onClick={() => unit && mergeWithPrevious(unit.id)}
        >
          Merge ←
        </button>
      </div>

      <div className="discourse-toolbar-group">
        <button
          className="mini"
          disabled={!unit || !canIndent(doc, unit.id)}
          title="Indent under the previous unit (Tab) — an interpretive outline move"
          onClick={() => unit && indentUnit(unit.id)}
        >
          → Indent
        </button>
        <button
          className="mini"
          disabled={!unit || !canOutdent(doc, unit.id)}
          title="Outdent one level (Shift+Tab)"
          onClick={() => unit && outdentUnit(unit.id)}
        >
          ← Outdent
        </button>
        <button
          className="mini"
          disabled={!unit || siblingIndex <= 0}
          title="Move up among siblings"
          onClick={() => unit && moveUnit(unit.id, -1)}
        >
          ↑
        </button>
        <button
          className="mini"
          disabled={!unit || siblingIndex < 0 || siblingIndex >= siblings.length - 1}
          title="Move down among siblings"
          onClick={() => unit && moveUnit(unit.id, +1)}
        >
          ↓
        </button>
      </div>

      <div className="discourse-toolbar-group">
        <button
          className="mini"
          disabled={multi.length < 1}
          title="Wrap the selected unit(s) in a new parent group (shift-click to select several)"
          onClick={() => {
            const label = window.prompt('Group label (“Household code”, “A”…)', '');
            if (label !== null) wrapUnits(multi, { label });
          }}
        >
          Group
        </button>
        <button
          className="mini"
          disabled={!isContainer}
          title="Unwrap this group — its members take its place"
          onClick={() => unit && unwrapUnit(unit.id)}
        >
          Ungroup
        </button>
        <button className="mini" disabled={!unit} title="Label this unit (A, B′, …)" onClick={promptLabel}>
          Label…
        </button>
      </div>

      <div className="discourse-toolbar-group">
        {confirmDelete && isContainer ? (
          <>
            <button
              className="mini reject"
              title="Delete this group AND every unit inside it (undoable)"
              onClick={() => {
                if (unit) deleteUnit(unit.id);
                setConfirmDelete(false);
              }}
            >
              Delete group + contents?
            </button>
            <button className="mini" onClick={() => setConfirmDelete(false)}>
              Keep
            </button>
          </>
        ) : (
          <button
            className="mini reject"
            disabled={!unit}
            title={
              isContainer
                ? 'Delete this group and everything inside it'
                : 'Remove this verse / unit from the analysis (undoable; source text is untouched)'
            }
            onClick={() => {
              if (!unit) return;
              // Deleting a container drops its whole subtree — confirm first.
              if (isContainer) setConfirmDelete(true);
              else deleteUnit(unit.id);
            }}
          >
            {isContainer ? 'Delete group…' : 'Delete unit'}
          </button>
        )}
      </div>

      <div className="discourse-toolbar-group">
        <button
          className={`mini${relating ? ' accept' : ''}`}
          disabled={!unit && !relating}
          title="Relate this unit to another — click the target unit, then pick the relation type"
          onClick={() => (relating ? cancelRelation() : unit && startRelation(unit.id))}
        >
          {relating ? 'Cancel relate' : 'Relate →'}
        </button>
      </div>

      <div className="discourse-toolbar-group">
        <button className="mini" disabled={!past.length} title="Undo (Ctrl/Cmd+Z)" onClick={undo}>
          ↶ Undo
        </button>
        <button className="mini" disabled={!future.length} title="Redo (Ctrl/Cmd+Shift+Z)" onClick={redo}>
          ↷ Redo
        </button>
        {confirmReset ? (
          <>
            <button
              className="mini reject"
              title="Discard ALL discourse edits for this range (syntax edits and sermon notes are untouched)"
              onClick={() => {
                resetEdits();
                setConfirmReset(false);
              }}
            >
              Really reset?
            </button>
            <button className="mini" onClick={() => setConfirmReset(false)}>
              Keep edits
            </button>
          </>
        ) : (
          <button
            className="mini"
            disabled={!past.length && !localHasPatch(doc.id)}
            title="Discard all discourse edits for this range — syntax edits and sermon notes are untouched"
            onClick={() => setConfirmReset(true)}
          >
            Reset edits…
          </button>
        )}
      </div>

      {splitting && (
        <span className="discourse-toolbar-hint">Click the word that should start the new unit.</span>
      )}
      {relating && (
        <span className="discourse-toolbar-hint">Click the target unit for the relation.</span>
      )}
      {!unit && !splitting && !relating && (
        <span className="discourse-toolbar-hint">Select a unit to edit. Shift-click extends the selection.</span>
      )}
    </div>
  );
}

/** Whether a stored patch exists for this doc (enables Reset before any
 *  in-session edit). Best-effort localStorage read. */
function localHasPatch(discourseDocId: string): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(`kr:discourse:${discourseDocId}`) != null;
  } catch {
    return false;
  }
}
