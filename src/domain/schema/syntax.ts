import { z } from 'zod';
import { ProvenanceSchema } from './primitives';

/**
 * SYNTAX MODEL — the second of the three separated concerns.
 *
 * The syntax model is a graph of constituents (`nodes`) connected by typed
 * directed relations (`relations`). It is completely independent of surface
 * word order: a node references the surface tokens that realize it by id, and
 * a node may reference zero tokens (implied/elided element) or several
 * non-adjacent tokens (discontinuous constituent).
 *
 * Layout (coordinates, slants, line geometry) is a SEPARATE concern handled by
 * the layout engine — nothing here describes pixels.
 */

/** What a node functions as. Broad and additive. */
export const SyntacticRoleSchema = z.enum([
  // core clause structure
  'clause',
  'subject',
  'predicate', // the verbal nucleus / finite verb
  'copula',
  // verbal arguments & complements
  'directObject',
  'indirectObject',
  'predicateNominative',
  'predicateAdjective',
  'objectComplement',
  'dativeComplement',
  'genitiveComplement',
  'agent', // e.g. ὑπό + genitive with passive
  // modification
  'adjectival', // adjective / adjectival participle / relative clause modifying a noun
  'adverbial', // adverb / adverbial participle / adverbial clause
  'determiner', // article / determiner
  'genitive', // adnominal genitive (possessive, descriptive, etc.)
  'apposition',
  'prepositionalPhrase',
  'prepositionObject',
  // discourse & connectives
  'conjunction',
  'coordinator',
  'conjunct', // a member of a coordinate structure
  'particle', // discourse particle (δέ, γάρ, μέν, οὖν ...)
  'vocative',
  'interjection',
  // catch-all
  'adjunct',
  'unknown',
]);
export type SyntacticRole = z.infer<typeof SyntacticRoleSchema>;

/** Phrase/word granularity of a node. */
export const NodeKindSchema = z.enum(['word', 'phrase', 'clause']);
export type NodeKind = z.infer<typeof NodeKindSchema>;

/** Clause subtypes, used when `kind === 'clause'`. */
export const ClauseTypeSchema = z.enum([
  'independent',
  'relative',
  'adverbial', // temporal, causal, conditional, concessive, purpose, result ...
  'complement', // ὅτι / ἵνα content clause, indirect discourse
  'infinitival',
  'participial',
  'coordinate',
  'unknown',
]);
export type ClauseType = z.infer<typeof ClauseTypeSchema>;

/**
 * A syntactic constituent.
 */
export const SyntaxNodeSchema = z.object({
  id: z.string(),
  kind: NodeKindSchema,
  /** Function within its parent. Optional for the root / unanalyzed nodes. */
  role: SyntacticRoleSchema.optional(),
  /** Only when kind === 'clause'. */
  clauseType: ClauseTypeSchema.optional(),
  /**
   * Surface tokens realizing this node, by id. May be empty (implied element)
   * and need not be contiguous (discontinuous constituent).
   */
  tokenIds: z.array(z.string()).default([]),
  /** True for elided/implied elements (omitted copula, implied subject). */
  implied: z.boolean().optional(),
  /** Display label, e.g. "(he)" for an implied subject, or a category tag. */
  label: z.string().optional(),
  provenance: ProvenanceSchema.optional(),
  notes: z.string().optional(),
});
export type SyntaxNode = z.infer<typeof SyntaxNodeSchema>;

/**
 * A typed directed relation from a head to a dependent.
 *
 * Examples:
 *   subject:      head = clause/predicate, dependent = subject node
 *   directObject: head = predicate,        dependent = object node
 *   adjectival:   head = noun,             dependent = adjective node
 *   prepositionalPhrase: head = governing word, dependent = PP node
 *   conjunct:     head = coordinator,      dependent = a conjunct node
 */
export const RelationSchema = z.object({
  id: z.string(),
  type: SyntacticRoleSchema,
  headId: z.string(),
  dependentId: z.string(),
  /** Optional label drawn on the connector (e.g. preposition, conjunction, "rel."). */
  label: z.string().optional(),
  provenance: ProvenanceSchema.optional(),
  notes: z.string().optional(),
});
export type Relation = z.infer<typeof RelationSchema>;

/**
 * The complete syntax graph for a sentence.
 */
export const SyntaxModelSchema = z.object({
  /** The main clause node id — the spine of the diagram. */
  rootId: z.string(),
  nodes: z.array(SyntaxNodeSchema).default([]),
  relations: z.array(RelationSchema).default([]),
});
export type SyntaxModel = z.infer<typeof SyntaxModelSchema>;
