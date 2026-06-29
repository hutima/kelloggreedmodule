import { describe, it, expect } from 'vitest';
import { layoutDocument } from '@/domain/layout';
import { KrDocumentSchema, type KrDocument } from '@/domain/schema';

/**
 * Standard Kellogg-Reed constructions integrated for fuller diagramming:
 * compound predicate (fork sharing one object), direct address (floating line),
 * stacked adverb modifiers (slants), and the infinitive (empty diagonal +
 * horizontal). Each builds a minimal document and asserts the distinguishing
 * geometry the renderer must emit.
 */
function build(nodes: unknown[], relations: unknown[], tokens: unknown[], text = 't'): KrDocument {
  return KrDocumentSchema.parse({
    schemaVersion: 1, id: 'doc', title: 't', language: 'en', text,
    createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
    layoutHints: {}, tokens, syntax: { rootId: 'n_root', nodes, relations },
  });
}
const texts = (l: ReturnType<typeof layoutDocument>) =>
  l.elements.filter((e) => e.kind === 'text').map((e) => (e as { text: string }).text);
const textEl = (l: ReturnType<typeof layoutDocument>, t: string) =>
  l.elements.find((e) => e.kind === 'text' && (e as { text: string }).text === t) as
    | { x: number; y: number; rotate?: number }
    | undefined;

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
