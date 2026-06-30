import { describe, it, expect } from 'vitest';
import { layoutDocument } from '@/domain/layout';
import { KrDocumentSchema, type KrDocument } from '@/domain/schema';

/**
 * Conventions adopted from Randy Leedy's Greek New Testament sentence
 * diagramming method (a refinement of Kellogg-Reed):
 *   1. the (X) ellipsis marker for an explicit elided element,
 *   2. the double-vertical infinitive mark,
 *   3. correlative conjunctions stacked in one slot (μέν…δέ, οὐ…ἀλλά),
 *   4. introductory discourse particles floated above the baseline's left end
 *      on a dotted stem.
 */
function build(
  nodes: unknown[],
  relations: unknown[],
  tokens: unknown[],
  text = 't',
  rootId = 'n_root',
): KrDocument {
  return KrDocumentSchema.parse({
    schemaVersion: 1, id: 'doc', title: 't', language: 'grc', text,
    createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
    layoutHints: {}, tokens, syntax: { rootId, nodes, relations },
  });
}
const texts = (l: ReturnType<typeof layoutDocument>) =>
  l.elements.filter((e) => e.kind === 'text').map((e) => (e as { text: string }).text);
const textEl = (l: ReturnType<typeof layoutDocument>, t: string) =>
  l.elements.find((e) => e.kind === 'text' && (e as { text: string }).text === t) as
    | { x: number; y: number }
    | undefined;

describe('(X) ellipsis marker for an explicit elided element', () => {
  // "ἐστὶν X" with an explicit, blank implied subject node.
  const doc = build(
    [
      { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
      { id: 'S', kind: 'word', role: 'subject', tokenIds: [], implied: true },
      { id: 'V', kind: 'word', role: 'predicate', tokenIds: ['v'] },
    ],
    [
      { id: 'r1', type: 'subject', headId: 'n_root', dependentId: 'S' },
      { id: 'r2', type: 'predicate', headId: 'n_root', dependentId: 'V' },
    ],
    [{ id: 'v', index: 0, surface: 'ἐστίν', pos: 'verb' }],
    'ἐστίν',
  );

  it('renders an explicit empty implied node as (X)', () => {
    expect(texts(layoutDocument(doc))).toContain('(X)');
  });

  it('keeps an explicit label when the author supplied one', () => {
    const labelled = build(
      [
        { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'S', kind: 'word', role: 'subject', tokenIds: [], implied: true, label: '(he)' },
        { id: 'V', kind: 'word', role: 'predicate', tokenIds: ['v'] },
      ],
      [
        { id: 'r1', type: 'subject', headId: 'n_root', dependentId: 'S' },
        { id: 'r2', type: 'predicate', headId: 'n_root', dependentId: 'V' },
      ],
      [{ id: 'v', index: 0, surface: 'ἐστίν', pos: 'verb' }],
    );
    const t = texts(layoutDocument(labelled));
    expect(t).toContain('(he)');
    expect(t).not.toContain('(X)');
  });
});

describe('double-vertical infinitive mark', () => {
  // "θέλω περιπατῆσαι" — the infinitive object hangs on a diagonal (no baseline
  // object tick), so the only separator strokes are the infinitive's own mark.
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

  it('draws two vertical strokes crossing the infinitive baseline', () => {
    const layout = layoutDocument(doc);
    const verticalSeps = layout.elements.filter(
      (e) => e.kind === 'line' && (e as { role: string }).role === 'separator' &&
        Math.abs((e as { x1: number }).x1 - (e as { x2: number }).x2) < 0.5,
    );
    expect(verticalSeps).toHaveLength(2);
  });
});

describe('correlative conjunctions stacked in one slot', () => {
  // "θέλει οὐ A ἀλλά B" — a coordinated object whose union is the οὐ…ἀλλά pair.
  const doc = build(
    [
      { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
      { id: 'S', kind: 'word', role: 'subject', tokenIds: ['s'] },
      { id: 'V', kind: 'word', role: 'predicate', tokenIds: ['v'] },
      { id: 'A', kind: 'word', role: 'directObject', tokenIds: ['a'] },
      { id: 'B', kind: 'word', role: 'conjunct', tokenIds: ['b'] },
      { id: 'NEG', kind: 'word', role: 'coordinator', tokenIds: ['neg'] },
      { id: 'ALL', kind: 'word', role: 'coordinator', tokenIds: ['all'] },
    ],
    [
      { id: 'r1', type: 'subject', headId: 'n_root', dependentId: 'S' },
      { id: 'r2', type: 'predicate', headId: 'n_root', dependentId: 'V' },
      { id: 'r3', type: 'directObject', headId: 'V', dependentId: 'A' },
      { id: 'r4', type: 'conjunct', headId: 'A', dependentId: 'B' },
      { id: 'r5', type: 'coordinator', headId: 'A', dependentId: 'NEG' },
      { id: 'r6', type: 'coordinator', headId: 'A', dependentId: 'ALL' },
    ],
    [
      { id: 's', index: 0, surface: 'οὗτος', pos: 'pronoun' },
      { id: 'v', index: 1, surface: 'θέλει', pos: 'verb' },
      { id: 'neg', index: 2, surface: 'οὐ', pos: 'adverb' },
      { id: 'a', index: 3, surface: 'ταῦτα', pos: 'noun' },
      { id: 'all', index: 4, surface: 'ἀλλά', pos: 'conjunction' },
      { id: 'b', index: 5, surface: 'ἐκεῖνα', pos: 'noun' },
    ],
  );

  it('renders both correlative conjunctions, stacked at different heights', () => {
    const layout = layoutDocument(doc);
    const neg = textEl(layout, 'οὐ');
    const all = textEl(layout, 'ἀλλά');
    expect(neg).toBeDefined();
    expect(all).toBeDefined();
    // Stacked top-with-top: the two conjunctions sit at distinct y on the bar.
    expect(Math.abs(neg!.y - all!.y)).toBeGreaterThan(10);
  });
});

describe('substantival / clausal subject on a pedestal', () => {
  // "οἱ ὄντες ἐν τῷ σκήνει στενάζομεν" — the articular participle phrase is the
  // subject; as a substantive in a noun slot it rides a pedestal above the line.
  const subjNodes = [
    { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
    { id: 'SUBJ', kind: 'clause', clauseType: 'participial', tokenIds: [] },
    { id: 'PART', kind: 'word', role: 'predicate', tokenIds: ['part'] },
    { id: 'ART', kind: 'word', role: 'determiner', tokenIds: ['art'] },
    { id: 'PREP', kind: 'word', role: 'adverbial', tokenIds: ['prep'] },
    { id: 'OBJ', kind: 'word', role: 'prepositionObject', tokenIds: ['obj'] },
    { id: 'V', kind: 'word', role: 'predicate', tokenIds: ['v'] },
  ];
  const subjRels = [
    { id: 'r1', type: 'subject', headId: 'n_root', dependentId: 'SUBJ' },
    { id: 'r2', type: 'predicate', headId: 'n_root', dependentId: 'V' },
    { id: 'r3', type: 'predicate', headId: 'SUBJ', dependentId: 'PART' },
    { id: 'r4', type: 'determiner', headId: 'PART', dependentId: 'ART' },
    { id: 'r5', type: 'adverbial', headId: 'PART', dependentId: 'PREP' },
    { id: 'r6', type: 'prepositionObject', headId: 'PREP', dependentId: 'OBJ' },
  ];
  const subjTokens = [
    { id: 'art', index: 0, surface: 'οἱ', pos: 'article' },
    { id: 'part', index: 1, surface: 'ὄντες', pos: 'participle' },
    { id: 'prep', index: 2, surface: 'ἐν', pos: 'preposition' },
    { id: 'obj', index: 3, surface: 'σκήνει', pos: 'noun' },
    { id: 'v', index: 4, surface: 'στενάζομεν', pos: 'verb' },
  ];
  const doc = build(subjNodes, subjRels, subjTokens, 'οἱ ὄντες ἐν τῷ σκήνει στενάζομεν');

  it('raises the substantival subject above the main line (pedestal, not inline)', () => {
    const layout = layoutDocument(doc);
    const part = textEl(layout, 'ὄντες');
    const verb = textEl(layout, 'στενάζομεν');
    expect(part).toBeDefined();
    // On a pedestal the subject head sits well ABOVE the baseline the verb is on.
    expect(part!.y).toBeLessThan(verb!.y - 20);
  });

  it('keeps the subject modifiers clear of the verb on the baseline', () => {
    const layout = layoutDocument(doc);
    const prep = textEl(layout, 'ἐν');
    const verb = textEl(layout, 'στενάζομεν');
    // ἐν τῷ σκήνει hangs off the pedestalled participle, above the verb's line.
    expect(prep!.y).toBeLessThan(verb!.y);
  });

  it('introductory particle floats clear ABOVE a pedestalled subject', () => {
    const withParticle = build(
      [...subjNodes, { id: 'P', kind: 'word', role: 'particle', tokenIds: ['p'] }],
      [...subjRels, { id: 'r7', type: 'particle', headId: 'n_root', dependentId: 'P' }],
      [...subjTokens, { id: 'p', index: 5, surface: 'γάρ', pos: 'particle' }],
      'οἱ ὄντες ἐν τῷ σκήνει στενάζομεν γάρ',
    );
    const layout = layoutDocument(withParticle);
    const gar = textEl(layout, 'γάρ');
    const part = textEl(layout, 'ὄντες');
    // The height offset must push the introductory word above the pedestal top.
    expect(gar!.y).toBeLessThan(part!.y);
  });
});

describe('introductory particle on a dotted stem', () => {
  // "γάρ … ἐστὶν ταῦτα" — γάρ introduces the whole clause.
  const doc = build(
    [
      { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
      { id: 'S', kind: 'word', role: 'subject', tokenIds: ['s'] },
      { id: 'V', kind: 'word', role: 'predicate', tokenIds: ['v'] },
      { id: 'P', kind: 'word', role: 'particle', tokenIds: ['p'] },
    ],
    [
      { id: 'r1', type: 'subject', headId: 'n_root', dependentId: 'S' },
      { id: 'r2', type: 'predicate', headId: 'n_root', dependentId: 'V' },
      { id: 'r3', type: 'particle', headId: 'n_root', dependentId: 'P' },
    ],
    [
      { id: 's', index: 0, surface: 'ταῦτα', pos: 'pronoun' },
      { id: 'v', index: 1, surface: 'ἐστίν', pos: 'verb' },
      { id: 'p', index: 2, surface: 'γάρ', pos: 'particle' },
    ],
  );

  it('floats the particle above the baseline on a dotted stem', () => {
    const layout = layoutDocument(doc);
    const gar = textEl(layout, 'γάρ');
    const verb = textEl(layout, 'ἐστίν');
    expect(gar).toBeDefined();
    // It sits ABOVE the baseline (smaller y after normalization).
    expect(gar!.y).toBeLessThan(verb!.y);
    // Connected by a dotted stem rather than slanted off the verb as a modifier.
    const dottedStem = layout.elements.some(
      (e) => e.kind === 'line' && (e as { style: string }).style === 'dotted' &&
        (e as { role: string }).role === 'stem',
    );
    expect(dottedStem).toBe(true);
  });
});
