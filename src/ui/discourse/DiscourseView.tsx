import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDiscourseStore } from '@/state';
import type { DiscourseDocument } from '@/domain/schema';
import { DiscourseRelationTypeSchema } from '@/domain/schema';
import {
  canIndent,
  canOutdent,
  childUnits,
  discourseRows,
  formatRange,
  relationTypeLabel,
  visibleRelationEndpoints,
} from '@/domain/discourse';
import { DiscourseUnitBlock } from './DiscourseUnitBlock';
import { DiscourseRelationLayer, type ArcSpec } from './DiscourseRelationLayer';
import { DiscourseRelationPicker } from './DiscourseRelationPicker';

/** Width of the left gutter the relation arcs live in. */
const ARC_GUTTER = 116;

/**
 * The discourse outline itself: a scrollable vertical list of unit blocks
 * (indented by outline depth) with an SVG relation-arc overlay in the left
 * gutter and a textual inspector for the selected unit.
 *
 * In Edit mode (`editing`) the same list grows the structural affordances:
 * click-to-relate, shift-click multi-selection for grouping, word-level split
 * picking, keyboard shortcuts (Enter split · Tab/Shift+Tab indent/outdent ·
 * Backspace merge · Ctrl/Cmd+Z undo), and inline label/notes/relation editing
 * in the inspector. Every shortcut has a toolbar equivalent.
 */
export function DiscourseView({ doc, editing = false }: { doc: DiscourseDocument; editing?: boolean }) {
  const view = useDiscourseStore((s) => s.view);
  const selection = useDiscourseStore((s) => s.selection);
  const select = useDiscourseStore((s) => s.select);
  const setUnitCollapsed = useDiscourseStore((s) => s.setUnitCollapsed);
  const multiSelected = useDiscourseStore((s) => s.multiSelectedUnitIds);
  const extendMultiSelect = useDiscourseStore((s) => s.extendMultiSelect);
  const pendingRelationSource = useDiscourseStore((s) => s.pendingRelationSource);
  const setRelationDraft = useDiscourseStore((s) => s.setRelationDraft);
  const relationDraft = useDiscourseStore((s) => s.relationDraft);
  const cancelRelation = useDiscourseStore((s) => s.cancelRelation);
  const splitPickUnitId = useDiscourseStore((s) => s.splitPickUnitId);
  const beginSplit = useDiscourseStore((s) => s.beginSplit);
  const splitUnit = useDiscourseStore((s) => s.splitUnit);
  const indentUnit = useDiscourseStore((s) => s.indentUnit);
  const outdentUnit = useDiscourseStore((s) => s.outdentUnit);
  const mergeWithPrevious = useDiscourseStore((s) => s.mergeWithPrevious);
  const labelUnit = useDiscourseStore((s) => s.labelUnit);
  const setUnitNotes = useDiscourseStore((s) => s.setUnitNotes);
  const updateRelation = useDiscourseStore((s) => s.updateRelation);
  const deleteRelation = useDiscourseStore((s) => s.deleteRelation);
  const undo = useDiscourseStore((s) => s.undo);
  const redo = useDiscourseStore((s) => s.redo);

  const rows = useMemo(() => discourseRows(doc), [doc]);
  const visibleRows = useMemo(() => rows.filter((r) => r.visible), [rows]);

  // Relations per unit (for the row badge + the inspector list).
  const relationsByUnit = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of doc.relations) {
      map.set(r.sourceUnitId, (map.get(r.sourceUnitId) ?? 0) + 1);
      map.set(r.targetUnitId, (map.get(r.targetUnitId) ?? 0) + 1);
    }
    return map;
  }, [doc.relations]);

  // --- arc geometry: measure the rendered blocks --------------------------------
  const contentRef = useRef<HTMLDivElement | null>(null);
  const unitEls = useRef(new Map<string, HTMLElement>());
  const registerEl = useCallback((unitId: string, el: HTMLElement | null) => {
    if (el) unitEls.current.set(unitId, el);
    else unitEls.current.delete(unitId);
  }, []);

  const [arcs, setArcs] = useState<ArcSpec[]>([]);
  const [contentHeight, setContentHeight] = useState(0);

  const measure = useCallback(() => {
    const content = contentRef.current;
    if (!content) return;
    const cTop = content.getBoundingClientRect().top;
    const endpoints = visibleRelationEndpoints(doc, rows);
    const mid = (id: string): number | null => {
      const el = unitEls.current.get(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.top - cTop + r.height / 2;
    };
    const next: ArcSpec[] = [];
    for (const e of endpoints) {
      const y1 = mid(e.sourceId);
      const y2 = mid(e.targetId);
      if (y1 == null || y2 == null) continue;
      next.push({ relation: e.relation, y1, y2 });
    }
    setArcs(next);
    setContentHeight(content.scrollHeight);
  }, [doc, rows]);

  useEffect(() => {
    measure();
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(content);
    return () => ro.disconnect();
  }, [measure, view]);

  // --- selection / edit interactions ---------------------------------------------
  const onUnitSelect = useCallback(
    (unitId: string, opts: { shift: boolean }) => {
      if (editing && pendingRelationSource && pendingRelationSource !== unitId) {
        setRelationDraft({ sourceUnitId: pendingRelationSource, targetUnitId: unitId });
        return;
      }
      if (editing && opts.shift) {
        extendMultiSelect(unitId);
        return;
      }
      select(selection.unitId === unitId ? {} : { unitId });
    },
    [editing, pendingRelationSource, selection.unitId, select, setRelationDraft, extendMultiSelect],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!editing) return;
      // Typing surfaces keep their native keys.
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return;
      if (e.key === 'Escape') {
        if (splitPickUnitId) beginSplit(null);
        else if (pendingRelationSource || relationDraft) cancelRelation();
        else select({});
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      const unitId = selection.unitId;
      if (!unitId) return;
      const unit = doc.units.find((u) => u.id === unitId);
      if (!unit) return;
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          if (canOutdent(doc, unitId)) outdentUnit(unitId);
        } else if (canIndent(doc, unitId)) {
          indentUnit(unitId);
        }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (unit.tokenIds.length > 1) beginSplit(splitPickUnitId === unitId ? null : unitId);
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const siblings = childUnits(doc, unit.parentId);
        const i = siblings.findIndex((u) => u.id === unitId);
        const prev = i > 0 ? siblings[i - 1] : undefined;
        if (prev && prev.tokenIds.length > 0 && unit.tokenIds.length > 0) {
          e.preventDefault();
          mergeWithPrevious(unitId);
          select({ unitId: prev.id });
        }
      }
    },
    [editing, doc, selection.unitId, splitPickUnitId, pendingRelationSource, relationDraft, beginSplit, cancelRelation, select, undo, redo, indentUnit, outdentUnit, mergeWithPrevious],
  );

  const selectedUnit = selection.unitId
    ? doc.units.find((u) => u.id === selection.unitId)
    : undefined;
  const selectedUnitRelations = selectedUnit
    ? doc.relations.filter(
        (r) => r.sourceUnitId === selectedUnit.id || r.targetUnitId === selectedUnit.id,
      )
    : [];
  const unitName = (id: string) => {
    const u = doc.units.find((x) => x.id === id);
    if (!u) return id;
    return u.label || formatRange(u.refStart, u.refEnd) || u.kind;
  };
  const [editingRelationId, setEditingRelationId] = useState<string | null>(null);
  const editingRelation = editingRelationId
    ? doc.relations.find((r) => r.id === editingRelationId)
    : undefined;
  // Markers available as evidence for the relation being edited (either end).
  const relationMarkers = editingRelation
    ? doc.markers.filter(
        (m) =>
          m.scopeUnitId === editingRelation.sourceUnitId ||
          m.scopeUnitId === editingRelation.targetUnitId,
      )
    : [];

  const multiSet = useMemo(() => new Set(multiSelected), [multiSelected]);

  return (
    <div className="discourse-view" onKeyDown={onKeyDown}>
      <div
        className="discourse-scroll"
        onClick={() => {
          if (pendingRelationSource) cancelRelation();
          else select({});
        }}
      >
        <div className="discourse-content" ref={contentRef} style={{ paddingLeft: view.showRelations ? ARC_GUTTER : 16 }}>
          {view.showRelations && (
            <div className="discourse-gutter" style={{ width: ARC_GUTTER }}>
              <DiscourseRelationLayer
                arcs={arcs}
                height={contentHeight}
                gutter={ARC_GUTTER}
                selectedRelationId={selection.relationId}
                onSelect={(relationId) => select({ relationId })}
              />
            </div>
          )}
          <div role="list" aria-label={`Discourse units for ${doc.title}`}>
            {visibleRows.map((row) => (
              <DiscourseUnitBlock
                key={row.unit.id}
                row={row}
                view={view}
                selected={selection.unitId === row.unit.id}
                multiSelected={multiSet.has(row.unit.id)}
                relateTarget={
                  editing && !!pendingRelationSource && pendingRelationSource !== row.unit.id
                }
                splitPicking={editing && splitPickUnitId === row.unit.id}
                relationCount={relationsByUnit.get(row.unit.id) ?? 0}
                registerEl={registerEl}
                onSelect={onUnitSelect}
                onToggleCollapsed={(unitId, collapsed) => setUnitCollapsed(unitId, collapsed)}
                onTokenSplit={(unitId, tokenId) => {
                  splitUnit(unitId, tokenId);
                  beginSplit(null);
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {editing && relationDraft && <DiscourseRelationPicker />}

      {selectedUnit && (
        <aside className="discourse-inspector" aria-label="Selected unit details">
          <div className="discourse-inspector-head">
            <strong>
              {selectedUnit.label || formatRange(selectedUnit.refStart, selectedUnit.refEnd) || selectedUnit.kind}
            </strong>
            <span className="discourse-inspector-meta">
              {selectedUnit.kind}
              {selectedUnit.refStart && ` · ${formatRange(selectedUnit.refStart, selectedUnit.refEnd)}`}
              {` · ${selectedUnit.provenance.source === 'manual' ? 'your structure' : 'from source boundaries'}`}
            </span>
            <button className="mini" onClick={() => select({})} aria-label="Close details">
              ✕
            </button>
          </div>

          {editing && (
            <div className="discourse-inspector-edit">
              <label className="field">
                <span>Label</span>
                <input
                  key={selectedUnit.id}
                  defaultValue={selectedUnit.label ?? ''}
                  placeholder="A, B′, “Household code”…"
                  onBlur={(e) => {
                    if (e.target.value !== (selectedUnit.label ?? '')) labelUnit(selectedUnit.id, e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                />
              </label>
              <label className="field">
                <span>Notes</span>
                <textarea
                  key={`n_${selectedUnit.id}`}
                  defaultValue={selectedUnit.notes ?? ''}
                  rows={2}
                  placeholder="Observations about this unit…"
                  onBlur={(e) => {
                    if (e.target.value !== (selectedUnit.notes ?? '')) setUnitNotes(selectedUnit.id, e.target.value);
                  }}
                />
              </label>
            </div>
          )}
          {!editing && selectedUnit.notes && (
            <p className="discourse-inspector-notes">{selectedUnit.notes}</p>
          )}

          {selectedUnitRelations.length > 0 ? (
            <ul className="discourse-inspector-relations" aria-label="Relations for this unit">
              {selectedUnitRelations.map((r) => (
                <li key={r.id}>
                  <button
                    className={`discourse-rel-item${selection.relationId === r.id ? ' selected' : ''}`}
                    onClick={() => select({ unitId: selectedUnit.id, relationId: r.id })}
                  >
                    <span className="discourse-rel-type">{r.label || relationTypeLabel(r.type)}</span>{' '}
                    {unitName(r.sourceUnitId)} → {unitName(r.targetUnitId)}
                    {r.confidence ? ` (${r.confidence})` : ''}
                  </button>
                  {editing && (
                    <>
                      <button
                        className="mini"
                        title="Edit this relation"
                        onClick={() => setEditingRelationId(editingRelationId === r.id ? null : r.id)}
                      >
                        {editingRelationId === r.id ? 'Close' : 'Edit'}
                      </button>
                      <button className="mini reject" title="Delete this relation" onClick={() => deleteRelation(r.id)}>
                        Delete
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="discourse-inspector-notes muted">
              No relations touch this unit yet.
              {editing && ' Use “Relate →” in the toolbar to draw one.'}
            </p>
          )}

          {editing && editingRelation && (
            <div className="discourse-relation-editor" aria-label="Relation editor">
              <label className="field">
                <span>Type</span>
                <select
                  value={editingRelation.type}
                  onChange={(e) => updateRelation(editingRelation.id, { type: e.target.value as typeof editingRelation.type })}
                >
                  {DiscourseRelationTypeSchema.options.map((t) => (
                    <option key={t} value={t}>
                      {relationTypeLabel(t)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Label</span>
                <input
                  key={editingRelation.id}
                  defaultValue={editingRelation.label ?? ''}
                  onBlur={(e) => updateRelation(editingRelation.id, { label: e.target.value.trim() || undefined })}
                />
              </label>
              <label className="field">
                <span>Confidence</span>
                <select
                  value={editingRelation.confidence ?? ''}
                  onChange={(e) =>
                    updateRelation(editingRelation.id, {
                      confidence: (e.target.value || undefined) as 'high' | 'medium' | 'low' | undefined,
                    })
                  }
                >
                  <option value="">—</option>
                  <option value="high">high</option>
                  <option value="medium">medium</option>
                  <option value="low">low</option>
                </select>
              </label>
              <label className="field">
                <span>Notes</span>
                <textarea
                  key={`rn_${editingRelation.id}`}
                  defaultValue={editingRelation.notes ?? ''}
                  rows={2}
                  onBlur={(e) => updateRelation(editingRelation.id, { notes: e.target.value.trim() || undefined })}
                />
              </label>
              {relationMarkers.length > 0 && (
                <fieldset className="discourse-relation-markers">
                  <legend>Marker evidence</legend>
                  {relationMarkers.map((m) => {
                    const attached = editingRelation.markerIds?.includes(m.id) ?? false;
                    return (
                      <label key={m.id} className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={attached}
                          onChange={(e) => {
                            const cur = editingRelation.markerIds ?? [];
                            const next = e.target.checked
                              ? [...cur, m.id]
                              : cur.filter((id) => id !== m.id);
                            updateRelation(editingRelation.id, { markerIds: next.length ? next : undefined });
                          }}
                        />
                        <span className="greek">{m.surface}</span> <span>({m.ref})</span>
                      </label>
                    );
                  })}
                </fieldset>
              )}
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
