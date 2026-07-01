import { describe, it, expect } from 'vitest';
import { combinePassage } from '@/io/passage';
import { KrDocumentSchema, type KrDocument } from '@/domain/schema';
import { layoutDocument } from '@/domain/layout';

/** A minimal one-clause Greek sentence document. */
function sentence(id: string, title: string, subj: string, verb: string): KrDocument {
  return KrDocumentSchema.parse({
    schemaVersion: 1, id, title, language: 'grc', text: `${subj} ${verb}`,
    createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z', layoutHints: {},
    tokens: [
      { id: 's', index: 0, surface: subj, pos: 'noun' },
      { id: 'v', index: 1, surface: verb, pos: 'verb' },
    ],
    syntax: {
      rootId: 'c',
      nodes: [
        { id: 'c', kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'S', kind: 'word', role: 'subject', tokenIds: ['s'] },
        { id: 'V', kind: 'word', role: 'predicate', tokenIds: ['v'] },
      ],
      relations: [
        { id: 'r1', type: 'subject', headId: 'c', dependentId: 'S' },
        { id: 'r2', type: 'predicate', headId: 'c', dependentId: 'V' },
      ],
    },
  });
}

/** A one-clause sentence that OPENS with a connector (καί / ὅτι …), encoded as
 *  a root `conjunction` child the way the OpenText converter does. */
function sentenceWithLead(
  id: string,
  title: string,
  conn: string,
  connLemma: string,
  subj: string,
  verb: string,
): KrDocument {
  return KrDocumentSchema.parse({
    schemaVersion: 1, id, title, language: 'grc', text: `${conn} ${subj} ${verb}`,
    createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z', layoutHints: {},
    tokens: [
      { id: 'k', index: 0, surface: conn, lemma: connLemma, pos: 'conjunction' },
      { id: 's', index: 1, surface: subj, pos: 'noun' },
      { id: 'v', index: 2, surface: verb, pos: 'verb' },
    ],
    syntax: {
      rootId: 'c',
      nodes: [
        { id: 'c', kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'K', kind: 'word', role: 'conjunction', tokenIds: ['k'] },
        { id: 'S', kind: 'word', role: 'subject', tokenIds: ['s'] },
        { id: 'V', kind: 'word', role: 'predicate', tokenIds: ['v'] },
      ],
      relations: [
        { id: 'r0', type: 'conjunction', headId: 'c', dependentId: 'K' },
        { id: 'r1', type: 'subject', headId: 'c', dependentId: 'S' },
        { id: 'r2', type: 'predicate', headId: 'c', dependentId: 'V' },
      ],
    },
  });
}

describe('combinePassage', () => {
  const a = sentence('gnt_a', 'Romans 5:1', 'Παῦλος', 'γράφει');
  const b = sentence('gnt_b', 'Romans 5:2', 'Πέτρος', 'λέγει');

  it('returns the single document unchanged when only one is selected', () => {
    expect(combinePassage([a])).toBe(a);
  });

  it('combines sentences under a discourse root with no id collisions', () => {
    const doc = combinePassage([a, b]);
    expect(() => KrDocumentSchema.parse(doc)).not.toThrow();
    const root = doc.syntax.nodes.find((n) => n.id === doc.syntax.rootId)!;
    expect(root.clauseType).toBe('discourse');
    // Both sentences hang off the root, labelled by verse.
    const children = doc.syntax.relations.filter((r) => r.headId === root.id);
    expect(children).toHaveLength(2);
    const labels = children.map((r) => doc.syntax.nodes.find((n) => n.id === r.dependentId)?.label);
    expect(labels).toEqual(['5:1', '5:2']);
    // Ids are unique and all relations reference existing nodes.
    const ids = new Set(doc.syntax.nodes.map((n) => n.id));
    expect(ids.size).toBe(doc.syntax.nodes.length);
    for (const r of doc.syntax.relations) {
      expect(ids.has(r.headId)).toBe(true);
      expect(ids.has(r.dependentId)).toBe(true);
    }
    // Both surface forms survive (no token-id clobbering).
    expect(doc.tokens.map((t) => t.surface).sort()).toEqual(['Πέτρος', 'Παῦλος', 'γράφει', 'λέγει'].sort());
    // Reference text carries verse numbers.
    expect(doc.text).toContain('[5:1]');
    expect(doc.text).toContain('[5:2]');
    expect(doc.title).toBe('Romans 5:1–2');
  });

  it('numbers stacked sentences that carry no verse reference (typed passages)', () => {
    // Custom/LLM passages have no verse ref — each stacked sentence should be
    // labelled with a plain number, not its (long) opening words.
    const s1 = sentence('cust_a', 'Marley was dead', 'Marley', 'died');
    const s2 = sentence('cust_b', 'There is no doubt', 'doubt', 'remains');
    const doc = combinePassage([s1, s2]);
    const root = doc.syntax.nodes.find((n) => n.id === doc.syntax.rootId)!;
    const labels = doc.syntax.relations
      .filter((r) => r.headId === root.id)
      .map((r) => doc.syntax.nodes.find((n) => n.id === r.dependentId)?.label);
    expect(labels).toEqual(['1', '2']);
    expect(doc.text).toContain('[1]');
    expect(doc.text).toContain('[2]');
    // The combined title is the first sentence's, not both spliced together.
    expect(doc.title).toBe('Marley was dead');
  });

  it('lays out both sentences stacked (each its own baseline)', () => {
    const layout = layoutDocument(combinePassage([a, b]));
    const yOf = (t: string) =>
      (layout.elements.find((e) => e.kind === 'text' && (e as { text: string }).text === t) as { y: number } | undefined)?.y;
    // Both verbs are drawn, on clearly different rows.
    expect(yOf('γράφει')).toBeDefined();
    expect(yOf('λέγει')).toBeDefined();
    expect(Math.abs(yOf('λέγει')! - yOf('γράφει')!)).toBeGreaterThan(40);
  });

  it('coordinate: joins sentences chained by a coordinating conjunction on one spine', () => {
    const s1 = sentence('ot_a', 'Php 2:9', 'Θεός', 'ὑπερύψωσεν');
    const s2 = sentenceWithLead('ot_b', 'Php 2:10', 'καὶ', 'καί', 'γλῶσσα', 'ἐξομολογήσηται');
    const doc = combinePassage([s1, s2], { coordinate: true });
    expect(() => KrDocumentSchema.parse(doc)).not.toThrow();
    const root = doc.syntax.nodes.find((n) => n.id === doc.syntax.rootId)!;
    expect(root.clauseType).toBe('coordinate');
    // Each sentence's clause is a conjunct of the coordinate root.
    const conjuncts = doc.syntax.relations.filter((r) => r.headId === root.id && r.type === 'conjunct');
    expect(conjuncts).toHaveLength(2);
    // The καί is hoisted onto the root as a coordinator (rides the spine)…
    const coords = doc.syntax.relations.filter((r) => r.headId === root.id && r.type === 'coordinator');
    expect(coords).toHaveLength(1);
    // …and no longer dangles inside its own clause as a conjunction.
    const kaiNodeId = coords[0]!.dependentId;
    expect(
      doc.syntax.relations.some((r) => r.dependentId === kaiNodeId && r.type === 'conjunction'),
    ).toBe(false);
    // Tokens are re-indexed into one monotonic surface stream.
    expect(doc.tokens.map((t) => t.index)).toEqual(doc.tokens.map((_, i) => i));
  });

  it('coordinate: also joins on an explicit connector that is a subordinator (ἵνα)', () => {
    const s1 = sentence('ot_a', 'Php 2:9', 'Θεός', 'ὑπερύψωσεν');
    const s2 = sentenceWithLead('ot_b', 'Php 2:10', 'ἵνα', 'ἵνα', 'γόνυ', 'κάμψῃ');
    const doc = combinePassage([s1, s2], { coordinate: true });
    // Any explicit connector joins the clauses so the relation is shown.
    expect(doc.syntax.nodes.find((n) => n.id === doc.syntax.rootId)!.clauseType).toBe('coordinate');
    expect(doc.syntax.relations.filter((r) => r.headId === doc.syntax.rootId && r.type === 'coordinator')).toHaveLength(1);
  });

  it('coordinate: falls back to stacking when a join is asyndetic (no connector)', () => {
    const s1 = sentence('ot_a', 'Php 2:9', 'Θεός', 'ὑπερύψωσεν');
    const s2 = sentence('ot_b', 'Php 2:10', 'γλῶσσα', 'ἐξομολογήσηται'); // no leading connector
    const doc = combinePassage([s1, s2], { coordinate: true });
    expect(doc.syntax.nodes.find((n) => n.id === doc.syntax.rootId)!.clauseType).toBe('discourse');
  });

  it('coordinate: a 3-clause chain gets one coordinator per join, not a correlative', () => {
    const s1 = sentence('ot_a', 'Php 2:9', 'Θεός', 'ὑπερύψωσεν');
    const s2 = sentenceWithLead('ot_b', 'Php 2:10', 'ἵνα', 'ἵνα', 'γόνυ', 'κάμψῃ');
    const s3 = sentenceWithLead('ot_c', 'Php 2:11', 'καὶ', 'καί', 'γλῶσσα', 'ἐξομολογήσηται');
    const doc = combinePassage([s1, s2, s3], { coordinate: true });
    const root = doc.syntax.nodes.find((n) => n.id === doc.syntax.rootId)!;
    expect(root.clauseType).toBe('coordinate');
    // Three members, two joins → two coordinators (ἵνα, καί), not three.
    expect(doc.syntax.relations.filter((r) => r.headId === root.id && r.type === 'conjunct')).toHaveLength(3);
    expect(doc.syntax.relations.filter((r) => r.headId === root.id && r.type === 'coordinator')).toHaveLength(2);
  });

  it('coordinate: draws a single connected spine, not separate stacked clauses', () => {
    const s1 = sentence('ot_a', 'Php 2:9', 'Θεός', 'ὑπερύψωσεν');
    const s2 = sentenceWithLead('ot_b', 'Php 2:10', 'καὶ', 'καί', 'γλῶσσα', 'ἐξομολογήσηται');
    const layout = layoutDocument(combinePassage([s1, s2], { coordinate: true }));
    const texts = layout.elements.flatMap((e) => (e.kind === 'text' ? [(e as { text: string }).text] : []));
    for (const w of ['ὑπερύψωσεν', 'ἐξομολογήσηται', 'καὶ']) expect(texts).toContain(w);
    // A coordinate spine draws a dashed 'coordination' bar tying the clauses.
    const spine = layout.elements.some(
      (e) => e.kind === 'line' && (e as { role?: string }).role === 'coordination',
    );
    expect(spine).toBe(true);
  });
});
