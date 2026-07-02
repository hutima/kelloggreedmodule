import { z } from 'zod';
import { ConfidenceSchema, LanguageSchema, ProvenanceSchema } from './primitives';

/**
 * DISCOURSE ANALYSIS LAYER — a multi-verse / chapter / whole-book layer that is
 * architecturally SEPARATE from the sentence-level syntax model.
 *
 * The unit of analysis is a DISCOURSE UNIT (a block of text — sentence, verse,
 * pericope, user-authored grouping), not an individual word. A
 * `DiscourseDocument` is GENERATED from source sentence documents (refs +
 * token ids preserved) and then shaped by the user: breaks, indentation,
 * labels, and typed relations (ground, inference, contrast, chiasm…).
 *
 * Two provenance worlds coexist and must never be confused:
 *   - source-derived material (initial units, marker chips, suggestions) is
 *     hint-grade evidence — MACULA/SBLGNT provide NO finalized discourse arcs;
 *   - user-authored structure (provenance `manual`) is the authoritative
 *     analysis.
 *
 * Editing a discourse document NEVER mutates any `KrDocument` syntax; edits
 * are persisted as a separate compact `DiscoursePatch` against the generated
 * base (mirroring the syntax patch design, in a separate storage namespace).
 */

/** Bump when the on-disk discourse shape changes. */
export const DISCOURSE_SCHEMA_VERSION = 1;

// --- tokens ----------------------------------------------------------------------

/**
 * A compact copy of a source token — just enough for the discourse view to
 * render readable text blocks (surface, gloss) and locate the token (ref,
 * source doc) WITHOUT holding the full syntax documents in memory. Ids are the
 * source token ids unchanged, so everything stays traceable to the source and
 * stable across reloads. Never edited; regenerated with the base.
 */
export const DiscourseTokenSchema = z.object({
  id: z.string(),
  surface: z.string(),
  lemma: z.string().optional(),
  pos: z.string().optional(),
  gloss: z.string().optional(),
  /** Canonical `"chapter:verse"` within the document's book. */
  ref: z.string(),
  /** The source sentence document the token belongs to. */
  sourceDocId: z.string(),
});
export type DiscourseToken = z.infer<typeof DiscourseTokenSchema>;

// --- units ---------------------------------------------------------------------

/** What kind of block a discourse unit is. Additive — never assume closed. */
export const DiscourseUnitKindSchema = z.enum([
  'book',
  'chapter',
  'section',
  'pericope',
  'paragraph',
  'sentence',
  'clauseCluster',
  'custom',
]);
export type DiscourseUnitKind = z.infer<typeof DiscourseUnitKindSchema>;

/**
 * One discourse unit: a contiguous stretch of the loaded range (or a purely
 * interpretive container for other units). References are canonical
 * `"chapter:verse"` strings within the document's book; `tokenIds` point into
 * the SOURCE sentence documents (`sourceDocIds`) and are empty for a pure
 * container unit. `parentId`/`depth`/`order` shape the outline; `order` is the
 * position among siblings (0-based) and `depth` is derived from the parent
 * chain (root units have depth 0).
 */
export const DiscourseUnitSchema = z.object({
  id: z.string(),
  /** User-facing label ("Household code", "A", "B′") — independent of refs. */
  label: z.string().optional(),
  kind: DiscourseUnitKindSchema,
  /** First verse the unit touches, `"5:3"`. Empty for a pure container. */
  refStart: z.string().default(''),
  /** Last verse the unit touches, `"5:33"`. */
  refEnd: z.string().default(''),
  /** Source token ids covered, in surface order. Empty for containers. */
  tokenIds: z.array(z.string()).default([]),
  /** The source sentence documents the tokens come from. */
  sourceDocIds: z.array(z.string()).default([]),
  /** Parent unit id; absent for top-level units. */
  parentId: z.string().optional(),
  /** 0-based position among siblings. */
  order: z.number().int().nonnegative(),
  /** 0 for top-level; parent.depth + 1 otherwise (kept consistent by helpers). */
  depth: z.number().int().nonnegative(),
  collapsed: z.boolean().optional(),
  notes: z.string().optional(),
  provenance: ProvenanceSchema,
});
export type DiscourseUnit = z.infer<typeof DiscourseUnitSchema>;

// --- relations -------------------------------------------------------------------

/**
 * Typed discourse relations between units. Broad and additive; the renderer
 * degrades gracefully (label + generic arc) for values it doesn't style.
 */
export const DiscourseRelationTypeSchema = z.enum([
  'coordinate',
  'series',
  'contrast',
  'ground',
  'inference',
  'result',
  'purpose',
  'condition',
  'concession',
  'elaboration',
  'explanation',
  'quotation',
  'inclusio',
  'parallel',
  'chiasm',
  'custom',
  'unknown',
]);
export type DiscourseRelationType = z.infer<typeof DiscourseRelationTypeSchema>;

export const DiscourseRelationSchema = z.object({
  id: z.string(),
  sourceUnitId: z.string(),
  targetUnitId: z.string(),
  type: DiscourseRelationTypeSchema,
  /** Free label shown on the arc (e.g. a custom relation's name). */
  label: z.string().optional(),
  /** Marker chips cited as evidence for this relation. */
  markerIds: z.array(z.string()).optional(),
  confidence: ConfidenceSchema.optional(),
  provenance: ProvenanceSchema,
  notes: z.string().optional(),
});
export type DiscourseRelation = z.infer<typeof DiscourseRelationSchema>;

// --- markers -------------------------------------------------------------------

/**
 * The HINT function a discourse marker (γάρ, οὖν, δέ…) may signal. Markers are
 * clues, not conclusions — the UI must always present these as "possible".
 */
export const MarkerFunctionSchema = z.enum([
  'additive',
  'contrastive',
  'causal',
  'inferential',
  'resultative',
  'purpose',
  'conditional',
  'temporal',
  'emphatic',
  'development',
  'content',
  'unknown',
]);
export type MarkerFunction = z.infer<typeof MarkerFunctionSchema>;

/** A discourse-relevant particle/conjunction occurrence in the loaded range. */
export const DiscourseMarkerSchema = z.object({
  id: z.string(),
  /** The source token this marker is (never a synthesized word). */
  tokenId: z.string(),
  surface: z.string(),
  lemma: z.string().optional(),
  pos: z.string().optional(),
  /** Canonical `"chapter:verse"` the token sits in. */
  ref: z.string(),
  /** Suggested discourse function — a hint, not an analysis. */
  suggestedFunction: MarkerFunctionSchema.optional(),
  /** The unit the marker is assigned to scope over (user-assignable). */
  scopeUnitId: z.string().optional(),
  provenance: ProvenanceSchema,
});
export type DiscourseMarker = z.infer<typeof DiscourseMarkerSchema>;

// --- suggestions -----------------------------------------------------------------

export const DiscourseSuggestionTypeSchema = z.enum([
  'possibleMarker',
  'possibleBreak',
  'possibleGround',
  'possibleContrast',
  'possibleInference',
  'possibleSeries',
  'possibleParallel',
  'possibleInclusio',
  'possibleChiasm',
  'repeatedLemma',
  'repeatedPhrase',
]);
export type DiscourseSuggestionType = z.infer<typeof DiscourseSuggestionTypeSchema>;

/**
 * A non-authoritative hint surfaced in the suggestions panel. Suggestions
 * never alter the diagram by themselves; ACCEPTING one turns it into an
 * ordinary editable manual relation / marker assignment. Rejecting (or simply
 * ignoring) one is always harmless.
 */
export const DiscourseSuggestionSchema = z.object({
  id: z.string(),
  type: DiscourseSuggestionTypeSchema,
  /** The units the suggestion concerns (order matters, e.g. source → target). */
  unitIds: z.array(z.string()).default([]),
  markerIds: z.array(z.string()).optional(),
  tokenIds: z.array(z.string()).optional(),
  label: z.string().optional(),
  /** Human-readable justification — shown verbatim in the panel. */
  explanation: z.string(),
  confidence: ConfidenceSchema,
  /** Set once the user accepts it (the derived edit is recorded separately). */
  accepted: z.boolean().optional(),
  provenance: ProvenanceSchema,
});
export type DiscourseSuggestion = z.infer<typeof DiscourseSuggestionSchema>;

// --- layout hints ----------------------------------------------------------------

/** Display-only preferences. Never syntax; never part of the analysis. */
export const DiscourseLayoutHintsSchema = z.object({
  compact: z.boolean().optional(),
  showMarkers: z.boolean().optional(),
  showRelations: z.boolean().optional(),
  showLabels: z.boolean().optional(),
  showSourceText: z.boolean().optional(),
  showEnglish: z.boolean().optional(),
  relationSide: z.enum(['left', 'right', 'both']).optional(),
  unitPositions: z
    .record(z.string(), z.object({ x: z.number().optional(), y: z.number().optional() }))
    .optional(),
  relationRoutes: z.record(z.string(), z.unknown()).optional(),
});
export type DiscourseLayoutHints = z.infer<typeof DiscourseLayoutHintsSchema>;

// --- document --------------------------------------------------------------------

/** The loaded range, canonical refs within one book. */
export const DiscourseRangeSchema = z.object({
  book: z.string(),
  /** `"5:3"` — first verse included. */
  startRef: z.string(),
  /** `"5:33"` — last verse included. */
  endRef: z.string(),
});
export type DiscourseRange = z.infer<typeof DiscourseRangeSchema>;

export const DiscourseGranularitySchema = z.enum([
  'verse',
  'paragraph',
  'sentence',
  'clauseCluster',
]);
export type DiscourseGranularity = z.infer<typeof DiscourseGranularitySchema>;

/**
 * A complete discourse analysis document — the unit of generation, editing,
 * patch persistence, and export for Discourse mode. Generated deterministically
 * from an array of source sentence `KrDocument`s (whose ids it records), so the
 * same source + range + granularity always rebuilds the same base.
 */
export const DiscourseDocumentSchema = z.object({
  schemaVersion: z.number().int().positive().default(DISCOURSE_SCHEMA_VERSION),
  id: z.string(),
  /** The source sentence documents the range was generated from, in order. */
  sourceDocIds: z.array(z.string()).default([]),
  /** Which syntax source / edition the range was loaded from. */
  sourceId: z.string(),
  editionId: z.string().optional(),
  language: LanguageSchema,
  title: z.string().default(''),
  range: DiscourseRangeSchema,
  /** How the initial units were cut. */
  granularity: DiscourseGranularitySchema.default('sentence'),
  /** The full running text of the range (readable fallback / search). */
  text: z.string().default(''),
  /** Compact copies of every source token in the range, in reading order. */
  tokens: z.array(DiscourseTokenSchema).default([]),
  units: z.array(DiscourseUnitSchema).default([]),
  relations: z.array(DiscourseRelationSchema).default([]),
  markers: z.array(DiscourseMarkerSchema).default([]),
  suggestions: z.array(DiscourseSuggestionSchema).default([]),
  layoutHints: DiscourseLayoutHintsSchema.default({}),
  provenance: ProvenanceSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DiscourseDocument = z.infer<typeof DiscourseDocumentSchema>;

// --- patch (user edits against the generated base) --------------------------------

/** Identifies which generated base a discourse patch applies to. */
export const DiscoursePatchBaseSchema = z.object({
  discourseDocId: z.string(),
  sourceId: z.string(),
  editionId: z.string().optional(),
  book: z.string(),
  startRef: z.string(),
  endRef: z.string(),
  granularity: DiscourseGranularitySchema.default('sentence'),
  /** Cheap structural hash of the generated base, to skip stale patches. */
  baseHash: z.string().optional(),
});
export type DiscoursePatchBase = z.infer<typeof DiscoursePatchBaseSchema>;

const UnitOpsSchema = z.object({
  upsert: z.array(DiscourseUnitSchema).default([]),
  update: z.record(z.string(), DiscourseUnitSchema.partial()).default({}),
  remove: z.array(z.string()).default([]),
});

const RelationOpsSchema = z.object({
  upsert: z.array(DiscourseRelationSchema).default([]),
  update: z.record(z.string(), DiscourseRelationSchema.partial()).default({}),
  remove: z.array(z.string()).default([]),
});

const MarkerOpsSchema = z.object({
  upsert: z.array(DiscourseMarkerSchema).default([]),
  update: z.record(z.string(), DiscourseMarkerSchema.partial()).default({}),
  remove: z.array(z.string()).default([]),
});

const emptyOps = () => ({ upsert: [], update: {}, remove: [] });

/**
 * Compact diff of user discourse edits against the generated base document.
 * Mirrors the syntax `CustomAssignmentPatch` design (upsert · update · remove
 * by id; pure + idempotent apply) in a SEPARATE namespace — discourse patches
 * never mix with syntax patches, sermon prep, or notes.
 */
export const DiscoursePatchSchema = z.object({
  schemaVersion: z.number().int().positive().default(DISCOURSE_SCHEMA_VERSION),
  base: DiscoursePatchBaseSchema,
  units: UnitOpsSchema.default(emptyOps()),
  relations: RelationOpsSchema.default(emptyOps()),
  markers: MarkerOpsSchema.default(emptyOps()),
  /** Ids of suggestions the user accepted (display state; edits are in ops). */
  acceptedSuggestionIds: z.array(z.string()).default([]),
  /** Replacement layout hints (display-only), if changed. */
  layoutHints: DiscourseLayoutHintsSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DiscoursePatch = z.infer<typeof DiscoursePatchSchema>;

/** True when a patch changes nothing. */
export function isEmptyDiscoursePatch(patch: DiscoursePatch): boolean {
  const empty = (o: { upsert: unknown[]; update: Record<string, unknown>; remove: unknown[] }) =>
    o.upsert.length === 0 && Object.keys(o.update).length === 0 && o.remove.length === 0;
  return (
    empty(patch.units) &&
    empty(patch.relations) &&
    empty(patch.markers) &&
    patch.acceptedSuggestionIds.length === 0 &&
    !patch.layoutHints
  );
}
