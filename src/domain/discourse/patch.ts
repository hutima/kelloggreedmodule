import type {
  DiscourseDocument,
  DiscourseMarker,
  DiscoursePatch,
  DiscoursePatchBase,
  DiscourseRelation,
  DiscourseUnit,
} from '@/domain/schema';
import { DiscoursePatchSchema } from '@/domain/schema';
import { hashDiscourseBase } from './build';

/**
 * DISCOURSE PATCH MANAGER — mirrors the syntax patch manager
 * (`src/domain/patch/manager.ts`) for the discourse layer: user edits are
 * stored as a COMPACT DIFF against the generated base document, never as a
 * duplicated copy. `applyDiscoursePatch` is pure and idempotent; the base is
 * never mutated. Discourse patches live in their own namespace and never mix
 * with syntax patches, sermon prep, or notes.
 */

function jsonEqual(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

interface EntityOps<T> {
  upsert: T[];
  update: Record<string, Partial<T>>;
  remove: string[];
}

function applyEntityOps<T extends { id: string }>(base: T[], ops: EntityOps<T>): T[] {
  const map = new Map(base.map((e) => [e.id, e]));
  const order = base.map((e) => e.id);
  for (const [id, patch] of Object.entries(ops.update)) {
    const existing = map.get(id);
    if (existing) map.set(id, { ...existing, ...patch } as T);
  }
  for (const entity of ops.upsert) {
    if (!map.has(entity.id)) order.push(entity.id);
    map.set(entity.id, entity);
  }
  const removed = new Set(ops.remove);
  return order.filter((id) => !removed.has(id) && map.has(id)).map((id) => map.get(id)!);
}

function diffEntities<T extends { id: string }>(base: T[], edited: T[]): EntityOps<T> {
  const baseMap = new Map(base.map((e) => [e.id, e]));
  const editedIds = new Set(edited.map((e) => e.id));
  const upsert: T[] = [];
  const update: Record<string, Partial<T>> = {};
  for (const e of edited) {
    const prev = baseMap.get(e.id);
    if (!prev) {
      upsert.push(e);
      continue;
    }
    if (jsonEqual(prev, e)) continue;
    // Field-level diff keeps order-only shifts (a split renumbers every later
    // sibling) from ballooning into whole-entity copies. A REMOVED field can't
    // travel as a partial (apply merges shallowly and JSON drops `undefined`),
    // so those entities fall back to a whole-entity upsert.
    const keys = new Set([...Object.keys(prev), ...Object.keys(e)]);
    const changed: Partial<T> = {};
    let removedField = false;
    for (const k of keys) {
      const prevV = (prev as Record<string, unknown>)[k];
      const nextV = (e as Record<string, unknown>)[k];
      if (jsonEqual(prevV, nextV)) continue;
      if (nextV === undefined) {
        removedField = true;
        break;
      }
      (changed as Record<string, unknown>)[k] = nextV;
    }
    if (removedField) upsert.push(e);
    else update[e.id] = changed;
  }
  const remove = base.filter((e) => !editedIds.has(e.id)).map((e) => e.id);
  return { upsert, update, remove };
}

/** The patch-identity record for a generated base document. */
export function discoursePatchBase(base: DiscourseDocument): DiscoursePatchBase {
  return {
    discourseDocId: base.id,
    sourceId: base.sourceId,
    editionId: base.editionId,
    book: base.range.book,
    startRef: base.range.startRef,
    endRef: base.range.endRef,
    granularity: base.granularity,
    baseHash: hashDiscourseBase(base),
  };
}

/** Derive the compact patch that turns `base` into `edited`. */
export function diffDiscourseDocuments(
  base: DiscourseDocument,
  edited: DiscourseDocument,
  now: string,
): DiscoursePatch {
  const acceptedSuggestionIds = edited.suggestions
    .filter((s) => s.accepted && !base.suggestions.find((b) => b.id === s.id)?.accepted)
    .map((s) => s.id);
  return {
    schemaVersion: 1,
    base: discoursePatchBase(base),
    units: diffEntities<DiscourseUnit>(base.units, edited.units),
    relations: diffEntities<DiscourseRelation>(base.relations, edited.relations),
    markers: diffEntities<DiscourseMarker>(base.markers, edited.markers),
    acceptedSuggestionIds,
    layoutHints: jsonEqual(base.layoutHints, edited.layoutHints) ? undefined : edited.layoutHints,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Reconstruct the edited document: base + patch → live. Pure + idempotent.
 * Dismissed suggestions are handled through unit/relation ops only when they
 * had effects; accepted ids re-flag their suggestions.
 */
export function applyDiscoursePatch(
  base: DiscourseDocument,
  patch: DiscoursePatch,
): DiscourseDocument {
  const accepted = new Set(patch.acceptedSuggestionIds);
  return {
    ...base,
    units: applyEntityOps(base.units, patch.units),
    relations: applyEntityOps(base.relations, patch.relations),
    markers: applyEntityOps(base.markers, patch.markers),
    suggestions: base.suggestions.map((s) => (accepted.has(s.id) ? { ...s, accepted: true } : s)),
    layoutHints: patch.layoutHints ?? base.layoutHints,
    updatedAt: patch.updatedAt,
  };
}

export interface DiscoursePatchValidation {
  ok: boolean;
  patch?: DiscoursePatch;
  error?: string;
}

export function validateDiscoursePatch(raw: unknown): DiscoursePatchValidation {
  const parsed = DiscoursePatchSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; '),
    };
  }
  return { ok: true, patch: parsed.data };
}
