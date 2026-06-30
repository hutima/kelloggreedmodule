/**
 * GLOSSARY — plain-language definitions for the terse labels and morphology
 * codes the diagram modes paint (e.g. the Dependency arc tags `subj`/`obj` and
 * the Morphology agreement link `agr`).
 *
 * A layout element advertises a `glossKey`; tapping the label opens the shared
 * detail panel with the matching entry. Pure data + lookup, so it is testable in
 * Node and reused by every mode (and could feed a printed legend later).
 */

export interface GlossEntry {
  /** The full term, e.g. "Direct object". */
  term: string;
  /** The abbreviation as it appears on the diagram, e.g. "obj" (optional). */
  abbr?: string;
  /** One- or two-sentence explanation in plain language. */
  detail: string;
}

/**
 * Canonical entries keyed by a stable id. Relation labels use their
 * `SyntacticRole` as the key; morphology codes use their own short keys. Keys
 * are matched case-insensitively (see {@link lookupGloss}).
 */
const GLOSSARY: Record<string, GlossEntry> = {
  // ── Clause structure ────────────────────────────────────────────────────
  root: {
    term: 'Root',
    abbr: 'root',
    detail: 'The head of the whole sentence — usually the main (finite) verb. Every other word ultimately depends on it.',
  },
  subject: {
    term: 'Subject',
    abbr: 'subj',
    detail: 'The person or thing the clause is about — what the verb agrees with.',
  },
  predicate: {
    term: 'Predicate',
    abbr: 'pred',
    detail: 'The main verb of the clause and what it asserts about the subject.',
  },
  copula: {
    term: 'Linking verb',
    abbr: 'cop',
    detail: 'A “to be” verb that links the subject to a predicate noun or adjective rather than expressing an action.',
  },

  // ── Verbal arguments / complements ──────────────────────────────────────
  directObject: {
    term: 'Direct object',
    abbr: 'obj',
    detail: 'The person or thing directly acted on by the verb (answers “whom?” or “what?”).',
  },
  indirectObject: {
    term: 'Indirect object',
    abbr: 'iobj',
    detail: 'The recipient or beneficiary of the action (answers “to/for whom?”).',
  },
  predicateNominative: {
    term: 'Predicate nominative',
    abbr: 'pred-nom',
    detail: 'A noun in the predicate that renames the subject through a linking verb (e.g. “the Word was God”).',
  },
  predicateAdjective: {
    term: 'Predicate adjective',
    abbr: 'pred-adj',
    detail: 'An adjective in the predicate that describes the subject through a linking verb.',
  },
  objectComplement: {
    term: 'Object complement',
    abbr: 'o-comp',
    detail: 'A word that completes the meaning of the direct object (e.g. “they made him king”).',
  },
  dativeComplement: {
    term: 'Dative complement',
    abbr: 'dat',
    detail: 'A noun in the dative case required by the verb to complete its meaning.',
  },
  genitiveComplement: {
    term: 'Genitive complement',
    abbr: 'gen',
    detail: 'A noun in the genitive case required by the verb to complete its meaning.',
  },
  agent: {
    term: 'Agent',
    abbr: 'agent',
    detail: 'The doer of the action in a passive clause (e.g. “by God”).',
  },

  // ── Modification ────────────────────────────────────────────────────────
  adjectival: {
    term: 'Adjectival modifier',
    abbr: 'adj',
    detail: 'A word or phrase that describes a noun (which one, what kind, how many).',
  },
  adverbial: {
    term: 'Adverbial modifier',
    abbr: 'adv',
    detail: 'A word or phrase that modifies a verb, adjective, or other adverb (how, when, where, why).',
  },
  determiner: {
    term: 'Article / determiner',
    abbr: 'det',
    detail: 'A word such as “the”, “a”, “this” (or the Greek article) that specifies a noun. In Greek it agrees with its noun in case, gender, and number.',
  },
  genitive: {
    term: 'Genitive modifier',
    abbr: 'gen',
    detail: 'A noun in the genitive case modifying another noun — possession, source, description, and more (often “of …”).',
  },
  apposition: {
    term: 'Apposition',
    abbr: 'appos',
    detail: 'A noun placed beside another that renames or identifies it (e.g. “Paul, an apostle”).',
  },
  prepositionalPhrase: {
    term: 'Prepositional phrase',
    abbr: 'pp',
    detail: 'A preposition together with its object, modifying a verb or noun (e.g. “in the beginning”).',
  },
  prepositionObject: {
    term: 'Object of a preposition',
    abbr: 'p-obj',
    detail: 'The noun governed by a preposition; the preposition assigns it its case.',
  },

  // ── Discourse / connectives ─────────────────────────────────────────────
  conjunction: {
    term: 'Conjunction',
    abbr: 'conj',
    detail: 'A word that joins words, phrases, or clauses (and, but, for, because).',
  },
  coordinator: {
    term: 'Coordinator',
    abbr: 'coord',
    detail: 'The conjunction (e.g. καί “and”) that joins two equal, coordinated elements.',
  },
  conjunct: {
    term: 'Coordinated element',
    abbr: 'conj',
    detail: 'One of two or more elements of equal rank joined by a coordinator.',
  },
  particle: {
    term: 'Particle',
    abbr: 'ptcl',
    detail: 'A small uninflected word that shapes the flow of discourse (δέ, γάρ, μέν, οὖν …) rather than naming a thing or action.',
  },
  vocative: {
    term: 'Vocative',
    abbr: 'voc',
    detail: 'A noun of direct address — the person or thing being spoken to.',
  },
  interjection: {
    term: 'Interjection',
    abbr: 'intj',
    detail: 'An exclamatory word standing apart from the grammar of the sentence.',
  },
  adjunct: {
    term: 'Adjunct',
    abbr: 'adjunct',
    detail: 'An optional modifier attached to its head whose precise role is left unspecified.',
  },
  clause: {
    term: 'Clause',
    abbr: 'cl',
    detail: 'A group of words with its own subject and predicate; here represented by its main verb.',
  },
  unknown: {
    term: 'Unanalysed',
    abbr: '',
    detail: 'The relationship has not yet been classified.',
  },

  // ── Constituency tree: phrase categories ────────────────────────────────
  // Keyed `phrase:*` / `pos:*` so the single-letter tags can't collide with the
  // morphology codes below (e.g. "N" the noun tag vs. "n" the neuter code).
  'phrase:S': {
    term: 'Sentence / Clause (S)',
    abbr: 'S',
    detail: 'A complete clause — a subject together with its predicate. It is the top of the phrase-structure tree.',
  },
  'phrase:NP': {
    term: 'Noun phrase (NP)',
    abbr: 'NP',
    detail: 'A noun and the words clustered with it (article, adjectives, genitives) acting as a single unit — e.g. a subject or an object.',
  },
  'phrase:VP': {
    term: 'Verb phrase (VP)',
    abbr: 'VP',
    detail: 'The verb together with its objects and modifiers — everything the clause asserts about the subject.',
  },
  'phrase:PP': {
    term: 'Prepositional phrase (PP)',
    abbr: 'PP',
    detail: 'A preposition plus the noun phrase it governs (e.g. “in the beginning”), modifying a verb or noun.',
  },
  'phrase:AdjP': {
    term: 'Adjective phrase (AdjP)',
    abbr: 'AdjP',
    detail: 'An adjective with any words modifying it, describing a noun.',
  },
  'phrase:AdvP': {
    term: 'Adverb phrase (AdvP)',
    abbr: 'AdvP',
    detail: 'An adverb with any words modifying it, qualifying a verb, adjective, or other adverb.',
  },
  'phrase:DP': {
    term: 'Determiner phrase (DP)',
    abbr: 'DP',
    detail: 'A phrase headed by an article or determiner (“the …”).',
  },
  'phrase:ConjP': {
    term: 'Coordinate phrase (ConjP)',
    abbr: 'ConjP',
    detail: 'Two or more equal elements joined by a conjunction (“and”, “but”, “or”).',
  },
  'phrase:PrtP': {
    term: 'Particle phrase (PrtP)',
    abbr: 'PrtP',
    detail: 'A phrase organised around a discourse particle (δέ, γάρ, οὖν …).',
  },
  'phrase:XP': {
    term: 'Phrase',
    abbr: 'XP',
    detail: 'A group of words functioning as a unit whose exact category is unclassified.',
  },
  // ── Constituency tree: part-of-speech leaf tags ─────────────────────────
  'pos:N': { term: 'Noun (N)', abbr: 'N', detail: 'Names a person, place, thing, or idea.' },
  'pos:V': { term: 'Verb (V)', abbr: 'V', detail: 'Expresses an action or state of being.' },
  'pos:Det': { term: 'Determiner / article (Det)', abbr: 'Det', detail: 'A word like “the” or the Greek article that specifies a noun.' },
  'pos:P': { term: 'Preposition (P)', abbr: 'P', detail: 'A word that relates its object to the rest of the clause (in, with, from, to …).' },
  'pos:Adj': { term: 'Adjective (Adj)', abbr: 'Adj', detail: 'Describes a noun (which one, what kind, how many).' },
  'pos:Adv': { term: 'Adverb (Adv)', abbr: 'Adv', detail: 'Modifies a verb, adjective, or other adverb (how, when, where, why).' },
  'pos:Conj': { term: 'Conjunction (Conj)', abbr: 'Conj', detail: 'Joins words, phrases, or clauses.' },
  'pos:Pron': { term: 'Pronoun (Pron)', abbr: 'Pron', detail: 'Stands in for a noun (he, she, it, who …).' },
  'pos:Prt': { term: 'Particle (Prt)', abbr: 'Prt', detail: 'A small uninflected word shaping discourse (δέ, γάρ, μέν, οὖν …).' },
  'pos:Intj': { term: 'Interjection (Intj)', abbr: 'Intj', detail: 'An exclamation standing apart from the sentence grammar.' },
  'pos:Num': { term: 'Numeral (Num)', abbr: 'Num', detail: 'A counting word (one, two, three …).' },
  'pos:∅': { term: 'Implied / elided', abbr: '∅', detail: 'A word the grammar implies but the text leaves unstated (e.g. a dropped subject or the verb “to be”).' },

  // ── Morphology agreement / government links ─────────────────────────────
  agreement: {
    term: 'Agreement',
    abbr: 'agr',
    detail: 'These words agree in their grammatical form — case, gender, and number — which is how Greek signals that they belong together regardless of word order (e.g. an article or adjective matching its noun).',
  },

  // ── Greek/Hebrew morphology codes ───────────────────────────────────────
  // Case
  nom: { term: 'Nominative', detail: 'The case of the subject (and predicate nominative).' },
  gen: { term: 'Genitive', detail: 'The case of source, possession, and description — often “of …”.' },
  dat: { term: 'Dative', detail: 'The case of the indirect object and of means, location, or reference — often “to/for/with/in …”.' },
  acc: { term: 'Accusative', detail: 'The case of the direct object and the goal of motion.' },
  voc: { term: 'Vocative', detail: 'The case of direct address.' },
  // Number
  sg: { term: 'Singular', detail: 'One.' },
  du: { term: 'Dual', detail: 'Exactly two (a number Greek retains only in traces).' },
  pl: { term: 'Plural', detail: 'More than one.' },
  // Gender
  m: { term: 'Masculine', detail: 'Masculine grammatical gender.' },
  f: { term: 'Feminine', detail: 'Feminine grammatical gender.' },
  n: { term: 'Neuter', detail: 'Neuter grammatical gender.' },
  c: { term: 'Common', detail: 'Common gender (masculine or feminine).' },
  // Tense
  pres: { term: 'Present', detail: 'Present tense — typically ongoing or general action.' },
  impf: { term: 'Imperfect', detail: 'Imperfect tense — past action viewed as ongoing or repeated.' },
  fut: { term: 'Future', detail: 'Future tense.' },
  aor: { term: 'Aorist', detail: 'Aorist tense — action viewed as a whole, often simple past.' },
  pf: { term: 'Perfect', detail: 'Perfect tense — a past action with a continuing result.' },
  plpf: { term: 'Pluperfect', detail: 'Pluperfect tense — a result that already existed in the past.' },
  // Voice
  act: { term: 'Active voice', detail: 'The subject performs the action.' },
  mid: { term: 'Middle voice', detail: 'The subject acts on or for itself.' },
  pass: { term: 'Passive voice', detail: 'The subject receives the action.' },
  'm/p': { term: 'Middle/Passive', detail: 'A form that is middle or passive (the two are identical here).' },
  // Mood
  ind: { term: 'Indicative', detail: 'States a fact or asks a question.' },
  subj: { term: 'Subjunctive', detail: 'Expresses possibility, purpose, or exhortation.' },
  opt: { term: 'Optative', detail: 'Expresses a wish or remote possibility.' },
  impv: { term: 'Imperative', detail: 'Gives a command.' },
  inf: { term: 'Infinitive', detail: 'A verbal noun (“to …”); no subject agreement.' },
  ptcp: { term: 'Participle', detail: 'A verbal adjective — it shares verb features (tense, voice) and adjective features (case, gender, number).' },
  // Person
  '1': { term: 'First person', detail: 'The speaker (I / we).' },
  '2': { term: 'Second person', detail: 'The one addressed (you).' },
  '3': { term: 'Third person', detail: 'The one spoken about (he / she / it / they).' },
};

/** Look up a glossary entry by key (case-insensitive). */
export function lookupGloss(key: string | undefined): GlossEntry | undefined {
  if (!key) return undefined;
  return GLOSSARY[key] ?? GLOSSARY[key.toLowerCase()];
}

/** Whether a key resolves to a glossary entry (for guarding interactivity). */
export function hasGloss(key: string | undefined): boolean {
  return lookupGloss(key) !== undefined;
}
