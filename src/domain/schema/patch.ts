import { z } from 'zod';
import { SyntaxNodeSchema, RelationSchema } from './syntax';
import { TokenSchema } from './token';
import { NodeLayoutHintSchema } from './layout';
import { SermonPrepDataSchema } from './sermon';

/**
 * CUSTOM ASSIGNMENT PATCH — the storage unit for USER EDITS.
 *
 * The app must never duplicate a full base (gold-standard) assignment for every
 * edited passage. Instead a user's manual changes are stored as a COMPACT DIFF
 * against the base document. The rendered document is reconstructed as:
 *
 *     base source assignment  +  user patch  +  sermon prep  +  layout prefs
 *
 * A patch separates the three concerns it can touch — syntax (nodes/relations),
 * tokens, and layout hints — and keeps view-only UI state apart from syntax.
 * Applying a patch is pure and idempotent; nothing here mutates the base.
 */

/** Identifies which base document a patch applies to (and guards mismatches). */
export const PatchBaseSchema = z.object({
  corpus: z.enum(['gnt', 'ot', 'custom']).default('custom'),
  passageId: z.string(),
  sourceId: z.string().optional(),
  sourceVersion: z.string().optional(),
  /** Cheap structural hash of the base, to warn on source drift before import. */
  baseHash: z.string().optional(),
});
export type PatchBase = z.infer<typeof PatchBaseSchema>;

/** upsert (whole entity) / update (shallow merge by id) / remove (by id). */
const NodeOpsSchema = z.object({
  upsert: z.array(SyntaxNodeSchema).default([]),
  update: z.record(z.string(), SyntaxNodeSchema.partial()).default({}),
  remove: z.array(z.string()).default([]),
});

const RelationOpsSchema = z.object({
  upsert: z.array(RelationSchema).default([]),
  update: z.record(z.string(), RelationSchema.partial()).default({}),
  remove: z.array(z.string()).default([]),
});

export const SyntaxPatchSchema = z.object({
  nodes: NodeOpsSchema.default({ upsert: [], update: {}, remove: [] }),
  relations: RelationOpsSchema.default({ upsert: [], update: {}, remove: [] }),
  /** Only set if the user re-rooted the document. */
  rootId: z.string().optional(),
});
export type SyntaxPatch = z.infer<typeof SyntaxPatchSchema>;

export const TokenPatchSchema = z.object({
  upsert: z.array(TokenSchema).default([]),
  update: z.record(z.string(), TokenSchema.partial()).default({}),
  remove: z.array(z.string()).default([]),
});
export type TokenPatch = z.infer<typeof TokenPatchSchema>;

/** A `null` value means "delete this node's layout hint" when applying. */
export const LayoutHintsPatchSchema = z.record(
  z.string(),
  NodeLayoutHintSchema.nullable(),
);
export type LayoutHintsPatch = z.infer<typeof LayoutHintsPatchSchema>;

/** Pure UI/view state — NEVER confused with syntax. */
export const ViewStatePatchSchema = z.object({
  collapsedBlocks: z.array(z.string()).optional(),
  pinnedNodes: z.array(z.string()).optional(),
  preferredVisualization: z.string().optional(),
});
export type ViewStatePatch = z.infer<typeof ViewStatePatchSchema>;

export const CustomAssignmentPatchSchema = z.object({
  schemaVersion: z.number().int().positive().default(1),
  base: PatchBaseSchema,
  syntaxPatch: SyntaxPatchSchema.default({
    nodes: { upsert: [], update: {}, remove: [] },
    relations: { upsert: [], update: {}, remove: [] },
  }),
  tokenPatch: TokenPatchSchema.optional(),
  layoutHintsPatch: LayoutHintsPatchSchema.optional(),
  viewStatePatch: ViewStatePatchSchema.optional(),
  sermonPrep: SermonPrepDataSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CustomAssignmentPatch = z.infer<typeof CustomAssignmentPatchSchema>;

/** An empty (no-op) patch for a base. */
export function emptyPatch(base: PatchBase, now: string): CustomAssignmentPatch {
  return {
    schemaVersion: 1,
    base,
    syntaxPatch: {
      nodes: { upsert: [], update: {}, remove: [] },
      relations: { upsert: [], update: {}, remove: [] },
    },
    createdAt: now,
    updatedAt: now,
  };
}

/** True when a patch changes nothing about the syntax/tokens/layout. */
export function isEmptySyntaxPatch(patch: CustomAssignmentPatch): boolean {
  const s = patch.syntaxPatch;
  const noNodes =
    s.nodes.upsert.length === 0 &&
    Object.keys(s.nodes.update).length === 0 &&
    s.nodes.remove.length === 0;
  const noRels =
    s.relations.upsert.length === 0 &&
    Object.keys(s.relations.update).length === 0 &&
    s.relations.remove.length === 0;
  const noTokens =
    !patch.tokenPatch ||
    ((patch.tokenPatch.upsert?.length ?? 0) === 0 &&
      Object.keys(patch.tokenPatch.update ?? {}).length === 0 &&
      (patch.tokenPatch.remove?.length ?? 0) === 0);
  const noLayout =
    !patch.layoutHintsPatch || Object.keys(patch.layoutHintsPatch).length === 0;
  return noNodes && noRels && noTokens && noLayout && !s.rootId;
}
