import { z } from 'zod';
import { SyntaxPatchSchema } from './patch';

/**
 * CONTESTED SYNTAX / ALTERNATE READINGS.
 *
 * The base 1904 (Nestle1904 LowFat) parse tree — and the WLC LowFat tree for
 * Hebrew — remains the DEFAULT source assignment and is never mutated. Where a
 * passage carries a debated syntactic decision, a contested-reading interpretation,
 * or a textual variant, we record it here as an OVERLAY on top of the base,
 * encoded with the smallest representation that captures the real difference:
 *
 *   review-only      → an issue record, no structural change (the base reading is
 *                      one defensible parse; we just flag the decision).
 *   semantic-only    → same tree, a different semantic construal of a relation
 *                      (e.g. objective vs. subjective genitive).
 *   syntax-only      → same Greek/Hebrew tokens, a different tree — a `syntaxPatch`
 *                      overlay (reusing the SyntaxPatch ops) that re-points or
 *                      re-groups nodes/relations.
 *   punctuation-only → a clause-boundary / punctuation difference (a syntaxPatch
 *                      if the graph must change, else a display note).
 *   textual-variant  → a different wording; NEVER merged into the base token
 *                      stream — shown as a variant record, optionally with its
 *                      own variant tokens.
 *   passage-inclusion→ the passage's presence/absence in the textual tradition.
 *
 * Everything anchors to the base passage's STABLE IDS (token/node/relation), so
 * an issue authored against the real parse highlights the right elements in every
 * diagram mode.
 */

export const ContestedIssueKindSchema = z.enum([
  'review',
  'semantic',
  'syntax',
  'textual',
  'punctuation',
  'attachment',
  'genitive',
  'coordination',
  'clauseBoundary',
  'subjectPredicate',
  'participialRelation',
  'other',
]);
export type ContestedIssueKind = z.infer<typeof ContestedIssueKindSchema>;

export const AlternateSourceTypeSchema = z.enum([
  'review-only',
  'semantic-only',
  'syntax-only',
  'punctuation-only',
  'textual-variant',
  'passage-inclusion',
]);
export type AlternateSourceType = z.infer<typeof AlternateSourceTypeSchema>;

/**
 * A syntax overlay is exactly the syntax portion of a {@link CustomAssignmentPatch}
 * (node/relation upsert·update·remove + optional rootId). Reusing it means
 * `applyPatch` can reconstruct the alternate document and `diffDocuments` can turn
 * an adopted alternate back into a normal, store-persisted user patch — the
 * alternate is just a pre-authored edit, not a parallel mechanism.
 */
export const SyntaxOverlayPatchSchema = SyntaxPatchSchema;
export type SyntaxOverlayPatch = z.infer<typeof SyntaxOverlayPatchSchema>;

export const SemanticOverlaySchema = z.object({
  relationId: z.string().optional(),
  nodeId: z.string().optional(),
  tokenIds: z.array(z.string()).optional(),
  /** A short, neutral semantic label (e.g. "objective genitive"). */
  semanticLabel: z.string(),
  explanation: z.string(),
});
export type SemanticOverlay = z.infer<typeof SemanticOverlaySchema>;

export const VariantTokenSchema = z.object({
  surface: z.string(),
  lemma: z.string().optional(),
  morphology: z.record(z.string(), z.unknown()).optional(),
  gloss: z.string().optional(),
});

export const TextualVariantSchema = z.object({
  label: z.string(),
  greekText: z.string().optional(),
  /** Always true for a real textual variant; explicit so the UI can warn. */
  differsFromBase: z.boolean(),
  affectedBaseTokenIds: z.array(z.string()).optional(),
  variantTokens: z.array(VariantTokenSchema).optional(),
  note: z.string().optional(),
});
export type TextualVariant = z.infer<typeof TextualVariantSchema>;

export const AlternateReadingSchema = z.object({
  id: z.string(),
  issueId: z.string(),
  passageId: z.string(),
  label: z.string(),
  shortLabel: z.string().optional(),
  interpretation: z.string(),
  description: z.string(),
  sourceType: AlternateSourceTypeSchema,

  /** Same base tokens, a different tree/attachment/grouping/label. */
  syntaxPatch: SyntaxOverlayPatchSchema.optional(),
  /** Same tree, a different semantic construal of a relation. */
  semanticOverlay: SemanticOverlaySchema.optional(),
  /** A different wording — never merged into the base token stream. */
  textualVariant: TextualVariantSchema.optional(),

  confidence: z.enum(['high', 'medium', 'low']).optional(),
  /** True if this alternate IS what the base tree already encodes. */
  isDefault: z.boolean().optional(),
});
export type AlternateReading = z.infer<typeof AlternateReadingSchema>;

export const ContestedSyntaxIssueSchema = z.object({
  id: z.string(),
  /** The base document id this issue is authored against (e.g. a GNT sentence). */
  passageId: z.string(),
  /**
   * When a reading crosses a base SENTENCE boundary (e.g. Romans 9:5's doxology,
   * which macula splits into its own sentence), the ordered ids of the base
   * sentences to COMBINE so the alternate can be shown structurally rather than as
   * a footnote. The issue then applies to ANY of these sentences, and its affected
   * ids / overlay are authored against the COMBINED document — whose ids are
   * `combinePassage`-prefixed (`s0_…` for the first sentence, `s1_…` for the
   * second, plus the `disc_rN` discourse relations).
   */
  mergePassageIds: z.array(z.string()).optional(),
  verseRef: z.string(),
  kind: ContestedIssueKindSchema,
  sourceType: AlternateSourceTypeSchema,
  severity: z.enum(['note', 'review', 'major']),

  label: z.string(),
  shortLabel: z.string().optional(),
  summary: z.string(),
  /** A pastoral / sermon-prep note kept separate from the neutral summary. */
  pastoralNote: z.string().optional(),

  affectedTokenIds: z.array(z.string()).default([]),
  affectedNodeIds: z.array(z.string()).optional(),
  affectedRelationIds: z.array(z.string()).optional(),

  defaultReading: z.object({
    label: z.string(),
    description: z.string(),
    parseSummary: z.string().optional(),
  }),

  alternateReadingIds: z.array(z.string()).default([]),

  bibliography: z.array(z.string()).optional(),
  notes: z.string().optional(),
});
export type ContestedSyntaxIssue = z.infer<typeof ContestedSyntaxIssueSchema>;

/**
 * What actually differs between the base document and an applied alternate —
 * computed (not authored), and used to drive subtle difference highlighting in
 * every diagram mode.
 */
export interface AlternateDiff {
  changedTokenIds: string[];
  changedNodeIds: string[];
  changedRelationIds: string[];
  addedNodeIds: string[];
  removedNodeIds: string[];
  addedRelationIds: string[];
  removedRelationIds: string[];
  /** No structural change — only a different semantic construal. */
  semanticOnly: boolean;
  /** Depends on a different wording — base tokens are NOT changed. */
  textualVariant: boolean;
  /** Short, human-readable bullets describing the difference. */
  summary: string[];
}

/** A validated registry: the issues and their alternates, kept together. */
export const ContestedRegistrySchema = z.object({
  issues: z.array(ContestedSyntaxIssueSchema),
  readings: z.array(AlternateReadingSchema),
});
export type ContestedRegistry = z.infer<typeof ContestedRegistrySchema>;
