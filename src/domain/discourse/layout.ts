import type {
  DiscourseDocument,
  DiscourseMarker,
  DiscourseRelation,
  DiscourseToken,
  DiscourseUnit,
} from '@/domain/schema';
import { outlineOrder } from './mutations';

/**
 * DISCOURSE VIEW-MODEL — pure helpers that turn a `DiscourseDocument` into the
 * flat row list the HTML renderer draws. Deliberately NOT the geometric
 * primitive pipeline the syntax modes share: discourse blocks are readable
 * text units, not word-level geometry, so the view is plain HTML with an SVG
 * arc overlay. All layout decisions that need the DOM (arc y-positions) happen
 * in the components; everything decidable from the model alone lives here.
 */

export interface DiscourseRow {
  unit: DiscourseUnit;
  /** Direct children exist (renders the collapse chevron). */
  hasChildren: boolean;
  /** False when an ancestor is collapsed (the row is not rendered). */
  visible: boolean;
  /** The unit's tokens in reading order (empty for containers). */
  tokens: DiscourseToken[];
  /** Marker chips scoped to this unit. */
  markers: DiscourseMarker[];
}

/** The flattened outline: every unit in display order, with visibility. */
export function discourseRows(doc: DiscourseDocument): DiscourseRow[] {
  const tokenById = new Map(doc.tokens.map((t) => [t.id, t]));
  const markersByUnit = new Map<string, DiscourseMarker[]>();
  for (const m of doc.markers) {
    if (!m.scopeUnitId) continue;
    (markersByUnit.get(m.scopeUnitId) ?? markersByUnit.set(m.scopeUnitId, []).get(m.scopeUnitId)!).push(m);
  }
  const parents = new Set(doc.units.map((u) => u.parentId).filter(Boolean) as string[]);
  const collapsed = new Set(doc.units.filter((u) => u.collapsed).map((u) => u.id));
  const byId = new Map(doc.units.map((u) => [u.id, u]));

  const hiddenByAncestor = (u: DiscourseUnit): boolean => {
    let cur = u.parentId;
    let guard = 0;
    while (cur && guard++ <= doc.units.length) {
      if (collapsed.has(cur)) return true;
      cur = byId.get(cur)?.parentId;
    }
    return false;
  };

  return outlineOrder(doc).map((unit) => ({
    unit,
    hasChildren: parents.has(unit.id),
    visible: !hiddenByAncestor(unit),
    tokens: unit.tokenIds.map((tid) => tokenById.get(tid)).filter(Boolean) as DiscourseToken[],
    markers: markersByUnit.get(unit.id) ?? [],
  }));
}

/**
 * The relations to draw, restricted to endpoints that are both VISIBLE rows
 * (a relation into a collapsed subtree re-anchors to the nearest visible
 * ancestor, so the arc never simply disappears).
 */
export function visibleRelationEndpoints(
  doc: DiscourseDocument,
  rows: DiscourseRow[],
): { relation: DiscourseRelation; sourceId: string; targetId: string }[] {
  const visible = new Set(rows.filter((r) => r.visible).map((r) => r.unit.id));
  const byId = new Map(doc.units.map((u) => [u.id, u]));
  const anchor = (id: string): string | null => {
    let cur: string | undefined = id;
    let guard = 0;
    while (cur && guard++ <= doc.units.length) {
      if (visible.has(cur)) return cur;
      cur = byId.get(cur)?.parentId;
    }
    return null;
  };
  const out: { relation: DiscourseRelation; sourceId: string; targetId: string }[] = [];
  for (const relation of doc.relations) {
    const sourceId = anchor(relation.sourceUnitId);
    const targetId = anchor(relation.targetUnitId);
    if (!sourceId || !targetId || sourceId === targetId) continue;
    out.push({ relation, sourceId, targetId });
  }
  return out;
}

/** Human label for a relation type (arc labels, relation lists). */
export function relationTypeLabel(type: DiscourseRelation['type']): string {
  const labels: Record<DiscourseRelation['type'], string> = {
    coordinate: 'coordinate',
    series: 'series',
    contrast: 'contrast',
    ground: 'ground',
    inference: 'inference',
    result: 'result',
    purpose: 'purpose',
    condition: 'condition',
    concession: 'concession',
    elaboration: 'elaboration',
    explanation: 'explanation',
    quotation: 'quotation',
    inclusio: 'inclusio',
    parallel: 'parallel',
    chiasm: 'chiasm',
    custom: 'custom',
    unknown: 'unknown',
  };
  return labels[type] ?? type;
}

/** Arc colour per relation family (mirrors the app's muted palette style). */
export function relationColor(type: DiscourseRelation['type']): string {
  switch (type) {
    case 'ground':
    case 'explanation':
    case 'elaboration':
      return '#8a5d3b'; // warm brown — support
    case 'inference':
    case 'result':
    case 'purpose':
      return '#2f6f4f'; // green — consequence
    case 'contrast':
    case 'concession':
      return '#a13d3d'; // red — opposition
    case 'condition':
      return '#7b6a2f'; // olive
    case 'parallel':
    case 'chiasm':
    case 'inclusio':
      return '#4a5f8a'; // blue — structure
    case 'quotation':
      return '#6a4a8a'; // purple
    case 'coordinate':
    case 'series':
      return '#55606c'; // slate
    default:
      return '#777f88';
  }
}

/** Human label for a marker's suggested function, phrased as a HINT. */
export function markerFunctionLabel(fn: DiscourseMarker['suggestedFunction']): string {
  switch (fn) {
    case 'additive': return 'possible addition/series';
    case 'contrastive': return 'possible contrast';
    case 'causal': return 'possible ground/explanation';
    case 'inferential': return 'possible inference/result';
    case 'resultative': return 'possible result';
    case 'purpose': return 'possible purpose';
    case 'conditional': return 'possible condition';
    case 'temporal': return 'possible temporal transition';
    case 'emphatic': return 'possible emphasis';
    case 'development': return 'possible development/transition';
    case 'content': return 'possible content/ground';
    default: return 'discourse marker';
  }
}
