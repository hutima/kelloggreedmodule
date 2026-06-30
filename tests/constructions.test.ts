import { describe, it, expect } from 'vitest';
import { layoutDocument } from '@/domain/layout';
import { impliedSubjectVerbPairs } from '@/domain/model';
import { KrDocumentSchema, type KrDocument } from '@/domain/schema';

/**
 * Standard Kellogg-Reed constructions integrated for fuller diagramming:
 * compound predicate (fork sharing one object), direct address (floating line),
 * stacked adverb modifiers (slants), and the infinitive (empty diagonal +
 * horizontal). Each builds a minimal document and asserts the distinguishing
 * geometry the renderer must emit.
 */
function build(nodes: unknown[], relations: unknown[], tokens: unknown[], text = 't', rootId = 'n_root'): KrDocument {
  return KrDocumentSchema.parse({
    schemaVersion: 1, id: 'doc', title: 't', language: 'en', text,
    createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
    layoutHints: {}, tokens, syntax: { rootId, nodes, relations },
  });
}
const texts = (l: ReturnType<typeof layoutDocument>) =>
  l.elements.filter((e) => e.kind === 'text').map((e) => (e as { text: string }).text);
const textEl = (l: ReturnType<typeof layoutDocument>, t: string) =>
  l.elements.find((e) => e.kind === 'text' && (e as { text: string }).text === t) as
    | { x: number; y: number; rotate?: number }
    | undefined;

describe('a preposition slant lengthens to carry a long (gloss) label', () => {
  // The preposition rides the slant; a long English gloss ("according to") must
  // get a longer slant so it doesn't overhang onto neighbouring rows. A short
  // preposition keeps the compact geometry (Greek and English lay out separately).
  const pp = (prep: string) =>
    build(
      [
        { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'S', kind: 'word', role: 'subject', tokenIds: ['s'] },
        { id: 'V', kind: 'word', role: 'predicate', tokenIds: ['v'] },
        { id: 'P', kind: 'word', role: 'prepositionalPhrase', tokenIds: ['p'] },
        { id: 'O', kind: 'word', role: 'prepositionObject', tokenIds: ['o'] },
      ],
      [
        { id: 'r1', type: 'subject', headId: 'n_root', dependentId: 'S' },
        { id: 'r2', type: 'predicate', headId: 'n_root', dependentId: 'V' },
        { id: 'r3', type: 'prepositionalPhrase', headId: 'V', dependentId: 'P' },
        { id: 'r4', type: 'prepositionObject', headId: 'P', dependentId: 'O' },
      ],
      [
        { id: 's', index: 0, surface: 'he', pos: 'pronoun' },
        { id: 'v', index: 1, surface: 'works', pos: 'verb' },
        { id: 'p', index: 2, surface: prep, pos: 'preposition' },
        { id: 'o', index: 3, surface: 'pleasure', pos: 'noun' },
      ],
    );

  it('drops the object deeper for a long preposition than a short one', () => {
    const shortObj = textEl(layoutDocument(pp('in')), 'pleasure')!;
    const longObj = textEl(layoutDocument(pp('according to')), 'pleasure')!;
    expect(shortObj).toBeDefined();
    expect(longObj).toBeDefined();
    // The long-label slant is longer, so its object baseline sits lower.
    expect(longObj.y).toBeGreaterThan(shortObj.y + 20);
  });
});

describe('a coordinator attached to a conjunct rides the fork bar (not a slant)', () => {
  // Some parses hang the ἀλλά of an "οὐ … ἀλλά" pair on the SECOND member rather
  // than the coordination head (e.g. Php 2:27). It must still be drawn as a
  // coordinator on the fork bar — rotated — never leak out as a modifier slant.
  const doc = build(
    [
      { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
      { id: 'S', kind: 'word', role: 'subject', tokenIds: ['s'] },
      { id: 'V', kind: 'word', role: 'predicate', tokenIds: ['v'] },
      { id: 'A', kind: 'word', role: 'directObject', tokenIds: ['a'] },
      { id: 'B', kind: 'word', role: 'conjunct', tokenIds: ['b'] },
      { id: 'C', kind: 'word', role: 'coordinator', tokenIds: ['c'] },
    ],
    [
      { id: 'r1', type: 'subject', headId: 'n_root', dependentId: 'S' },
      { id: 'r2', type: 'predicate', headId: 'n_root', dependentId: 'V' },
      { id: 'r3', type: 'directObject', headId: 'V', dependentId: 'A' },
      { id: 'r4', type: 'conjunct', headId: 'A', dependentId: 'B' },
      // coordinator hangs off the CONJUNCT B, not the head A
      { id: 'r5', type: 'coordinator', headId: 'B', dependentId: 'C' },
    ],
    [
      { id: 's', index: 0, surface: 'they', pos: 'pronoun' },
      { id: 'v', index: 1, surface: 'chose', pos: 'verb' },
      { id: 'a', index: 2, surface: 'him', pos: 'pronoun' },
      { id: 'c', index: 3, surface: 'but', pos: 'conjunction' },
      { id: 'b', index: 4, surface: 'me', pos: 'pronoun' },
    ],
  );

  it('draws the conjunct coordinator once, rotated on the bar', () => {
    const layout = layoutDocument(doc);
    const but = layout.elements.filter(
      (e) => e.kind === 'text' && (e as { text: string }).text === 'but',
    ) as { rotate?: number }[];
    expect(but).toHaveLength(1); // not dropped, not duplicated
    expect(but[0]!.rotate).toBe(-90); // on the coordination bar, not a ~57° slant
  });
});

describe('compound predicate sharing one object', () => {
  // "Samantha proofreads and edits her essays."
  const doc = build(
    [
      { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
      { id: 'S', kind: 'word', role: 'subject', tokenIds: ['s'] },
      { id: 'V1', kind: 'word', role: 'predicate', tokenIds: ['v1'] },
      { id: 'C', kind: 'word', role: 'coordinator', tokenIds: ['c'] },
      { id: 'V2', kind: 'word', role: 'conjunct', tokenIds: ['v2'] },
      { id: 'O', kind: 'word', role: 'directObject', tokenIds: ['o'] },
    ],
    [
      { id: 'r1', type: 'subject', headId: 'n_root', dependentId: 'S' },
      { id: 'r2', type: 'predicate', headId: 'n_root', dependentId: 'V1' },
      { id: 'r3', type: 'conjunct', headId: 'V1', dependentId: 'V2' },
      { id: 'r4', type: 'coordinator', headId: 'V1', dependentId: 'C' },
      { id: 'r5', type: 'directObject', headId: 'V1', dependentId: 'O' },
    ],
    [
      { id: 's', index: 0, surface: 'Samantha', pos: 'propernoun' },
      { id: 'v1', index: 1, surface: 'proofreads', pos: 'verb' },
      { id: 'c', index: 2, surface: 'and', pos: 'conjunction' },
      { id: 'v2', index: 3, surface: 'edits', pos: 'verb' },
      { id: 'o', index: 4, surface: 'essays', pos: 'noun' },
    ],
  );

  it('draws both verbs and keeps the object once', () => {
    const layout = layoutDocument(doc);
    const t = texts(layout);
    expect(t).toContain('proofreads');
    expect(t).toContain('edits'); // previously dropped entirely
    expect(t.filter((x) => x === 'essays')).toHaveLength(1);
    // The fork uses coordination lines.
    expect(layout.elements.some((e) => e.kind === 'line' && (e as { role: string }).role === 'coordination')).toBe(true);
  });
});

describe('indirect object hangs below the verb (not on the baseline)', () => {
  // "She gave the man a book." — `man` is the indirect object: in Reed-Kellogg it
  // drops below the verb on a slanted line, unlike the direct object `book`,
  // which sits on the baseline with an upright tick.
  const doc = build(
    [
      { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
      { id: 'S', kind: 'word', role: 'subject', tokenIds: ['s'] },
      { id: 'V', kind: 'word', role: 'predicate', tokenIds: ['v'] },
      { id: 'DO', kind: 'word', role: 'directObject', tokenIds: ['do'] },
      { id: 'IO', kind: 'word', role: 'indirectObject', tokenIds: ['io'] },
    ],
    [
      { id: 'r1', type: 'subject', headId: 'n_root', dependentId: 'S' },
      { id: 'r2', type: 'predicate', headId: 'n_root', dependentId: 'V' },
      { id: 'r3', type: 'directObject', headId: 'V', dependentId: 'DO' },
      { id: 'r4', type: 'indirectObject', headId: 'V', dependentId: 'IO' },
    ],
    [
      { id: 's', index: 0, surface: 'She', pos: 'pronoun' },
      { id: 'v', index: 1, surface: 'gave', pos: 'verb' },
      { id: 'do', index: 2, surface: 'book', pos: 'noun' },
      { id: 'io', index: 3, surface: 'man', pos: 'noun' },
    ],
  );

  it('places the indirect object below the verb and direct object', () => {
    const layout = layoutDocument(doc);
    const verb = textEl(layout, 'gave')!;
    const dObj = textEl(layout, 'book')!;
    const iObj = textEl(layout, 'man')!;
    expect(iObj).toBeDefined(); // not dropped
    // The direct object sits on the baseline with the verb; the indirect object
    // hangs well below both.
    expect(Math.abs(dObj.y - verb.y)).toBeLessThan(8);
    expect(iObj.y).toBeGreaterThan(verb.y + 10);
  });
});

describe('direct address floats on its own line', () => {
  // "Heitor, address the class."
  const doc = build(
    [
      { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
      { id: 'SUBJ', kind: 'word', role: 'subject', tokenIds: [], implied: true, label: '(you)' },
      { id: 'V', kind: 'word', role: 'predicate', tokenIds: ['v'] },
      { id: 'O', kind: 'word', role: 'directObject', tokenIds: ['o'] },
      { id: 'VOC', kind: 'word', role: 'vocative', tokenIds: ['h'] },
    ],
    [
      { id: 'r1', type: 'subject', headId: 'n_root', dependentId: 'SUBJ' },
      { id: 'r2', type: 'predicate', headId: 'n_root', dependentId: 'V' },
      { id: 'r3', type: 'directObject', headId: 'V', dependentId: 'O' },
      { id: 'r4', type: 'vocative', headId: 'n_root', dependentId: 'VOC' },
    ],
    [
      { id: 'v', index: 1, surface: 'address', pos: 'verb' },
      { id: 'o', index: 2, surface: 'class', pos: 'noun' },
      { id: 'h', index: 0, surface: 'Heitor', pos: 'propernoun' },
    ],
  );

  it('places the vocative above the verb, unconnected', () => {
    const layout = layoutDocument(doc);
    const heitor = textEl(layout, 'Heitor');
    const verb = textEl(layout, 'address');
    expect(heitor).toBeDefined();
    expect(verb).toBeDefined();
    // Floats clearly above the main line.
    expect(heitor!.y).toBeLessThan(verb!.y - 20);
  });
});

describe('infinitive: empty diagonal + horizontal', () => {
  // "θέλω περιπατῆσαι" — a single-word Greek infinitive object.
  const doc = build(
    [
      { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
      { id: 'V', kind: 'word', role: 'predicate', tokenIds: ['v'] },
      { id: 'INF', kind: 'clause', clauseType: 'infinitival', tokenIds: [] },
      { id: 'IV', kind: 'word', role: 'predicate', tokenIds: ['iv'] },
    ],
    [
      { id: 'r1', type: 'predicate', headId: 'n_root', dependentId: 'V' },
      { id: 'r2', type: 'directObject', headId: 'V', dependentId: 'INF' },
      { id: 'r3', type: 'predicate', headId: 'INF', dependentId: 'IV' },
    ],
    [
      { id: 'v', index: 0, surface: 'θέλω', pos: 'verb' },
      { id: 'iv', index: 1, surface: 'περιπατῆσαι', pos: 'infinitive' },
    ],
    'θέλω περιπατῆσαι',
  );

  it('hangs the infinitive on a horizontal below an empty diagonal (no subject divider)', () => {
    const layout = layoutDocument(doc);
    const verb = textEl(layout, 'θέλω');
    const inf = textEl(layout, 'περιπατῆσαι');
    expect(inf!.y).toBeGreaterThan(verb!.y + 10); // infinitive sits below the line
    // Only the finite root shows "(subject)"; the infinitive phrase has none of
    // its own (no second placeholder, no divider for the infinitive).
    expect(texts(layout).filter((x) => x === '(subject)')).toHaveLength(1);
    // A slant (diagonal) connector exists.
    expect(layout.elements.some((e) => e.kind === 'line' && (e as { role: string }).role === 'slant')).toBe(true);
  });
});

describe('adverbial PP rides the diagonal (verb-attached)', () => {
  // "barks ἐν ἀγάπῃ" — a preposition attached to the verb as an adverbial must
  // still ride the diagonal, with its object on the horizontal below.
  const doc = build(
    [
      { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
      { id: 'S', kind: 'word', role: 'subject', tokenIds: ['s'] },
      { id: 'V', kind: 'word', role: 'predicate', tokenIds: ['v'] },
      { id: 'P', kind: 'word', role: 'adverbial', tokenIds: ['p'] },
      { id: 'OBJ', kind: 'word', role: 'prepositionObject', tokenIds: ['o'] },
    ],
    [
      { id: 'r1', type: 'subject', headId: 'n_root', dependentId: 'S' },
      { id: 'r2', type: 'predicate', headId: 'n_root', dependentId: 'V' },
      { id: 'r3', type: 'adverbial', headId: 'V', dependentId: 'P' },
      { id: 'r4', type: 'prepositionObject', headId: 'P', dependentId: 'OBJ' },
    ],
    [
      { id: 's', index: 0, surface: 'dog', pos: 'noun' },
      { id: 'v', index: 1, surface: 'barks', pos: 'verb' },
      { id: 'p', index: 2, surface: 'ἐν', pos: 'preposition' },
      { id: 'o', index: 3, surface: 'ἀγάπῃ', pos: 'noun' },
    ],
  );

  it('writes the preposition rotated on the slant, the object on a horizontal', () => {
    const layout = layoutDocument(doc);
    const prep = textEl(layout, 'ἐν');
    const obj = textEl(layout, 'ἀγάπῃ');
    expect(prep?.rotate).toBeDefined();
    expect(Math.abs(prep!.rotate!)).toBeGreaterThan(15);
    expect(obj?.rotate ?? 0).toBe(0); // object sits flat on its baseline
    expect(obj!.y).toBeGreaterThan(prep!.y); // below the verb line
  });
});

describe('compound sentence joins verb-to-verb', () => {
  // "Boggs hit the ball, but he ran." — two independent clauses.
  const doc = build(
    [
      { id: 'W', kind: 'clause', clauseType: 'coordinate', tokenIds: [] },
      { id: 'C1', kind: 'clause', clauseType: 'independent', tokenIds: [] },
      { id: 'S1', kind: 'word', role: 'subject', tokenIds: ['b'] },
      { id: 'V1', kind: 'word', role: 'predicate', tokenIds: ['hit'] },
      { id: 'BUT', kind: 'word', role: 'coordinator', tokenIds: ['but'] },
      { id: 'C2', kind: 'clause', clauseType: 'independent', tokenIds: [] },
      { id: 'S2', kind: 'word', role: 'subject', tokenIds: ['he'] },
      { id: 'V2', kind: 'word', role: 'predicate', tokenIds: ['ran'] },
    ],
    [
      { id: 'a', type: 'conjunct', headId: 'W', dependentId: 'C1' },
      { id: 'b', type: 'coordinator', headId: 'W', dependentId: 'BUT' },
      { id: 'c', type: 'conjunct', headId: 'W', dependentId: 'C2' },
      { id: 'd', type: 'subject', headId: 'C1', dependentId: 'S1' },
      { id: 'e', type: 'predicate', headId: 'C1', dependentId: 'V1' },
      { id: 'g', type: 'subject', headId: 'C2', dependentId: 'S2' },
      { id: 'h', type: 'predicate', headId: 'C2', dependentId: 'V2' },
    ],
    [
      { id: 'b', index: 0, surface: 'Boggs', pos: 'propernoun' },
      { id: 'hit', index: 1, surface: 'hit', pos: 'verb' },
      { id: 'but', index: 2, surface: 'but', pos: 'conjunction' },
      { id: 'he', index: 3, surface: 'he', pos: 'pronoun' },
      { id: 'ran', index: 4, surface: 'ran', pos: 'verb' },
    ],
    'Boggs hit but he ran',
    'W',
  );

  it('aligns the two verbs in a column joined by a dashed bar', () => {
    const layout = layoutDocument(doc);
    const hit = textEl(layout, 'hit');
    const ran = textEl(layout, 'ran');
    // Verbs aligned (same x), stacked (different y), conjunction present.
    expect(Math.abs(hit!.x - ran!.x)).toBeLessThan(2);
    expect(ran!.y).toBeGreaterThan(hit!.y + 20);
    expect(texts(layout)).toContain('but');
  });
});

describe('comparative joins a than-clause with a dashed connector', () => {
  // "Joanna is taller than her brother [is]."
  const doc = build(
    [
      { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
      { id: 'S', kind: 'word', role: 'subject', tokenIds: ['j'] },
      { id: 'V', kind: 'word', role: 'copula', tokenIds: ['is'] },
      { id: 'TA', kind: 'word', role: 'predicateAdjective', tokenIds: ['ta'] },
      { id: 'CMP', kind: 'clause', clauseType: 'adverbial', tokenIds: [] },
      { id: 'BR', kind: 'word', role: 'subject', tokenIds: ['br'] },
    ],
    [
      { id: 'r1', type: 'subject', headId: 'n_root', dependentId: 'S' },
      { id: 'r2', type: 'copula', headId: 'n_root', dependentId: 'V' },
      { id: 'r3', type: 'predicateAdjective', headId: 'V', dependentId: 'TA' },
      { id: 'r5', type: 'adjunct', headId: 'TA', dependentId: 'CMP', label: 'than' },
      { id: 'r6', type: 'subject', headId: 'CMP', dependentId: 'BR' },
    ],
    [
      { id: 'j', index: 0, surface: 'Joanna', pos: 'propernoun' },
      { id: 'is', index: 1, surface: 'is', pos: 'verb' },
      { id: 'ta', index: 2, surface: 'taller', pos: 'adjective', morphology: { degree: 'comparative' } },
      { id: 'br', index: 3, surface: 'brother', pos: 'noun' },
    ],
  );

  it('writes "than" on a dashed connector to the comparison clause', () => {
    const layout = layoutDocument(doc);
    expect(texts(layout)).toContain('than');
    expect(texts(layout)).toContain('brother');
    // Predicate adjective uses the back-slant separator; comparison hangs dashed.
    expect(layout.elements.some((e) => e.kind === 'line' && (e as { style: string }).style === 'dashed')).toBe(true);
  });
});

describe('coordinated adjectives ride parallel slants', () => {
  // "tall and distinguished" modifying a noun.
  const doc = build(
    [
      { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
      { id: 'S', kind: 'word', role: 'subject', tokenIds: ['s'] },
      { id: 'V', kind: 'word', role: 'predicate', tokenIds: ['v'] },
      { id: 'TA', kind: 'word', role: 'adjectival', tokenIds: ['ta'] },
      { id: 'AND', kind: 'word', role: 'coordinator', tokenIds: ['an'] },
      { id: 'DI', kind: 'word', role: 'conjunct', tokenIds: ['di'] },
    ],
    [
      { id: 'r1', type: 'subject', headId: 'n_root', dependentId: 'S' },
      { id: 'r2', type: 'predicate', headId: 'n_root', dependentId: 'V' },
      { id: 'r5', type: 'adjectival', headId: 'S', dependentId: 'TA' },
      { id: 'r6', type: 'coordinator', headId: 'TA', dependentId: 'AND' },
      { id: 'r7', type: 'conjunct', headId: 'TA', dependentId: 'DI' },
    ],
    [
      { id: 's', index: 0, surface: 'man', pos: 'noun' },
      { id: 'v', index: 1, surface: 'stood', pos: 'verb' },
      { id: 'ta', index: 2, surface: 'tall', pos: 'adjective' },
      { id: 'an', index: 3, surface: 'and', pos: 'conjunction' },
      { id: 'di', index: 4, surface: 'old', pos: 'adjective' },
    ],
  );

  it('draws both adjectives rotated on slants joined by a dashed coordinator', () => {
    const layout = layoutDocument(doc);
    const tall = textEl(layout, 'tall');
    const old = textEl(layout, 'old');
    expect(tall?.rotate).toBeDefined();
    expect(old?.rotate).toBeDefined();
    // The coordinator bridges them with a dashed coordination line.
    expect(
      layout.elements.some(
        (e) => e.kind === 'line' && (e as { role: string }).role === 'coordination' && (e as { style: string }).style === 'dashed',
      ),
    ).toBe(true);
    expect(texts(layout)).toContain('and');
  });
});

describe('stacked adverb modifiers ride slants', () => {
  // "very friendly" — adverb modifying an adjective.
  const doc = build(
    [
      { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
      { id: 'DOG', kind: 'word', role: 'subject', tokenIds: ['d'] },
      { id: 'FR', kind: 'word', role: 'adjectival', tokenIds: ['f'] },
      { id: 'VE', kind: 'word', role: 'adverbial', tokenIds: ['ve'] },
      { id: 'V', kind: 'word', role: 'predicate', tokenIds: ['w'] },
    ],
    [
      { id: 'r1', type: 'subject', headId: 'n_root', dependentId: 'DOG' },
      { id: 'r2', type: 'adjectival', headId: 'DOG', dependentId: 'FR' },
      { id: 'r3', type: 'adverbial', headId: 'FR', dependentId: 'VE' },
      { id: 'r4', type: 'predicate', headId: 'n_root', dependentId: 'V' },
    ],
    [
      { id: 'd', index: 0, surface: 'dog', pos: 'noun' },
      { id: 'f', index: 1, surface: 'friendly', pos: 'adjective' },
      { id: 've', index: 2, surface: 'very', pos: 'adverb' },
      { id: 'w', index: 3, surface: 'barks', pos: 'verb' },
    ],
  );

  it('writes the qualifier rotated on a slant, not on a horizontal baseline', () => {
    const layout = layoutDocument(doc);
    const very = textEl(layout, 'very');
    const friendly = textEl(layout, 'friendly');
    expect(very?.rotate).toBeDefined();
    expect(Math.abs(very!.rotate!)).toBeGreaterThan(15);
    // "very" sits below "friendly" on the descending zig-zag.
    expect(very!.y).toBeGreaterThan(friendly!.y);
  });
});

describe('compound subject whose head carries a wide modifier', () => {
  // "God of-the-Lord-Jesus-Christ and Father is …": the head Θεός carries a long
  // right-cascading genitive, so the head word sits far left of the coordination
  // fork. Its baseline must still reach the fork (the prior bug left it detached).
  const doc = build(
    [
      { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
      { id: 'n_god', kind: 'word', role: 'subject', tokenIds: ['t_god'] },
      { id: 'n_gen', kind: 'word', role: 'genitive', tokenIds: ['t_gen'] },
      { id: 'n_and', kind: 'word', tokenIds: ['t_and'] },
      { id: 'n_father', kind: 'word', role: 'conjunct', tokenIds: ['t_father'] },
      { id: 'n_is', kind: 'word', role: 'predicate', tokenIds: ['t_is'] },
    ],
    [
      { id: 'r_s', type: 'subject', headId: 'n_root', dependentId: 'n_god' },
      { id: 'r_p', type: 'predicate', headId: 'n_root', dependentId: 'n_is' },
      { id: 'r_g', type: 'genitive', headId: 'n_god', dependentId: 'n_gen' },
      { id: 'r_c', type: 'coordinator', headId: 'n_god', dependentId: 'n_and' },
      { id: 'r_j', type: 'conjunct', headId: 'n_god', dependentId: 'n_father' },
    ],
    [
      { id: 't_god', index: 0, surface: 'God' },
      { id: 't_gen', index: 1, surface: 'ofTheLordJesusChristOurSavior' },
      { id: 't_and', index: 2, surface: 'and' },
      { id: 't_father', index: 3, surface: 'Father' },
      { id: 't_is', index: 4, surface: 'is' },
    ],
  );
  const l = layoutDocument(doc, {}, {});

  it('keeps the head connected to the coordination fork by a baseline', () => {
    const god = textEl(l, 'God')!;
    const gen = textEl(l, 'ofTheLordJesusChristOurSavior')!;
    // A horizontal baseline on the head's row that reaches PAST the wide genitive
    // toward the fork — without it the head word floats detached from the prong.
    const headBaselines = l.elements.filter(
      (e): e is typeof e & { x1: number; y1: number; x2: number; y2: number } =>
        e.kind === 'line' && Math.abs(e.y1 - e.y2) < 2 && Math.abs(e.y1 - god.y) < 30,
    );
    const reach = Math.max(0, ...headBaselines.map((e) => Math.max(e.x1, e.x2)));
    expect(reach).toBeGreaterThan(gen.x);
  });
});

describe('clause coordinated with a bare phrase (Matthew 4:4 shape)', () => {
  // "[lives the man] but by every word" — a headless COORDINATE clause whose
  // members are a clause AND a prepositional phrase, joined by "but". The phrase
  // must stack as a spine member BELOW the clause, not be swept into a lead stub
  // drawn on top of it.
  const doc = build(
    [
      { id: 'n_root', kind: 'clause', clauseType: 'coordinate', tokenIds: [] },
      { id: 'n_cl', kind: 'clause', clauseType: 'independent', tokenIds: [] },
      { id: 'n_lives', kind: 'word', role: 'predicate', tokenIds: ['t_lives'] },
      { id: 'n_man', kind: 'word', role: 'subject', tokenIds: ['t_man'] },
      { id: 'n_by', kind: 'word', tokenIds: ['t_by'] },
      { id: 'n_word', kind: 'word', role: 'prepositionObject', tokenIds: ['t_word'] },
      { id: 'n_but', kind: 'word', tokenIds: ['t_but'] },
    ],
    [
      { id: 'r_c1', type: 'conjunct', headId: 'n_root', dependentId: 'n_cl' },
      { id: 'r_c2', type: 'conjunct', headId: 'n_root', dependentId: 'n_by' },
      { id: 'r_co', type: 'coordinator', headId: 'n_root', dependentId: 'n_but' },
      { id: 'r_p', type: 'predicate', headId: 'n_cl', dependentId: 'n_lives' },
      { id: 'r_s', type: 'subject', headId: 'n_cl', dependentId: 'n_man' },
      { id: 'r_o', type: 'prepositionObject', headId: 'n_by', dependentId: 'n_word' },
    ],
    [
      { id: 't_lives', index: 0, surface: 'lives' },
      { id: 't_man', index: 1, surface: 'man' },
      { id: 't_but', index: 2, surface: 'but' },
      { id: 't_by', index: 3, surface: 'by' },
      { id: 't_word', index: 4, surface: 'word' },
    ],
  );
  const l = layoutDocument(doc, {}, {});

  it('stacks the phrase conjunct below the clause, not on top of it', () => {
    const lives = textEl(l, 'lives')!;
    const by = textEl(l, 'by')!;
    const man = textEl(l, 'man')!;
    // The phrase sits on its own member baseline BELOW the clause's verb…
    expect(by.y).toBeGreaterThan(lives.y + 20);
    // …and the coordinator "but" is written on the spine between them.
    expect(textEl(l, 'but')).toBeTruthy();
    // The phrase doesn't overlap the clause's subject row.
    expect(by.y).toBeGreaterThan(man.y + 20);
  });
});

describe('subject baseline reaches the subject|predicate divider', () => {
  // "the stones these become bread" — the subject "stones" carries two slanted
  // modifiers (the, these) whose words overhang their slants, making the subject
  // block wider than its baseline. The baseline must still reach the divider so
  // the subject doesn't float disconnected from the cross.
  const doc = build(
    [
      { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
      { id: 'n_stones', kind: 'word', role: 'subject', tokenIds: ['t_stones'] },
      { id: 'n_the', kind: 'word', role: 'determiner', tokenIds: ['t_the'] },
      { id: 'n_these', kind: 'word', role: 'adjectival', tokenIds: ['t_these'] },
      { id: 'n_become', kind: 'word', role: 'predicate', tokenIds: ['t_become'] },
      { id: 'n_bread', kind: 'word', role: 'predicateNominative', tokenIds: ['t_bread'] },
    ],
    [
      { id: 'r_s', type: 'subject', headId: 'n_root', dependentId: 'n_stones' },
      { id: 'r_d', type: 'determiner', headId: 'n_stones', dependentId: 'n_the' },
      { id: 'r_a', type: 'adjectival', headId: 'n_stones', dependentId: 'n_these' },
      { id: 'r_p', type: 'predicate', headId: 'n_root', dependentId: 'n_become' },
      { id: 'r_pn', type: 'predicateNominative', headId: 'n_become', dependentId: 'n_bread' },
    ],
    [
      { id: 't_stones', index: 0, surface: 'stones' },
      { id: 't_the', index: 1, surface: 'theLongArticle' },
      { id: 't_these', index: 2, surface: 'theseDemonstrative' },
      { id: 't_become', index: 3, surface: 'become' },
      { id: 't_bread', index: 4, surface: 'bread' },
    ],
  );
  const l = layoutDocument(doc, {}, {});

  it('a baseline reaches the cross at the subject\'s right edge', () => {
    const divider = l.elements.find(
      (e): e is typeof e & { x1: number; y1: number; x2: number; y2: number } =>
        e.kind === 'line' && (e as { role?: string }).role === 'divider',
    )!;
    const dx = divider.x1;
    const midY = (divider.y1 + divider.y2) / 2;
    const baselines = l.elements.filter(
      (e): e is typeof e & { x1: number; y1: number; x2: number; y2: number } =>
        e.kind === 'line' && (e as { role?: string }).role === 'baseline' &&
        Math.abs(e.y1 - e.y2) < 2 && Math.abs(e.y1 - midY) < 20,
    );
    const reach = Math.max(0, ...baselines.map((e) => Math.max(e.x1, e.x2)));
    expect(reach).toBeGreaterThanOrEqual(dx - 2);
  });
});

describe('implied subject ↔ verb pairing (grey auto-implied co-highlight)', () => {
  // A finite verb with a pro-drop implied subject: the implied "(he)" node and
  // the verb are paired so hovering either greys both.
  const doc = build(
    [
      { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
      { id: 'S', kind: 'word', role: 'subject', tokenIds: [], implied: true, label: '(he)' },
      { id: 'V', kind: 'word', role: 'predicate', tokenIds: ['v'] },
      { id: 'O', kind: 'word', role: 'directObject', tokenIds: ['o'] },
    ],
    [
      { id: 'r1', type: 'subject', headId: 'n_root', dependentId: 'S' },
      { id: 'r2', type: 'predicate', headId: 'n_root', dependentId: 'V' },
      { id: 'r3', type: 'directObject', headId: 'V', dependentId: 'O' },
    ],
    [
      { id: 'v', index: 0, surface: 'ἔγραψεν', pos: 'verb' },
      { id: 'o', index: 1, surface: 'ταῦτα', pos: 'pronoun' },
    ],
  );

  it('pairs the implied subject with its clause verb, both ways', () => {
    const pairs = impliedSubjectVerbPairs(doc.syntax);
    expect(pairs.get('S')?.has('V')).toBe(true);
    expect(pairs.get('V')?.has('S')).toBe(true);
    // A non-implied node (the object) is not paired.
    expect(pairs.has('O')).toBe(false);
  });

  it('does not pair when the subject is explicit (not implied)', () => {
    const explicit = build(
      [
        { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'S', kind: 'word', role: 'subject', tokenIds: ['s'] },
        { id: 'V', kind: 'word', role: 'predicate', tokenIds: ['v'] },
      ],
      [
        { id: 'r1', type: 'subject', headId: 'n_root', dependentId: 'S' },
        { id: 'r2', type: 'predicate', headId: 'n_root', dependentId: 'V' },
      ],
      [
        { id: 's', index: 0, surface: 'Παῦλος', pos: 'noun' },
        { id: 'v', index: 1, surface: 'ἔγραψεν', pos: 'verb' },
      ],
    );
    expect(impliedSubjectVerbPairs(explicit.syntax).size).toBe(0);
  });
});
