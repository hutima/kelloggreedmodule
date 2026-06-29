import type {
  KrDocument,
  Relation,
  SyntaxNode,
  Token,
  NodeLayoutHint,
  LayoutHints,
  CustomAssignmentPatch,
  PatchBase,
} from '@/domain/schema';
import { CustomAssignmentPatchSchema, emptyPatch } from '@/domain/schema';

/**
 * PATCH MANAGER — the pure engine that reconstructs an edited document from a
 * base assignment plus a compact diff, and that derives such a diff from an
 * edited document. Nothing here touches storage or React; the store wires it in.
 *
 *   applyPatch(base, patch)        base  +  diff  ->  rendered document
 *   diffDocuments(base, edited)    base  vs  edited ->  diff
 *
 * Both are pure. `applyPatch` is idempotent: applying the same patch twice yields
 * the same document, and the base is never mutated.
 */

// --- shallow structural equality (good enough for plain JSON value objects) ---
function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

// --- apply --------------------------------------------------------------------

function applyEntityOps<T extends { id: string }>(
  base: T[],
  ops: { upsert: T[]; update: Record<string, Partial<T>>; remove: string[] },
): T[] {
  const map = new Map(base.map((e) => [e.id, e]));
  const order = base.map((e) => e.id);

  // 1. shallow merges by id
  for (const [id, patch] of Object.entries(ops.update)) {
    const existing = map.get(id);
    if (existing) map.set(id, { ...existing, ...patch } as T);
  }
  // 2. whole-entity upserts (new ids preserve insertion order)
  for (const entity of ops.upsert) {
    if (!map.has(entity.id)) order.push(entity.id);
    map.set(entity.id, entity);
  }
  // 3. removals
  const removed = new Set(ops.remove);
  return order
    .filter((id) => !removed.has(id) && map.has(id))
    .map((id) => map.get(id)!);
}

/**
 * Reconstruct an edited document from a base assignment and a patch. The base is
 * cloned shallowly; the result is a brand-new document object.
 */
export function applyPatch(
  base: KrDocument,
  patch: CustomAssignmentPatch,
): KrDocument {
  // tokens
  const tokens = patch.tokenPatch
    ? applyEntityOps<Token>(base.tokens, {
        upsert: patch.tokenPatch.upsert ?? [],
        update: patch.tokenPatch.update ?? {},
        remove: patch.tokenPatch.remove ?? [],
      })
    : base.tokens;

  // syntax
  const nodes = applyEntityOps<SyntaxNode>(
    base.syntax.nodes,
    patch.syntaxPatch.nodes,
  );
  const relations = applyEntityOps<Relation>(
    base.syntax.relations,
    patch.syntaxPatch.relations,
  );
  const rootId = patch.syntaxPatch.rootId ?? base.syntax.rootId;

  // layout hints (a null value deletes the base hint)
  let layoutHints: LayoutHints = base.layoutHints;
  if (patch.layoutHintsPatch) {
    layoutHints = { ...base.layoutHints };
    for (const [id, hint] of Object.entries(patch.layoutHintsPatch)) {
      if (hint === null) delete layoutHints[id];
      else layoutHints[id] = hint;
    }
  }

  return {
    ...base,
    tokens,
    syntax: { rootId, nodes, relations },
    layoutHints,
    updatedAt: patch.updatedAt,
  };
}

// --- diff ---------------------------------------------------------------------

function diffEntities<T extends { id: string }>(
  base: T[],
  edited: T[],
): { upsert: T[]; update: Record<string, Partial<T>>; remove: string[] } {
  const baseMap = new Map(base.map((e) => [e.id, e]));
  const editedIds = new Set(edited.map((e) => e.id));
  const upsert: T[] = [];
  for (const e of edited) {
    const prev = baseMap.get(e.id);
    if (!prev || !shallowEqual(prev, e)) upsert.push(e);
  }
  const remove = base.filter((e) => !editedIds.has(e.id)).map((e) => e.id);
  return { upsert, update: {}, remove };
}

/**
 * Derive the compact patch that turns `base` into `edited`. Whole changed/added
 * entities are emitted as `upsert`; deleted ids as `remove`. Layout hints that
 * differ are set; hints present in the base but gone in the edit are nulled.
 */
export function diffDocuments(
  base: KrDocument,
  edited: KrDocument,
  patchBase: PatchBase,
  now: string,
): CustomAssignmentPatch {
  const patch = emptyPatch(patchBase, now);
  patch.createdAt = now;

  patch.syntaxPatch.nodes = diffEntities(base.syntax.nodes, edited.syntax.nodes);
  patch.syntaxPatch.relations = diffEntities(
    base.syntax.relations,
    edited.syntax.relations,
  );
  if (edited.syntax.rootId !== base.syntax.rootId) {
    patch.syntaxPatch.rootId = edited.syntax.rootId;
  }

  const tokenOps = diffEntities(base.tokens, edited.tokens);
  if (
    tokenOps.upsert.length ||
    tokenOps.remove.length ||
    Object.keys(tokenOps.update).length
  ) {
    patch.tokenPatch = tokenOps;
  }

  const layoutPatch: Record<string, NodeLayoutHint | null> = {};
  for (const [id, hint] of Object.entries(edited.layoutHints)) {
    if (!shallowEqual(base.layoutHints[id], hint)) layoutPatch[id] = hint;
  }
  for (const id of Object.keys(base.layoutHints)) {
    if (!(id in edited.layoutHints)) layoutPatch[id] = null;
  }
  if (Object.keys(layoutPatch).length) patch.layoutHintsPatch = layoutPatch;

  return patch;
}

// --- validation ---------------------------------------------------------------

export interface PatchValidation {
  ok: boolean;
  patch?: CustomAssignmentPatch;
  error?: string;
}

export function validatePatch(raw: unknown): PatchValidation {
  const parsed = CustomAssignmentPatchSchema.safeParse(raw);
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

// --- base hashing (cheap structural fingerprint for source-drift warnings) ----

/**
 * A small, order-independent fingerprint of the parts of a base that matter for
 * patch compatibility: token ids/surfaces and node/relation ids. Not crypto —
 * just enough to detect that a patch was authored against a different base.
 */
export function hashBase(doc: KrDocument): string {
  const parts = [
    doc.tokens.map((t) => `${t.id}:${t.surface}`).sort().join('|'),
    doc.syntax.nodes.map((n) => n.id).sort().join('|'),
    doc.syntax.relations.map((r) => r.id).sort().join('|'),
    doc.syntax.rootId,
  ].join('::');
  // djb2 — compact, deterministic, dependency-free.
  let h = 5381;
  for (let i = 0; i < parts.length; i++) h = ((h << 5) + h + parts.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
