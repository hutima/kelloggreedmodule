import { makeId } from '@/domain/model';
import type {
  DiscourseDocument,
  DiscourseRelation,
  DiscourseRelationType,
  DiscourseSuggestion,
  DiscourseUnit,
  DiscourseUnitKind,
  Provenance,
} from '@/domain/schema';
import { compareRefs } from './refs';

/**
 * PURE DISCOURSE MUTATIONS — every edit Discourse mode offers, as pure
 * functions `(doc, …) → doc`. Nothing here touches storage, React, or —
 * critically — any `KrDocument`: discourse edits never mutate syntax.
 *
 * Conventions:
 *   - invalid requests are NO-OPS (the same doc object is returned), so the
 *     UI can call optimistically and check `result !== doc` for "did it apply";
 *   - every applied edit is stamped `manual` provenance and bumps `updatedAt`;
 *   - `parentId`/`depth`/`order` are kept consistent by re-normalizing the
 *     affected sibling groups (never a whole-document regeneration);
 *   - user-created entities get stable local ids (`makeId`) that persist in
 *     patches.
 */

const MANUAL: Provenance = { source: 'manual', confidence: 'high' };

// --- shared helpers -------------------------------------------------------------

function unitById(doc: DiscourseDocument, id: string): DiscourseUnit | undefined {
  return doc.units.find((u) => u.id === id);
}

/** Direct children of `parentId` (undefined = top level), sorted by order. */
export function childUnits(doc: DiscourseDocument, parentId: string | undefined): DiscourseUnit[] {
  return doc.units.filter((u) => u.parentId === parentId).sort((a, b) => a.order - b.order);
}

/** Units in outline (display) order: depth-first by sibling order. */
export function outlineOrder(doc: DiscourseDocument): DiscourseUnit[] {
  const out: DiscourseUnit[] = [];
  const walk = (parentId: string | undefined) => {
    for (const u of childUnits(doc, parentId)) {
      out.push(u);
      walk(u.id);
    }
  };
  walk(undefined);
  return out;
}

/** Text-bearing units (the readable blocks) in outline order. */
export function leafUnits(doc: DiscourseDocument): DiscourseUnit[] {
  return outlineOrder(doc).filter((u) => u.tokenIds.length > 0);
}

function touchDoc(doc: DiscourseDocument, units: DiscourseUnit[], now?: string): DiscourseDocument {
  return { ...doc, units, updatedAt: now ?? new Date().toISOString() };
}

/** Re-assign 0-based orders within one sibling group, preserving order. */
function resequence(units: DiscourseUnit[], parentId: string | undefined): DiscourseUnit[] {
  const siblings = units
    .filter((u) => u.parentId === parentId)
    .sort((a, b) => a.order - b.order)
    .map((u) => u.id);
  const orderOf = new Map(siblings.map((id, i) => [id, i]));
  return units.map((u) => {
    const o = orderOf.get(u.id);
    return o !== undefined && o !== u.order ? { ...u, order: o } : u;
  });
}

/** Recompute every unit's depth from its parent chain (roots are depth 0). */
function recomputeDepths(units: DiscourseUnit[]): DiscourseUnit[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const depthOf = (u: DiscourseUnit, guard = 0): number => {
    if (!u.parentId || guard > units.length) return 0;
    const parent = byId.get(u.parentId);
    return parent ? depthOf(parent, guard + 1) + 1 : 0;
  };
  return units.map((u) => {
    const d = depthOf(u);
    return d !== u.depth ? { ...u, depth: d } : u;
  });
}

/** Would setting `childId`'s parent to `parentId` create a cycle? */
function wouldCycle(doc: DiscourseDocument, childId: string, parentId: string | undefined): boolean {
  let cur = parentId;
  let guard = 0;
  while (cur && guard++ <= doc.units.length) {
    if (cur === childId) return true;
    cur = unitById(doc, cur)?.parentId;
  }
  return false;
}

/** Ref span of a token-id list, via the document's token table. */
function refSpanOf(doc: DiscourseDocument, tokenIds: string[]): { start: string; end: string } {
  const byId = new Map(doc.tokens.map((t) => [t.id, t]));
  let start = '';
  let end = '';
  for (const tid of tokenIds) {
    const ref = byId.get(tid)?.ref ?? '';
    if (!ref) continue;
    if (!start || compareRefs(ref, start) < 0) start = ref;
    if (!end || compareRefs(ref, end) > 0) end = ref;
  }
  return { start, end };
}

/** Distinct source doc ids of a token-id list, in first-seen order. */
function sourceDocsOf(doc: DiscourseDocument, tokenIds: string[]): string[] {
  const byId = new Map(doc.tokens.map((t) => [t.id, t]));
  const out: string[] = [];
  for (const tid of tokenIds) {
    const sd = byId.get(tid)?.sourceDocId;
    if (sd && !out.includes(sd)) out.push(sd);
  }
  return out;
}

// --- labels / notes / collapse ----------------------------------------------------

export function labelDiscourseUnit(
  doc: DiscourseDocument,
  unitId: string,
  label: string,
  now?: string,
): DiscourseDocument {
  const unit = unitById(doc, unitId);
  if (!unit) return doc;
  const trimmed = label.trim();
  const units = doc.units.map((u) =>
    u.id === unitId ? { ...u, label: trimmed || undefined, provenance: MANUAL } : u,
  );
  return touchDoc(doc, units, now);
}

export function setDiscourseUnitNotes(
  doc: DiscourseDocument,
  unitId: string,
  notes: string,
  now?: string,
): DiscourseDocument {
  if (!unitById(doc, unitId)) return doc;
  const units = doc.units.map((u) =>
    u.id === unitId ? { ...u, notes: notes.trim() || undefined, provenance: MANUAL } : u,
  );
  return touchDoc(doc, units, now);
}

function setCollapsed(doc: DiscourseDocument, unitId: string, collapsed: boolean, now?: string) {
  if (!unitById(doc, unitId)) return doc;
  const units = doc.units.map((u) => (u.id === unitId ? { ...u, collapsed } : u));
  return touchDoc(doc, units, now);
}

export function collapseDiscourseUnit(doc: DiscourseDocument, unitId: string, now?: string) {
  return setCollapsed(doc, unitId, true, now);
}

export function expandDiscourseUnit(doc: DiscourseDocument, unitId: string, now?: string) {
  return setCollapsed(doc, unitId, false, now);
}

// --- breaks (split / merge) --------------------------------------------------------

/**
 * Split a text unit in two AT a token: `atTokenId` becomes the first token of
 * the new second unit. The original keeps its id (so relations/labels stay
 * put); the second half gets a deterministic id derived from the (unique,
 * stable) boundary token. No-op if the token isn't strictly inside the unit.
 */
export function splitDiscourseUnit(
  doc: DiscourseDocument,
  unitId: string,
  atTokenId: string,
  now?: string,
): DiscourseDocument {
  const unit = unitById(doc, unitId);
  if (!unit) return doc;
  const idx = unit.tokenIds.indexOf(atTokenId);
  if (idx <= 0) return doc; // not found, or would leave the first half empty
  const firstIds = unit.tokenIds.slice(0, idx);
  const secondIds = unit.tokenIds.slice(idx);
  const firstSpan = refSpanOf(doc, firstIds);
  const secondSpan = refSpanOf(doc, secondIds);
  const second: DiscourseUnit = {
    ...unit,
    id: `du_s_${atTokenId}`,
    label: undefined,
    notes: undefined,
    tokenIds: secondIds,
    sourceDocIds: sourceDocsOf(doc, secondIds),
    refStart: secondSpan.start,
    refEnd: secondSpan.end,
    order: unit.order + 1,
    provenance: { ...MANUAL, reason: 'User-inserted discourse break.' },
  };
  if (unitById(doc, second.id)) return doc; // split already exists at this token
  let units = doc.units.map((u) =>
    u.id === unitId
      ? {
          ...u,
          tokenIds: firstIds,
          sourceDocIds: sourceDocsOf(doc, firstIds),
          refStart: firstSpan.start,
          refEnd: firstSpan.end,
          provenance: { ...MANUAL, reason: 'User-inserted discourse break.' },
        }
      : u.parentId === unit.parentId && u.order > unit.order
        ? { ...u, order: u.order + 1 }
        : u,
  );
  units = [...units, second];
  // Markers scoped to the original re-scope to whichever half owns their token.
  const secondSet = new Set(secondIds);
  const markers = doc.markers.map((m) =>
    m.scopeUnitId === unitId && secondSet.has(m.tokenId) ? { ...m, scopeUnitId: second.id } : m,
  );
  return { ...touchDoc(doc, resequence(units, unit.parentId), now), markers };
}

/** `createDiscourseBreak` is the user-facing name for a token-boundary split. */
export const createDiscourseBreak = splitDiscourseUnit;

/**
 * Merge two ADJACENT sibling text units (b directly after a). `a` absorbs
 * `b`'s tokens/refs/children; relations and marker scopes re-point to `a`.
 */
export function mergeAdjacentDiscourseUnits(
  doc: DiscourseDocument,
  aId: string,
  bId: string,
  now?: string,
): DiscourseDocument {
  const a = unitById(doc, aId);
  const b = unitById(doc, bId);
  if (!a || !b || a.id === b.id) return doc;
  if (a.parentId !== b.parentId) return doc;
  if (a.tokenIds.length === 0 || b.tokenIds.length === 0) return doc;
  const siblings = childUnits(doc, a.parentId);
  const ai = siblings.findIndex((u) => u.id === aId);
  if (ai < 0 || siblings[ai + 1]?.id !== bId) return doc;

  const tokenIds = [...a.tokenIds, ...b.tokenIds];
  const span = refSpanOf(doc, tokenIds);
  const merged: DiscourseUnit = {
    ...a,
    tokenIds,
    sourceDocIds: sourceDocsOf(doc, tokenIds),
    refStart: span.start,
    refEnd: span.end,
    provenance: { ...MANUAL, reason: 'User-merged discourse units.' },
  };
  let units = doc.units
    .filter((u) => u.id !== bId)
    .map((u) => {
      if (u.id === aId) return merged;
      if (u.parentId === bId) return { ...u, parentId: aId }; // re-home b's children
      return u;
    });
  units = recomputeDepths(resequence(units, a.parentId));
  const relations = doc.relations
    .map((r) => ({
      ...r,
      sourceUnitId: r.sourceUnitId === bId ? aId : r.sourceUnitId,
      targetUnitId: r.targetUnitId === bId ? aId : r.targetUnitId,
    }))
    // Merging can collapse a relation onto itself — drop those.
    .filter((r) => r.sourceUnitId !== r.targetUnitId);
  const markers = doc.markers.map((m) =>
    m.scopeUnitId === bId ? { ...m, scopeUnitId: aId } : m,
  );
  return { ...touchDoc(doc, units, now), relations, markers };
}

/** Remove the break BEFORE `unitId`: merge it into its previous sibling. */
export function removeDiscourseBreak(
  doc: DiscourseDocument,
  unitId: string,
  now?: string,
): DiscourseDocument {
  const unit = unitById(doc, unitId);
  if (!unit) return doc;
  const siblings = childUnits(doc, unit.parentId);
  const i = siblings.findIndex((u) => u.id === unitId);
  if (i <= 0) return doc;
  return mergeAdjacentDiscourseUnits(doc, siblings[i - 1]!.id, unitId, now);
}

// --- indentation / outline shape ---------------------------------------------------

/** Whether Tab on this unit can do anything (a previous sibling exists). */
export function canIndent(doc: DiscourseDocument, unitId: string): boolean {
  const unit = unitById(doc, unitId);
  if (!unit) return false;
  const siblings = childUnits(doc, unit.parentId);
  return siblings.findIndex((u) => u.id === unitId) > 0;
}

/**
 * Indent: the unit becomes the LAST child of its previous sibling. An
 * interpretive outline move — never a syntactic claim.
 */
export function indentDiscourseUnit(
  doc: DiscourseDocument,
  unitId: string,
  now?: string,
): DiscourseDocument {
  const unit = unitById(doc, unitId);
  if (!unit) return doc;
  const siblings = childUnits(doc, unit.parentId);
  const i = siblings.findIndex((u) => u.id === unitId);
  if (i <= 0) return doc;
  const newParent = siblings[i - 1]!;
  if (wouldCycle(doc, unitId, newParent.id)) return doc;
  const newOrder = childUnits(doc, newParent.id).length;
  let units = doc.units.map((u) =>
    u.id === unitId ? { ...u, parentId: newParent.id, order: newOrder } : u,
  );
  units = recomputeDepths(resequence(units, unit.parentId));
  return touchDoc(doc, units, now);
}

export function canOutdent(doc: DiscourseDocument, unitId: string): boolean {
  return Boolean(unitById(doc, unitId)?.parentId);
}

/**
 * Outdent: the unit moves up one level, inserted directly AFTER its old
 * parent among the grandparent's children.
 */
export function outdentDiscourseUnit(
  doc: DiscourseDocument,
  unitId: string,
  now?: string,
): DiscourseDocument {
  const unit = unitById(doc, unitId);
  if (!unit?.parentId) return doc;
  const parent = unitById(doc, unit.parentId);
  if (!parent) return doc;
  const grandId = parent.parentId;
  let units = doc.units.map((u) => {
    if (u.id === unitId) return { ...u, parentId: grandId, order: parent.order + 0.5 };
    return u;
  });
  units = recomputeDepths(resequence(resequence(units, grandId), parent.id));
  return touchDoc(doc, units, now);
}

/** Move a unit up/down among its siblings (delta of -1 or +1). */
export function moveDiscourseUnit(
  doc: DiscourseDocument,
  unitId: string,
  delta: number,
  now?: string,
): DiscourseDocument {
  const unit = unitById(doc, unitId);
  if (!unit || (delta !== 1 && delta !== -1)) return doc;
  const siblings = childUnits(doc, unit.parentId);
  const i = siblings.findIndex((u) => u.id === unitId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= siblings.length) return doc;
  const other = siblings[j]!;
  const units = doc.units.map((u) => {
    if (u.id === unitId) return { ...u, order: other.order };
    if (u.id === other.id) return { ...u, order: unit.order };
    return u;
  });
  return touchDoc(doc, units, now);
}

/**
 * Wrap ADJACENT sibling units in a new interpretive parent unit ("Household
 * code", "A", "Ground"…). The new unit is a pure container (no tokens of its
 * own); its ref span covers its members. Returns the doc unchanged if the
 * units are not adjacent siblings.
 */
export function nestDiscourseUnits(
  doc: DiscourseDocument,
  unitIds: string[],
  opts: { label?: string; kind?: DiscourseUnitKind; id?: string } = {},
  now?: string,
): DiscourseDocument {
  if (!unitIds.length) return doc;
  const members = unitIds.map((id) => unitById(doc, id));
  if (members.some((m) => !m)) return doc;
  const first = members[0]!;
  const parentId = first.parentId;
  if (!members.every((m) => m!.parentId === parentId)) return doc;
  const siblings = childUnits(doc, parentId);
  const start = siblings.findIndex((u) => u.id === first.id);
  if (start < 0) return doc;
  for (let k = 0; k < unitIds.length; k++) {
    if (siblings[start + k]?.id !== unitIds[k]) return doc; // must be contiguous, in order
  }
  const refStart = members
    .map((m) => m!.refStart)
    .filter(Boolean)
    .sort(compareRefs)[0] ?? '';
  const refEnd = members
    .map((m) => m!.refEnd)
    .filter(Boolean)
    .sort(compareRefs)
    .pop() ?? '';
  const wrapper: DiscourseUnit = {
    id: opts.id ?? makeId('du'),
    label: opts.label?.trim() || undefined,
    kind: opts.kind ?? 'custom',
    refStart,
    refEnd,
    tokenIds: [],
    sourceDocIds: [],
    parentId,
    order: first.order,
    depth: first.depth,
    provenance: { ...MANUAL, reason: 'User-created grouping.' },
  };
  const memberSet = new Set(unitIds);
  let units = doc.units.map((u) =>
    memberSet.has(u.id) ? { ...u, parentId: wrapper.id, order: unitIds.indexOf(u.id) } : u,
  );
  units = [...units, wrapper];
  units = recomputeDepths(resequence(units, parentId));
  return touchDoc(doc, units, now);
}

/**
 * Unwrap a CONTAINER unit (no tokens): its children take its place among its
 * siblings; relations touching the container are dropped (they no longer have
 * a referent).
 */
export function unwrapDiscourseUnit(
  doc: DiscourseDocument,
  unitId: string,
  now?: string,
): DiscourseDocument {
  const unit = unitById(doc, unitId);
  if (!unit || unit.tokenIds.length > 0) return doc;
  const children = childUnits(doc, unitId);
  if (!children.length) return doc;
  const step = 1 / (children.length + 1);
  let units = doc.units
    .filter((u) => u.id !== unitId)
    .map((u) => {
      const k = children.findIndex((c) => c.id === u.id);
      if (k >= 0) return { ...u, parentId: unit.parentId, order: unit.order + step * (k + 1) };
      return u;
    });
  units = recomputeDepths(resequence(units, unit.parentId));
  const relations = doc.relations.filter(
    (r) => r.sourceUnitId !== unitId && r.targetUnitId !== unitId,
  );
  const suggestions = doc.suggestions.filter((s) => !s.unitIds.includes(unitId));
  return { ...touchDoc(doc, units, now), relations, suggestions };
}

// --- relations ----------------------------------------------------------------------

export function addDiscourseRelation(
  doc: DiscourseDocument,
  input: {
    sourceUnitId: string;
    targetUnitId: string;
    type: DiscourseRelationType;
    label?: string;
    markerIds?: string[];
    confidence?: 'high' | 'medium' | 'low';
    notes?: string;
    id?: string;
    provenance?: Provenance;
  },
  now?: string,
): DiscourseDocument {
  if (!unitById(doc, input.sourceUnitId) || !unitById(doc, input.targetUnitId)) return doc;
  if (input.sourceUnitId === input.targetUnitId) return doc;
  const relation: DiscourseRelation = {
    id: input.id ?? makeId('dr'),
    sourceUnitId: input.sourceUnitId,
    targetUnitId: input.targetUnitId,
    type: input.type,
    label: input.label?.trim() || undefined,
    markerIds: input.markerIds?.length ? input.markerIds : undefined,
    confidence: input.confidence,
    notes: input.notes,
    provenance: input.provenance ?? { ...MANUAL, reason: 'User-authored discourse relation.' },
  };
  const others = doc.relations.filter((r) => r.id !== relation.id);
  return {
    ...doc,
    relations: [...others, relation],
    updatedAt: now ?? new Date().toISOString(),
  };
}

export function updateDiscourseRelation(
  doc: DiscourseDocument,
  relationId: string,
  patch: Partial<Omit<DiscourseRelation, 'id'>>,
  now?: string,
): DiscourseDocument {
  if (!doc.relations.some((r) => r.id === relationId)) return doc;
  const relations = doc.relations.map((r) =>
    r.id === relationId ? { ...r, ...patch, id: r.id, provenance: patch.provenance ?? MANUAL } : r,
  );
  return { ...doc, relations, updatedAt: now ?? new Date().toISOString() };
}

export function deleteDiscourseRelation(
  doc: DiscourseDocument,
  relationId: string,
  now?: string,
): DiscourseDocument {
  if (!doc.relations.some((r) => r.id === relationId)) return doc;
  return {
    ...doc,
    relations: doc.relations.filter((r) => r.id !== relationId),
    updatedAt: now ?? new Date().toISOString(),
  };
}

/** Assign (or clear) the unit a marker scopes over. */
export function assignMarkerScope(
  doc: DiscourseDocument,
  markerId: string,
  unitId: string | undefined,
  now?: string,
): DiscourseDocument {
  if (!doc.markers.some((m) => m.id === markerId)) return doc;
  if (unitId && !unitById(doc, unitId)) return doc;
  const markers = doc.markers.map((m) =>
    m.id === markerId ? { ...m, scopeUnitId: unitId, provenance: MANUAL } : m,
  );
  return { ...doc, markers, updatedAt: now ?? new Date().toISOString() };
}

// --- suggestions ---------------------------------------------------------------------

/** The relation type an accepted suggestion materializes as, if any. */
const SUGGESTION_RELATION: Partial<Record<DiscourseSuggestion['type'], DiscourseRelationType>> = {
  possibleGround: 'ground',
  possibleContrast: 'contrast',
  possibleInference: 'inference',
  possibleSeries: 'series',
  possibleParallel: 'parallel',
  possibleInclusio: 'inclusio',
  possibleChiasm: 'chiasm',
};

/**
 * Accept a suggestion: mark it accepted and — when it is relation-shaped and
 * names two units — materialize an ordinary EDITABLE manual relation (stamped
 * `confirmed`, keeping the hint's confidence). This is the only path from
 * hint to structure; nothing is ever committed silently.
 */
export function acceptDiscourseSuggestion(
  doc: DiscourseDocument,
  suggestionId: string,
  now?: string,
): DiscourseDocument {
  const suggestion = doc.suggestions.find((s) => s.id === suggestionId);
  if (!suggestion || suggestion.accepted) return doc;
  let next: DiscourseDocument = {
    ...doc,
    suggestions: doc.suggestions.map((s) =>
      s.id === suggestionId ? { ...s, accepted: true } : s,
    ),
    updatedAt: now ?? new Date().toISOString(),
  };
  const relType = SUGGESTION_RELATION[suggestion.type];
  if (relType && suggestion.unitIds.length >= 2) {
    next = addDiscourseRelation(
      next,
      {
        id: `dr_${suggestion.id}`,
        sourceUnitId: suggestion.unitIds[0]!,
        targetUnitId: suggestion.unitIds[1]!,
        type: relType,
        label: suggestion.label,
        markerIds: suggestion.markerIds,
        confidence: suggestion.confidence,
        provenance: {
          source: 'confirmed',
          confidence: suggestion.confidence,
          reason: suggestion.explanation,
        },
      },
      now,
    );
  }
  return next;
}

/** Reject (dismiss) a suggestion — it simply disappears; nothing else changes. */
export function rejectDiscourseSuggestion(
  doc: DiscourseDocument,
  suggestionId: string,
  now?: string,
): DiscourseDocument {
  if (!doc.suggestions.some((s) => s.id === suggestionId)) return doc;
  return {
    ...doc,
    suggestions: doc.suggestions.filter((s) => s.id !== suggestionId),
    updatedAt: now ?? new Date().toISOString(),
  };
}
