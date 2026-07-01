import { lookupGloss, type GlossEntry } from '@/domain/model';
import type {
  KrDocument,
  Language,
  PartOfSpeech,
  Relation,
  SyntacticRole,
  SyntaxNode,
  Token,
} from '@/domain/schema';

/**
 * DETAILED RELATIONSHIP REFERENCE for the Edit-mode guide.
 *
 * The plain-language DEFINITION of each relationship already lives once in the
 * shared GLOSSARY (so the label detail panel and this guide never drift). Here we
 * add, per relationship, the two things the definition alone can't show an editor:
 *   - a short EXAMPLE of the relationship in use, and
 *   - how it is DRAWN in each of the two structural lenses — the Kellogg-Reed
 *     diagram and the Dependency tree — so you can predict what an edit will do.
 *
 * Grouped by the same families the schema uses (see `SyntacticRoleSchema`).
 */
export interface RelationshipDoc {
  role: SyntacticRole;
  /** A short phrase showing the relationship at work (the dependent in **bold**). */
  example: string;
  /** How this relationship is drawn in the Kellogg-Reed diagram. */
  kr: string;
  /** How it appears in the Dependency tree (a tagged arc head → dependent). */
  tree: string;
}

export interface RelationshipFamily {
  title: string;
  blurb: string;
  roles: RelationshipDoc[];
}

/** The glossary entry (term · abbr · definition) for a relationship role. */
export function relationshipGloss(role: SyntacticRole): GlossEntry {
  return (
    lookupGloss(role) ?? { term: role, detail: 'This relationship has not yet been classified.' }
  );
}

export const RELATIONSHIP_GUIDE: RelationshipFamily[] = [
  {
    title: 'Clause structure',
    blurb: 'The backbone of a clause — who does what, and the verb that carries it.',
    roles: [
      {
        role: 'subject',
        example: '**The Word** became flesh · **ὁ λόγος** ἦν',
        kr: 'Sits on the main line to the LEFT of the subject–predicate divider (the full vertical line crossing the baseline).',
        tree: 'An arc from the verb down to the subject, tagged “subj”.',
      },
      {
        role: 'predicate',
        example: 'The Word **became** flesh · ὁ λόγος **ἦν**',
        kr: 'The verb on the main line, RIGHT of the subject–predicate divider; its objects and modifiers hang from it.',
        tree: 'Usually the ROOT of the tree — every other word ultimately points back to it.',
      },
      {
        role: 'copula',
        example: 'the Word **was** God',
        kr: 'A linking verb on the main line; the predicate noun/adjective that follows is set off by a line slanting back toward it.',
        tree: 'Marked as a linking verb (“cop”) rather than an action predicate.',
      },
      {
        role: 'clause',
        example: 'the light **that shines** · the man **who came**',
        kr: 'A subordinate/relative clause hangs beneath its governing word on a DOTTED stem down to its own fully drawn sub-baseline.',
        tree: 'A whole sub-tree attaches under the word it modifies or completes.',
      },
    ],
  },
  {
    title: 'Verbal arguments & complements',
    blurb: 'What the verb takes to complete its meaning — objects and predicate complements.',
    roles: [
      {
        role: 'directObject',
        example: 'she reads **the book** · ἀγαπῶμεν **ἀλλήλους**',
        kr: 'On the main line after the verb, set off by an upright VERTICAL tick standing on the baseline.',
        tree: 'An arc from the verb to the object, tagged “obj”.',
      },
      {
        role: 'indirectObject',
        example: 'give **me** the book · gave **the woman** …',
        kr: 'Hangs BELOW the verb on a slanted stem to its own short baseline — not on the main line (that is the direct object’s place).',
        tree: 'An arc from the verb to the recipient, tagged “iobj”.',
      },
      {
        role: 'predicateNominative',
        example: 'the Word was **God** · **θεὸς** ἦν ὁ λόγος',
        kr: 'On the main line after a linking verb, set off by a line that SLANTS BACK toward the verb (not an upright tick).',
        tree: 'An arc from the linking verb to the noun, tagged “pred-nom”.',
      },
      {
        role: 'predicateAdjective',
        example: 'the LORD is **good**',
        kr: 'Like a predicate nominative — on the main line, set off by a back-slanted line toward the verb.',
        tree: 'An arc from the linking verb to the adjective, tagged “pred-adj”.',
      },
      {
        role: 'objectComplement',
        example: 'they made him **king**',
        kr: 'On the main line after the direct object it completes, set off by a back-slant.',
        tree: 'An arc from the object (or verb) to the completing word, tagged “o-comp”.',
      },
      {
        role: 'dativeComplement',
        example: 'obeys **the voice** (dative)',
        kr: 'On the main line after the verb with a vertical tick, like an object.',
        tree: 'An arc from the verb to the dative noun, tagged “dat”.',
      },
      {
        role: 'genitiveComplement',
        example: 'αὐθεντεῖν **ἀνδρός** — to have authority over **a man**',
        kr: 'On the main line after the verb with a vertical tick, like an object.',
        tree: 'An arc from the verb to the genitive noun, tagged “gen”.',
      },
      {
        role: 'agent',
        example: 'baptised **by John** · ὑπὸ **Ἰωάννου**',
        kr: 'Hangs below the passive verb like a prepositional phrase — “by …”.',
        tree: 'An arc from the passive verb to the agent, tagged “agent”.',
      },
    ],
  },
  {
    title: 'Modification',
    blurb: 'Words that describe or specify another word — adjectives, articles, genitives, phrases.',
    roles: [
      {
        role: 'adjectival',
        example: 'the **good** shepherd · a **relative clause** modifying a noun',
        kr: 'Slants on a diagonal BENEATH the noun it describes.',
        tree: 'An arc from the noun down to its modifier, tagged “adj”.',
      },
      {
        role: 'adverbial',
        example: 'ran **quickly** · learns **in quietness**',
        kr: 'Slants on a diagonal beneath the verb (or adjective/adverb) it modifies.',
        tree: 'An arc from the verb to the modifier, tagged “adv”.',
      },
      {
        role: 'determiner',
        example: '**the** Word · **ὁ** λόγος',
        kr: 'Slants on a short diagonal beneath its noun. In Greek it attaches by case/gender/number agreement, not word order.',
        tree: 'An arc from the noun to the article, tagged “det”.',
      },
      {
        role: 'genitive',
        example: 'the servant **of Christ** · δοῦλος **Χριστοῦ**',
        kr: 'Hangs beneath its noun on a slant, on its own short baseline (a noun modifier — “of …”).',
        tree: 'An arc from the head noun to the genitive noun, tagged “gen”.',
      },
      {
        role: 'apposition',
        example: 'Paul, **an apostle** · Ἰησοῦ **Χριστοῦ**',
        kr: 'Continues on the SAME baseline as the noun it renames, joined by an equals sign (=).',
        tree: 'An arc between the two nouns, tagged “appos”.',
      },
      {
        role: 'prepositionalPhrase',
        example: '**in the beginning** · **ἐν** ἀρχῇ',
        kr: 'The preposition rides a diagonal beneath its head; its object sits on a horizontal baseline below it.',
        tree: 'An arc from the head to the preposition, tagged “pp”.',
      },
      {
        role: 'prepositionObject',
        example: 'in **the beginning** · ἐν **ἀρχῇ**',
        kr: 'The noun on the horizontal baseline below the preposition’s diagonal.',
        tree: 'An arc from the preposition to its object, tagged “p-obj”.',
      },
    ],
  },
  {
    title: 'Discourse & connectives',
    blurb: 'Words that join, address, or colour the flow rather than name a thing or action.',
    roles: [
      {
        role: 'conjunction',
        example: 'came **and** saw · **because** he loves',
        kr: 'Drawn between the elements it joins.',
        tree: 'Attaches to what it links, tagged “conj”.',
      },
      {
        role: 'coordinator',
        example: 'Paul **and** Timothy · διδάσκειν **οὐδὲ** αὐθεντεῖν',
        kr: 'Rides the DASHED coordination bar between the coordinated members (the fork’s bar or the clause spine).',
        tree: 'Marks the join between coordinated elements, tagged “coord”.',
      },
      {
        role: 'conjunct',
        example: 'Paul and **Timothy** · faith, hope, and **love**',
        kr: 'A coordinated member drawn on a PARALLEL baseline, joined into the coordination fork.',
        tree: 'An arc from the first member (the head) to each further member, tagged “conj”.',
      },
      {
        role: 'particle',
        example: '**δέ**, **γάρ**, **μέν**, **οὖν** …',
        kr: 'Hangs on a short stem near the word or clause it colours.',
        tree: 'Attaches to its host, tagged “ptcl”.',
      },
      {
        role: 'vocative',
        example: '**Lord**, save us · **κύριε** …',
        kr: 'Set apart from the clause on its own short line (direct address).',
        tree: 'Attaches to the clause, tagged “voc”.',
      },
      {
        role: 'interjection',
        example: '**Behold!** · **ἰδού**',
        kr: 'Set apart from the clause grammar on its own line.',
        tree: 'Attaches loosely to the clause, tagged “intj”.',
      },
    ],
  },
  {
    title: 'Catch-all',
    blurb: 'For attachments whose precise role you haven’t pinned down yet.',
    roles: [
      {
        role: 'adjunct',
        example: 'an optional modifier of unspecified role',
        kr: 'Hangs beneath its head on a diagonal, like a generic modifier.',
        tree: 'An arc from the head to the word, tagged “adjunct”.',
      },
      {
        role: 'unknown',
        example: 'not yet classified',
        kr: 'Drawn generically beneath its head until you give it a role.',
        tree: 'An untyped arc from the head to the word.',
      },
    ],
  },
];

/** Every role documented above — used to guard against a role slipping through. */
export const DOCUMENTED_ROLES: SyntacticRole[] = RELATIONSHIP_GUIDE.flatMap((f) =>
  f.roles.map((r) => r.role),
);

// ── Tiny worked examples, rendered live as KR + Dependency mini-diagrams ───────

/**
 * One word of a demo sentence: its surface, part of speech, the role of its node,
 * and (for a modifier) the INDEX of the word it attaches to. A word with no `head`
 * attaches to the root clause (subject / predicate). Kept deliberately tiny so the
 * rendered diagram reads at a glance beside the description.
 */
export interface DemoWord {
  s: string;
  pos: PartOfSpeech;
  role: SyntacticRole;
  head?: number;
}

/** Build a minimal, valid KrDocument from a demo sentence, ready to lay out. */
export function buildDemoDoc(words: DemoWord[], language: Language = 'en'): KrDocument {
  const tokens: Token[] = words.map((w, i) => ({
    id: `t${i}`,
    index: i,
    surface: w.s,
    pos: w.pos,
    language,
  }));
  const nodes: SyntaxNode[] = [
    { id: 'c0', kind: 'clause', clauseType: 'independent', tokenIds: [] },
    ...words.map((w, i) => ({
      id: `n${i}`,
      kind: 'word' as const,
      tokenIds: [`t${i}`],
      role: w.role,
    })),
  ];
  const relations: Relation[] = words.map((w, i) => ({
    id: `r${i}`,
    type: w.role,
    headId: w.head == null ? 'c0' : `n${w.head}`,
    dependentId: `n${i}`,
  }));
  return {
    schemaVersion: 1,
    id: 'demo',
    title: 'demo',
    language,
    text: words.map((w) => w.s).join(' '),
    notes: '',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    layoutHints: {},
    tokens,
    syntax: { rootId: 'c0', nodes, relations },
  };
}

// Shared demos (one construction illustrates several roles).
const COORDINATION: DemoWord[] = [
  { s: 'Paul', pos: 'propernoun', role: 'subject' },
  { s: 'and', pos: 'conjunction', role: 'coordinator', head: 0 },
  { s: 'Timothy', pos: 'propernoun', role: 'conjunct', head: 0 },
  { s: 'serve', pos: 'verb', role: 'predicate' },
];
const PREP_PHRASE: DemoWord[] = [
  { s: 'waits', pos: 'verb', role: 'predicate' },
  { s: 'in', pos: 'preposition', role: 'prepositionalPhrase', head: 0 },
  { s: 'silence', pos: 'noun', role: 'prepositionObject', head: 1 },
];

/**
 * Per-role demo sentences. Not every role gets one — a bare `clause`, a discourse
 * `particle`, or the `unknown` catch-all read better as words than as a lone
 * mini-diagram — those fall back to the text description only.
 */
export const ROLE_DEMOS: Partial<Record<SyntacticRole, DemoWord[]>> = {
  subject: [
    { s: 'Birds', pos: 'noun', role: 'subject' },
    { s: 'fly', pos: 'verb', role: 'predicate' },
  ],
  predicate: [
    { s: 'Birds', pos: 'noun', role: 'subject' },
    { s: 'fly', pos: 'verb', role: 'predicate' },
  ],
  copula: [
    { s: 'Word', pos: 'noun', role: 'subject' },
    { s: 'is', pos: 'verb', role: 'copula' },
    { s: 'God', pos: 'noun', role: 'predicateNominative', head: 1 },
  ],
  directObject: [
    { s: 'She', pos: 'pronoun', role: 'subject' },
    { s: 'reads', pos: 'verb', role: 'predicate' },
    { s: 'books', pos: 'noun', role: 'directObject', head: 1 },
  ],
  indirectObject: [
    { s: 'gives', pos: 'verb', role: 'predicate' },
    { s: 'her', pos: 'pronoun', role: 'indirectObject', head: 0 },
    { s: 'books', pos: 'noun', role: 'directObject', head: 0 },
  ],
  predicateNominative: [
    { s: 'Word', pos: 'noun', role: 'subject' },
    { s: 'is', pos: 'verb', role: 'predicate' },
    { s: 'God', pos: 'noun', role: 'predicateNominative', head: 1 },
  ],
  predicateAdjective: [
    { s: 'God', pos: 'noun', role: 'subject' },
    { s: 'is', pos: 'verb', role: 'predicate' },
    { s: 'good', pos: 'adjective', role: 'predicateAdjective', head: 1 },
  ],
  objectComplement: [
    { s: 'They', pos: 'pronoun', role: 'subject' },
    { s: 'made', pos: 'verb', role: 'predicate' },
    { s: 'him', pos: 'pronoun', role: 'directObject', head: 1 },
    { s: 'king', pos: 'noun', role: 'objectComplement', head: 2 },
  ],
  dativeComplement: [
    { s: 'obeys', pos: 'verb', role: 'predicate' },
    { s: 'voice', pos: 'noun', role: 'dativeComplement', head: 0 },
  ],
  genitiveComplement: [
    { s: 'rules', pos: 'verb', role: 'predicate' },
    { s: 'men', pos: 'noun', role: 'genitiveComplement', head: 0 },
  ],
  agent: [
    { s: 'sent', pos: 'verb', role: 'predicate' },
    { s: 'by', pos: 'preposition', role: 'agent', head: 0 },
    { s: 'God', pos: 'noun', role: 'prepositionObject', head: 1 },
  ],
  adjectival: [
    { s: 'Good', pos: 'adjective', role: 'adjectival', head: 1 },
    { s: 'shepherds', pos: 'noun', role: 'subject' },
    { s: 'lead', pos: 'verb', role: 'predicate' },
  ],
  adverbial: [
    { s: 'runs', pos: 'verb', role: 'predicate' },
    { s: 'quickly', pos: 'adverb', role: 'adverbial', head: 0 },
  ],
  determiner: [
    { s: 'The', pos: 'article', role: 'determiner', head: 1 },
    { s: 'light', pos: 'noun', role: 'subject' },
    { s: 'shines', pos: 'verb', role: 'predicate' },
  ],
  genitive: [
    { s: 'servants', pos: 'noun', role: 'subject' },
    { s: 'God', pos: 'noun', role: 'genitive', head: 0 },
    { s: 'serve', pos: 'verb', role: 'predicate' },
  ],
  apposition: [
    { s: 'Paul', pos: 'propernoun', role: 'subject' },
    { s: 'apostle', pos: 'noun', role: 'apposition', head: 0 },
    { s: 'writes', pos: 'verb', role: 'predicate' },
  ],
  prepositionalPhrase: PREP_PHRASE,
  prepositionObject: PREP_PHRASE,
  // `conjunction` (a general joiner) shares no literal relation with the fork
  // demo below, so it stays text-only; `coordinator`/`conjunct` show the fork.
  coordinator: COORDINATION,
  conjunct: COORDINATION,
  vocative: [
    { s: 'Lord', pos: 'noun', role: 'vocative' },
    { s: 'save', pos: 'verb', role: 'predicate' },
    { s: 'us', pos: 'pronoun', role: 'directObject', head: 1 },
  ],
  interjection: [
    { s: 'Behold', pos: 'interjection', role: 'interjection' },
    { s: 'he', pos: 'pronoun', role: 'subject' },
    { s: 'comes', pos: 'verb', role: 'predicate' },
  ],
};
