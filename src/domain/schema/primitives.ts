import { z } from 'zod';

/**
 * Primitive vocabularies shared across the domain.
 *
 * These enums are intentionally broad and additive: adding a new value here
 * should never break existing documents. Consumers (layout engine, renderer,
 * inspector) must degrade gracefully when they encounter a value they do not
 * yet handle. Never assume the set is closed.
 */

export const LanguageSchema = z.enum(['en', 'grc', 'hbo']);
export type Language = z.infer<typeof LanguageSchema>;

/**
 * Where an analytical assertion came from and how much to trust it.
 *
 * - `given`     supplied directly by the user / parsed input
 * - `inferred`  produced by the inference engine (provisional, editable)
 * - `confirmed` an inference the user has explicitly accepted
 * - `manual`    created or overridden directly by the user in the editor
 *
 * Every node, relation, and inferred field carries provenance so the UI can
 * show, accept, reject, or override any individual piece of analysis.
 */
export const ProvenanceSourceSchema = z.enum([
  'given',
  'inferred',
  'confirmed',
  'manual',
]);
export type ProvenanceSource = z.infer<typeof ProvenanceSourceSchema>;

export const ConfidenceSchema = z.enum(['high', 'medium', 'low']);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const ProvenanceSchema = z.object({
  source: ProvenanceSourceSchema,
  /** Only meaningful for `inferred`/`confirmed`; defaults to `high` for given/manual. */
  confidence: ConfidenceSchema.default('high'),
  /** Human-readable justification, e.g. "Finite third singular verb without explicit subject." */
  reason: z.string().optional(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

/**
 * Parts of speech. Superset covering English and Koine Greek. Greek verb
 * forms that behave like distinct categories for diagramming purposes
 * (participle, infinitive) are listed alongside the finite verb.
 */
export const PartOfSpeechSchema = z.enum([
  'noun',
  'propernoun',
  'pronoun',
  'verb',
  'participle',
  'infinitive',
  'adjective',
  'adverb',
  'article',
  'preposition',
  'conjunction',
  'particle',
  'interjection',
  'numeral',
  'determiner',
  'unknown',
]);
export type PartOfSpeech = z.infer<typeof PartOfSpeechSchema>;

// --- Greek / inflectional morphology features ---------------------------------
// All optional. English uses the subset that applies (person, number, tense,
// degree); Greek may populate all of them. Unknown values are tolerated by the
// renderer.

export const GrammaticalCaseSchema = z.enum([
  'nominative',
  'genitive',
  'dative',
  'accusative',
  'vocative',
]);
export type GrammaticalCase = z.infer<typeof GrammaticalCaseSchema>;

// `common` (Greek epicene) and `both` (Hebrew nouns attested as either gender)
// are kept distinct; the renderer treats any unknown value gracefully.
export const GenderSchema = z.enum(['masculine', 'feminine', 'neuter', 'common', 'both']);
export type Gender = z.infer<typeof GenderSchema>;

export const NumberSchema = z.enum(['singular', 'dual', 'plural']);
export type GrammaticalNumber = z.infer<typeof NumberSchema>;

export const PersonSchema = z.enum(['first', 'second', 'third']);
export type Person = z.infer<typeof PersonSchema>;

export const TenseSchema = z.enum([
  'present',
  'imperfect',
  'future',
  'aorist',
  'perfect',
  'pluperfect',
  // English-friendly aliases also accepted:
  'past',
]);
export type Tense = z.infer<typeof TenseSchema>;

export const VoiceSchema = z.enum(['active', 'middle', 'passive', 'middlepassive']);
export type Voice = z.infer<typeof VoiceSchema>;

export const MoodSchema = z.enum([
  'indicative',
  'subjunctive',
  'optative',
  'imperative',
  'infinitive',
  'participle',
]);
export type Mood = z.infer<typeof MoodSchema>;

export const DegreeSchema = z.enum(['positive', 'comparative', 'superlative']);
export type Degree = z.infer<typeof DegreeSchema>;

/**
 * Morphological feature bundle. Every field optional so partially parsed input
 * and either language can use only what applies.
 */
export const MorphologySchema = z
  .object({
    case: GrammaticalCaseSchema.optional(),
    gender: GenderSchema.optional(),
    number: NumberSchema.optional(),
    person: PersonSchema.optional(),
    tense: TenseSchema.optional(),
    voice: VoiceSchema.optional(),
    mood: MoodSchema.optional(),
    degree: DegreeSchema.optional(),
    /** Free-form extras (e.g. dialectal tags) without schema churn. */
    extra: z.record(z.string()).optional(),
  })
  .strict();
export type Morphology = z.infer<typeof MorphologySchema>;
