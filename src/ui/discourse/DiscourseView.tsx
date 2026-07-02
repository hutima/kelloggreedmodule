import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDiscourseStore } from '@/state';
import type { DiscourseDocument } from '@/domain/schema';
import {
  discourseRows,
  formatRange,
  relationTypeLabel,
  visibleRelationEndpoints,
} from '@/domain/discourse';
import { DiscourseUnitBlock } from './DiscourseUnitBlock';
import { DiscourseRelationLayer, type ArcSpec } from './DiscourseRelationLayer';

/** Width of the left gutter the relation arcs live in. */
const ARC_GUTTER = 116;

/**
 * The discourse outline itself: a scrollable vertical list of unit blocks
 * (indented by outline depth) with an SVG relation-arc overlay in the left
 * gutter and a textual inspector for the selected unit. Read-only here —
 * editing affordances mount on top of this in Edit mode.
 */
export function DiscourseView({ doc }: { doc: DiscourseDocument }) {
  const view = useDiscourseStore((s) => s.view);
  const selection = useDiscourseStore((s) => s.selection);
  const select = useDiscourseStore((s) => s.select);
  const setUnitCollapsed = useDiscourseStore((s) => s.setUnitCollapsed);

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

  return (
    <div className="discourse-view">
      <div
        className="discourse-scroll"
        onClick={() => select({})}
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
                relationCount={relationsByUnit.get(row.unit.id) ?? 0}
                registerEl={registerEl}
                onSelect={(unitId) => select({ unitId })}
                onToggleCollapsed={(unitId, collapsed) => setUnitCollapsed(unitId, collapsed)}
              />
            ))}
          </div>
        </div>
      </div>

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
          {selectedUnit.notes && <p className="discourse-inspector-notes">{selectedUnit.notes}</p>}
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
                </li>
              ))}
            </ul>
          ) : (
            <p className="discourse-inspector-notes muted">No relations touch this unit yet.</p>
          )}
        </aside>
      )}
    </div>
  );
}
