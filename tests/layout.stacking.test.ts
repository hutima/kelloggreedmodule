import { describe, it, expect } from 'vitest';
import { layoutDocument } from '@/domain/layout';
import { KrDocumentSchema, type KrDocument } from '@/domain/schema';
import { cloneSample } from '@/fixtures';

/**
 * Regression tests for the readability fix: tall clause-valued children stack
 * VERTICALLY on a shared stem instead of fanning out horizontally. Without this
 * a document with several coordinated/subordinate clauses degenerates into one
 * extremely wide, overlapping strip.
 */

function word(id: string, surface: string) {
  return { id, index: 0, surface };
}

/** A root clause coordinating N independent "I run" clauses. */
function coordinatedClauses(n: number): KrDocument {
  const tokens = [];
  const nodes: Record<string, unknown>[] = [
    { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
  ];
  const relations: Record<string, unknown>[] = [];
  for (let i = 0; i < n; i++) {
    const subj = `ts${i}`;
    const verb = `tv${i}`;
    tokens.push({ ...word(subj, 'I'), pos: 'pronoun' });
    tokens.push({ ...word(verb, 'run'), pos: 'verb' });
    nodes.push({ id: `c${i}`, kind: 'clause', clauseType: 'independent', tokenIds: [] });
    nodes.push({ id: `s${i}`, kind: 'word', role: 'subject', tokenIds: [subj] });
    nodes.push({ id: `v${i}`, kind: 'word', role: 'predicate', tokenIds: [verb] });
    relations.push({ id: `rc${i}`, type: 'conjunct', headId: 'n_root', dependentId: `c${i}` });
    relations.push({ id: `rs${i}`, type: 'subject', headId: `c${i}`, dependentId: `s${i}` });
    relations.push({ id: `rv${i}`, type: 'predicate', headId: `c${i}`, dependentId: `v${i}` });
  }
  return KrDocumentSchema.parse({
    schemaVersion: 1,
    id: 'doc_stack',
    title: 't',
    language: 'en',
    text: 'I run. I run.',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    layoutHints: {},
    tokens,
    syntax: { rootId: 'n_root', nodes, relations },
  });
}

const subjectYs = (layout: ReturnType<typeof layoutDocument>) =>
  layout.elements
    .filter((e) => e.kind === 'text' && (e as { text: string }).text === 'I')
    .map((e) => (e as { y: number }).y)
    .sort((a, b) => a - b);

describe('traditional Kellogg-Reed diagonals', () => {
  it('writes a preposition along a rotated diagonal, not on its own baseline', () => {
    // "over the dog" — the preposition rides the diagonal; the object sits on
    // a horizontal baseline below it.
    const doc = cloneSample('doc_sample_fox')!;
    const layout = layoutDocument(doc, doc.layoutHints);
    const over = layout.elements.find(
      (e) => e.kind === 'text' && (e as { text: string }).text === 'over',
    ) as { rotate?: number } | undefined;
    expect(over).toBeDefined();
    expect(over!.rotate).toBeDefined();
    expect(Math.abs(over!.rotate!)).toBeGreaterThan(15); // genuinely slanted
  });
});

describe('coordination renders as a two-prong fork', () => {
  it('stacks conjuncts on parallel baselines joined by a coordinator', () => {
    // Philippians 1:1 — "Paul and Timothy" (compound subject).
    const doc = cloneSample('doc_sample_phil_1_1_6')!;
    const layout = layoutDocument(doc, doc.layoutHints);
    const yOf = (t: string) => {
      const el = layout.elements.find(
        (e) => e.kind === 'text' && (e as { text: string }).text === t,
      ) as { y: number } | undefined;
      return el?.y;
    };
    const paul = yOf('Paul');
    const timothy = yOf('Timothy');
    expect(paul).toBeDefined();
    expect(timothy).toBeDefined();
    // The two conjuncts sit on separate, vertically-offset baselines.
    expect(Math.abs(timothy! - paul!)).toBeGreaterThan(20);
    // A dashed coordination line joins them.
    const fork = layout.elements.find(
      (e) => e.kind === 'line' && (e as { role: string }).role === 'coordination'
        && (e as { style: string }).style === 'dashed',
    );
    expect(fork).toBeDefined();
  });
});

describe('clause stacking keeps the diagram readable', () => {
  it('stacks coordinated clauses vertically, not horizontally', () => {
    const layout = layoutDocument(coordinatedClauses(5));
    const ys = subjectYs(layout);
    expect(ys.length).toBe(5);
    // Each successive clause's subject is clearly lower than the previous one.
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i]!).toBeGreaterThan(ys[i - 1]! + 20);
    }
    // Vertical stacking ⇒ five clauses are no wider than one (they share an x
    // column); a horizontal strip would be ~5× as wide.
    const one = layoutDocument(coordinatedClauses(1));
    expect(layout.width).toBeLessThan(one.width + 40);
  });

  it('does not balloon in width as clauses are added', () => {
    const five = layoutDocument(coordinatedClauses(5));
    const ten = layoutDocument(coordinatedClauses(10));
    // Doubling the clause count must not materially widen the diagram.
    expect(ten.width).toBeLessThan(five.width + 40);
    // ...it grows downward instead.
    expect(ten.height).toBeGreaterThan(five.height);
  });

  it('renders a headless coordinate clause with no empty "(subject)"/"(verb)" line', () => {
    // A clause whose only children are conjunct clauses (the compound-sentence
    // wrapper the Lowfat converter builds) must draw a coordination spine, not an
    // empty implied baseline.
    const texts = (l: ReturnType<typeof layoutDocument>) =>
      l.elements.filter((e) => e.kind === 'text').map((e) => (e as { text: string }).text);
    const doc = coordinatedClauses(3);
    // Re-type the root's child links as a clause coordination.
    const root = doc.syntax.nodes.find((n) => n.id === doc.syntax.rootId)!;
    (root as { clauseType?: string }).clauseType = 'coordinate';
    const layout = layoutDocument(doc);
    expect(texts(layout)).not.toContain('(subject)');
    expect(texts(layout)).not.toContain('(verb)');
  });
});

describe('subjectless clauses', () => {
  /** A minimal one-predicate clause with no subject relation. */
  function subjectless(pos: string, surface: string): KrDocument {
    return KrDocumentSchema.parse({
      schemaVersion: 1,
      id: 'doc_ns',
      title: 't',
      language: 'grc',
      text: surface,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      layoutHints: {},
      tokens: [{ id: 'tv', index: 0, surface, pos }],
      syntax: {
        rootId: 'n_root',
        nodes: [
          { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
          { id: 'v', kind: 'word', role: 'predicate', tokenIds: ['tv'] },
        ],
        relations: [{ id: 'rv', type: 'predicate', headId: 'n_root', dependentId: 'v' }],
      },
    });
  }
  const hasSubjectPlaceholder = (doc: KrDocument) =>
    layoutDocument(doc).elements.some((e) => e.kind === 'text' && (e as { text: string }).text === '(subject)');

  it('omits "(subject)" for a bare participle (adverbial participle)', () => {
    expect(hasSubjectPlaceholder(subjectless('participle', 'καρποφοροῦντες'))).toBe(false);
  });

  it('omits "(subject)" for a bare infinitive', () => {
    expect(hasSubjectPlaceholder(subjectless('infinitive', 'περιπατῆσαι'))).toBe(false);
  });

  it('keeps "(subject)" for a finite verb (genuine pro-drop)', () => {
    expect(hasSubjectPlaceholder(subjectless('verb', 'πληρωθῆτε'))).toBe(true);
  });
});
