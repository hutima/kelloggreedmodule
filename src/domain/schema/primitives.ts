import { z } from 'zod';

/**
 * Primitive vocabularies shared across the domain.
 *
 * These enums are intentionally broad and additive: adding a new value here
 * should never break existing documents. Consumers (layout engine, renderer,
 * inspector) must degrade gracefully when they encounter a value they do not
 * yet handle. Never assume the set is closed.
 */

/**
 * A language code. The three with FIRST-CLASS treatment — `en` (English), `grc`
 * (Koine Greek, polytonic font stack), `hbo` (Biblical Hebrew, right-to-left) —
 * are the built-in base-data languages, but the schema accepts ANY code so a
 * user's custom / LLM-imported sentence can be in any language (Chinese, Arabic,
 * …). Unknown codes get sensible neutral defaults (left-to-right, default font).
 */
export const KNOWN_LANGUAGES = ['en', 'grc', 'hbo'] as const;
export const LanguageSchema = z.string().min(1);
export type Language = 'en' | 'grc' | 'hbo' | (string & {});

/** Text/layout direction. RTL scripts (Hebrew, Arabic, …) lay out right-to-left. */
export const DirectionSchema = z.enum(['ltr', 'rtl']);
export type Direction = z.infer<typeof DirectionSchema>;

/**
 * Where an analytical assertion came from and how much to trust it.
 *
 * - `given`         supplied directly by the source data / user / parsed input
 * - `converted`     mapped from source data by a converter that had to make an
 *                   interpretive decision (beyond a faithful 1:1 relabelling) —
 *                   e.g. downgrading a passive participle's accusative from the
 *                   source's bare "o" to `accusativeModifier`
 * - `inferred`      produced by the inference engine (provisional, editable)
 * - `confirmed`     an inference the user has explicitly accepted
 * - `manual`        created or overridden directly by the user in the editor
 * - `reconstructed` rebuilt for display from derived data (not source-faithful)
 * - `alternate`     from an alternate / reviewer-preferred analysis overlay
 *
 * Every node, relation, and inferred field carries provenance so the UI can
 * show, accept, reject, or override any individual piece of analysis — and so
 * a reader can always tell whether a label like "direct object" came straight
 * from the source, was an interpretive conversion, or was reconstructed.
 */
export const ProvenanceSourceSchema = z.enum([
  'given',
  'converted',
  'inferred',
  'confirmed',
  'manual',
  'reconstructed',
  'alternate',
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
  /** The RAW role in the source data when the converter relabelled it (e.g.
   *  Lowfat `role="o"` behind an `accusativeModifier`), so an interpretive
   *  mapping never loses what the source actually said. */
  sourceRole: z.string().optional(),
  /** Which text edition / syntax source the assertion came from (e.g.
   *  `macula-greek-nestle1904-lowfat`) — populated as sources become
   *  edition-aware (plan phases 6+). */
  editionId: z.string().optional(),
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
