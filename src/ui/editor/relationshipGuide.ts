import { lookupGloss, type GlossEntry } from '@/domain/model';
import type { SyntacticRole } from '@/domain/schema';

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
