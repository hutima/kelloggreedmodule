import { describe, it, expect } from 'vitest';
import { layoutDocument, layoutForMode } from '@/domain/layout';
import { KrDocumentSchema, type KrDocument } from '@/domain/schema';

/**
 * Layout-engine regressions: constructions whose WORDS (or coordinators) were
 * silently dropped from the drawing, plus geometry pins for the stub/lead
 * placement on a coordination spine, the shared per-join conjunction
 * convention, and the muted-italic treatment of implied labels. Every word of
 * the sentence must appear somewhere in the layout's text elements.
 */

function makeDoc(opts: {
  language?: string;
  tokens: Record<string, unknown>[];
  nodes: Record<string, unknown>[];
  relations: Record<string, unknown>[];
}): KrDocument {
  return KrDocumentSchema.parse({
    schemaVersion: 1,
    id: 'doc_reg',
    title: 't',
    language: opts.language ?? 'en',
    text: 't',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    layoutHints: {},
    tokens: opts.tokens,
    syntax: { rootId: 'n_root', nodes: opts.nodes, relations: opts.relations },
  });
}

type Layout = ReturnType<typeof layoutDocument>;
const texts = (l: Layout) =>
  l.elements.filter((e) => e.kind === 'text').map((e) => (e as { text: string }).text);
const textEl = (l: Layout, t: string) =>
  l.elements.find((e) => e.kind === 'text' && (e as { text: string }).text === t) as
    | { x: number; y: number; italic?: boolean; muted?: boolean }
    | undefined;

describe('coordination head with BOTH an inline and a summary appositive', () => {
  // "Paul, apostle, and Timothy — servants — write": the head noun carries a
  // pre-member appositive ("apostle" renames Paul alone) AND a summary
  // appositive of the whole group ("servants"). Hoisting the summary onto the
  // fork's platform must not also swallow the inline one.
  function doc(): KrDocument {
    return makeDoc({
      tokens: [
        { id: 't1', index: 0, surface: 'Paul', pos: 'propernoun' },
        { id: 't2', index: 1, surface: 'apostle', pos: 'noun' },
        { id: 't3', index: 2, surface: 'and', pos: 'conjunction' },
        { id: 't4', index: 3, surface: 'Timothy', pos: 'propernoun' },
        { id: 't5', index: 4, surface: 'servants', pos: 'noun' },
        { id: 't6', index: 5, surface: 'write', pos: 'verb' },
      ],
      nodes: [
        { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'n_paul', kind: 'word', role: 'subject', tokenIds: ['t1'] },
        { id: 'n_apostle', kind: 'word', role: 'apposition', tokenIds: ['t2'] },
        { id: 'n_and', kind: 'word', role: 'coordinator', tokenIds: ['t3'] },
        { id: 'n_tim', kind: 'word', role: 'conjunct', tokenIds: ['t4'] },
        { id: 'n_serv', kind: 'word', role: 'apposition', tokenIds: ['t5'] },
        { id: 'n_v', kind: 'word', role: 'predicate', tokenIds: ['t6'] },
      ],
      relations: [
        { id: 'r_s', type: 'subject', headId: 'n_root', dependentId: 'n_paul' },
        { id: 'r_p', type: 'predicate', headId: 'n_root', dependentId: 'n_v' },
        { id: 'r_a1', type: 'apposition', headId: 'n_paul', dependentId: 'n_apostle' },
        { id: 'r_c', type: 'coordinator', headId: 'n_paul', dependentId: 'n_and' },
        { id: 'r_j', type: 'conjunct', headId: 'n_paul', dependentId: 'n_tim' },
        { id: 'r_a2', type: 'apposition', headId: 'n_paul', dependentId: 'n_serv' },
      ],
    });
  }

  it('keeps the inline appositive with its member while the summary rides the platform', () => {
    const t = texts(layoutDocument(doc()));
    expect(t).toContain('Paul');
    expect(t).toContain('Timothy');
    expect(t).toContain('and');
    expect(t).toContain('servants'); // the summary appositive (platform)
    expect(t).toContain('apostle'); // the inline appositive must NOT vanish
  });
});

describe('coordinator parsed on the CONJUNCT verb of a compound predicate', () => {
  // "he ran but walked" with the `but` attached to the SECOND verb (a common
  // parse), optionally with a per-verb object to force the open-fork path.
  function doc(perVerbObject: boolean): KrDocument {
    const extraTokens = perVerbObject
      ? [{ id: 't5', index: 4, surface: 'dog', pos: 'noun' }]
      : [];
    const extraNodes = perVerbObject
      ? [{ id: 'n_dog', kind: 'word', role: 'directObject', tokenIds: ['t5'] }]
      : [];
    const extraRels = perVerbObject
      ? [{ id: 'r_o', type: 'directObject', headId: 'n_walked', dependentId: 'n_dog' }]
      : [];
    return makeDoc({
      tokens: [
        { id: 't1', index: 0, surface: 'he', pos: 'pronoun' },
        { id: 't2', index: 1, surface: 'ran', pos: 'verb' },
        { id: 't3', index: 2, surface: 'but', pos: 'conjunction' },
        { id: 't4', index: 3, surface: 'walked', pos: 'verb' },
        ...extraTokens,
      ],
      nodes: [
        { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'n_he', kind: 'word', role: 'subject', tokenIds: ['t1'] },
        { id: 'n_ran', kind: 'word', role: 'predicate', tokenIds: ['t2'] },
        { id: 'n_but', kind: 'word', role: 'coordinator', tokenIds: ['t3'] },
        { id: 'n_walked', kind: 'word', role: 'conjunct', tokenIds: ['t4'] },
        ...extraNodes,
      ],
      relations: [
        { id: 'r_s', type: 'subject', headId: 'n_root', dependentId: 'n_he' },
        { id: 'r_p', type: 'predicate', headId: 'n_root', dependentId: 'n_ran' },
        { id: 'r_j', type: 'conjunct', headId: 'n_ran', dependentId: 'n_walked' },
        // The coordinator hangs on the CONJUNCT, not the head verb.
        { id: 'r_c', type: 'coordinator', headId: 'n_walked', dependentId: 'n_but' },
        ...extraRels,
      ],
    });
  }

  it('hoists the conjunction onto the collapsed fork bar (shared-object shape)', () => {
    const layout = layoutDocument(doc(false));
    expect(texts(layout)).toContain('but');
    // It rides the join: vertically between the two forked verbs.
    const but = textEl(layout, 'but')!;
    const ran = textEl(layout, 'ran')!;
    const walked = textEl(layout, 'walked')!;
    expect(but.y).toBeGreaterThan(ran.y);
    expect(but.y).toBeLessThan(walked.y);
  });

  it('hoists the conjunction onto the open fork bar (per-verb objects shape)', () => {
    const layout = layoutDocument(doc(true));
    expect(texts(layout)).toContain('but');
    expect(texts(layout)).toContain('dog');
  });
});

describe('bare-noun conjunct on a preposition node (shared preposition)', () => {
  // "God rules in heaven and earth" parsed as ONE preposition governing
  // coordinated objects: the conjunct "earth" (no preposition of its own) and
  // the coordinator "and" hang on the preposition node itself.
  function doc(): KrDocument {
    return makeDoc({
      tokens: [
        { id: 't1', index: 0, surface: 'God', pos: 'propernoun' },
        { id: 't2', index: 1, surface: 'rules', pos: 'verb' },
        { id: 't3', index: 2, surface: 'in', pos: 'preposition' },
        { id: 't4', index: 3, surface: 'heaven', pos: 'noun' },
        { id: 't5', index: 4, surface: 'and', pos: 'conjunction' },
        { id: 't6', index: 5, surface: 'earth', pos: 'noun' },
      ],
      nodes: [
        { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'n_god', kind: 'word', role: 'subject', tokenIds: ['t1'] },
        { id: 'n_v', kind: 'word', role: 'predicate', tokenIds: ['t2'] },
        { id: 'n_in', kind: 'word', role: 'prepositionalPhrase', tokenIds: ['t3'] },
        { id: 'n_heaven', kind: 'word', role: 'prepositionObject', tokenIds: ['t4'] },
        { id: 'n_and', kind: 'word', role: 'coordinator', tokenIds: ['t5'] },
        { id: 'n_earth', kind: 'word', role: 'conjunct', tokenIds: ['t6'] },
      ],
      relations: [
        { id: 'r_s', type: 'subject', headId: 'n_root', dependentId: 'n_god' },
        { id: 'r_p', type: 'predicate', headId: 'n_root', dependentId: 'n_v' },
        { id: 'r_pp', type: 'prepositionalPhrase', headId: 'n_v', dependentId: 'n_in' },
        { id: 'r_o', type: 'prepositionObject', headId: 'n_in', dependentId: 'n_heaven' },
        { id: 'r_c', type: 'coordinator', headId: 'n_in', dependentId: 'n_and' },
        { id: 'r_j', type: 'conjunct', headId: 'n_in', dependentId: 'n_earth' },
      ],
    });
  }

  it('draws the coordinated object and its conjunction under the one preposition', () => {
    const layout = layoutDocument(doc());
    const t = texts(layout);
    expect(t).toContain('heaven');
    expect(t).toContain('earth'); // the bare conjunct must NOT vanish
    expect(t).toContain('and'); // nor its coordinator
    // The conjunct object sits on its own baseline BELOW the head object.
    const heaven = textEl(layout, 'heaven')!;
    const earth = textEl(layout, 'earth')!;
    expect(earth.y).toBeGreaterThan(heaven.y + 20);
  });
});

describe('dependency-tree mode keeps orphan leaf tokens', () => {
  it('attaches a headless leaf token to the virtual root instead of dropping it', () => {
    // "he ran indeed" with "indeed" left unattached (no relation reaches it).
    const doc = makeDoc({
      tokens: [
        { id: 't1', index: 0, surface: 'he', pos: 'pronoun' },
        { id: 't2', index: 1, surface: 'ran', pos: 'verb' },
        { id: 't3', index: 2, surface: 'indeed', pos: 'adverb' },
      ],
      nodes: [
        { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'n_he', kind: 'word', role: 'subject', tokenIds: ['t1'] },
        { id: 'n_ran', kind: 'word', role: 'predicate', tokenIds: ['t2'] },
        { id: 'n_indeed', kind: 'word', tokenIds: ['t3'] },
      ],
      relations: [
        { id: 'r_s', type: 'subject', headId: 'n_root', dependentId: 'n_he' },
        { id: 'r_p', type: 'predicate', headId: 'n_root', dependentId: 'n_ran' },
      ],
    });
    const layout = layoutForMode('dependency-tree', doc, {});
    const t = texts(layout);
    expect(t).toContain('he');
    expect(t).toContain('ran');
    expect(t).toContain('indeed'); // the orphan leaf must still be drawn
  });
});

describe('spine first-member connector stub clears the member and the lead words', () => {
  /** A headless coordination of clause members (the compound-sentence spine). */
  function spineDoc(opts: { compoundFirst?: boolean; lead?: boolean }): KrDocument {
    const compound = opts.compoundFirst
      ? {
          tokens: [{ id: 'tw', index: 8, surface: 'walked', pos: 'verb' }],
          nodes: [{ id: 'n_walked', kind: 'word', role: 'conjunct', tokenIds: ['tw'] }],
          rels: [{ id: 'r_w', type: 'conjunct', headId: 'vA', dependentId: 'n_walked' }],
        }
      : { tokens: [], nodes: [], rels: [] };
    const lead = opts.lead
      ? {
          tokens: [{ id: 'tg', index: 9, surface: 'γε', pos: 'particle' }],
          nodes: [{ id: 'n_ge', kind: 'word', role: 'particle', tokenIds: ['tg'] }],
          rels: [{ id: 'r_g', type: 'particle', headId: 'n_root', dependentId: 'n_ge' }],
        }
      : { tokens: [], nodes: [], rels: [] };
    return makeDoc({
      tokens: [
        { id: 't1', index: 0, surface: 'he', pos: 'pronoun' },
        { id: 't2', index: 1, surface: 'ran', pos: 'verb' },
        { id: 't3', index: 2, surface: 'she', pos: 'pronoun' },
        { id: 't4', index: 3, surface: 'rests', pos: 'verb' },
        ...compound.tokens,
        ...lead.tokens,
      ],
      nodes: [
        { id: 'n_root', kind: 'clause', clauseType: 'coordinate', tokenIds: [] },
        { id: 'CA', kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'sA', kind: 'word', role: 'subject', tokenIds: ['t1'] },
        { id: 'vA', kind: 'word', role: 'predicate', tokenIds: ['t2'] },
        { id: 'CB', kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'sB', kind: 'word', role: 'subject', tokenIds: ['t3'] },
        { id: 'vB', kind: 'word', role: 'predicate', tokenIds: ['t4'] },
        ...compound.nodes,
        ...lead.nodes,
      ],
      relations: [
        { id: 'r_1', type: 'conjunct', headId: 'n_root', dependentId: 'CA', label: 'when' },
        { id: 'r_2', type: 'conjunct', headId: 'n_root', dependentId: 'CB' },
        { id: 'r_sa', type: 'subject', headId: 'CA', dependentId: 'sA' },
        { id: 'r_va', type: 'predicate', headId: 'CA', dependentId: 'vA' },
        { id: 'r_sb', type: 'subject', headId: 'CB', dependentId: 'sB' },
        { id: 'r_vb', type: 'predicate', headId: 'CB', dependentId: 'vB' },
        ...compound.rels,
        ...lead.rels,
      ],
    });
  }

  it('places the stub above the member ascent (a compound-predicate fork)', () => {
    // The first member's fork raises "ran" above its own baseline; the stub must
    // sit above the fork's top, not inside it.
    const layout = layoutDocument(spineDoc({ compoundFirst: true }));
    const when = textEl(layout, 'when')!;
    const ran = textEl(layout, 'ran')!; // the fork's UPPER verb
    expect(when).toBeDefined();
    expect(when.y).toBeLessThan(ran.y - 18);
  });

  it('lifts the lead words clear above the first-member stub', () => {
    const layout = layoutDocument(spineDoc({ lead: true }));
    const ge = textEl(layout, 'γε')!;
    const when = textEl(layout, 'when')!;
    expect(ge).toBeDefined();
    expect(when).toBeDefined();
    // The lead row sits clearly above the stub label, never in the same band.
    expect(when.y - ge.y).toBeGreaterThanOrEqual(30);
  });
});

describe('PP coordination puts a lone conjunction in the LAST join', () => {
  // "sits in Alpha, on Beta and under Gamma" — one conjunction, two joins. The
  // shared convention (coordinatorMarks) maps it to the FINAL gap.
  function doc(): KrDocument {
    return makeDoc({
      tokens: [
        { id: 't0', index: 0, surface: 'God', pos: 'propernoun' },
        { id: 't1', index: 1, surface: 'sits', pos: 'verb' },
        { id: 't2', index: 2, surface: 'in', pos: 'preposition' },
        { id: 't3', index: 3, surface: 'Alpha', pos: 'propernoun' },
        { id: 't4', index: 4, surface: 'on', pos: 'preposition' },
        { id: 't5', index: 5, surface: 'Beta', pos: 'propernoun' },
        { id: 't6', index: 6, surface: 'and', pos: 'conjunction' },
        { id: 't7', index: 7, surface: 'under', pos: 'preposition' },
        { id: 't8', index: 8, surface: 'Gamma', pos: 'propernoun' },
      ],
      nodes: [
        { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'n_s', kind: 'word', role: 'subject', tokenIds: ['t0'] },
        { id: 'n_v', kind: 'word', role: 'predicate', tokenIds: ['t1'] },
        { id: 'n_in', kind: 'word', role: 'prepositionalPhrase', tokenIds: ['t2'] },
        { id: 'n_a', kind: 'word', role: 'prepositionObject', tokenIds: ['t3'] },
        { id: 'n_on', kind: 'word', role: 'conjunct', tokenIds: ['t4'] },
        { id: 'n_b', kind: 'word', role: 'prepositionObject', tokenIds: ['t5'] },
        { id: 'n_and', kind: 'word', role: 'coordinator', tokenIds: ['t6'] },
        { id: 'n_under', kind: 'word', role: 'conjunct', tokenIds: ['t7'] },
        { id: 'n_g', kind: 'word', role: 'prepositionObject', tokenIds: ['t8'] },
      ],
      relations: [
        { id: 'r_s', type: 'subject', headId: 'n_root', dependentId: 'n_s' },
        { id: 'r_p', type: 'predicate', headId: 'n_root', dependentId: 'n_v' },
        { id: 'r_pp', type: 'prepositionalPhrase', headId: 'n_v', dependentId: 'n_in' },
        { id: 'r_o1', type: 'prepositionObject', headId: 'n_in', dependentId: 'n_a' },
        { id: 'r_j1', type: 'conjunct', headId: 'n_in', dependentId: 'n_on' },
        { id: 'r_o2', type: 'prepositionObject', headId: 'n_on', dependentId: 'n_b' },
        { id: 'r_c', type: 'coordinator', headId: 'n_in', dependentId: 'n_and' },
        { id: 'r_j2', type: 'conjunct', headId: 'n_in', dependentId: 'n_under' },
        { id: 'r_o3', type: 'prepositionObject', headId: 'n_under', dependentId: 'n_g' },
      ],
    });
  }

  it('draws the conjunction in the final gap, not the first', () => {
    const layout = layoutDocument(doc());
    const and = textEl(layout, 'and')!;
    const on = textEl(layout, 'on')!; // the SECOND preposition's slant
    expect(and).toBeDefined();
    // In the final join, the conjunction sits to the RIGHT of the middle member.
    expect(and.x).toBeGreaterThan(on.x);
  });
});

describe('infinitive-fork lead words read in surface order', () => {
  it('sorts the lead words by surface position, not relation order', () => {
    // "οὐ θέλω φαγεῖν καὶ πιεῖν δή" — the two lead particles are DECLARED in
    // reverse order; they must still lay out left-to-right as written.
    const doc = makeDoc({
      language: 'grc',
      tokens: [
        { id: 't0', index: 0, surface: 'οὐ', pos: 'particle' },
        { id: 't1', index: 1, surface: 'θέλω', pos: 'verb' },
        { id: 't2', index: 2, surface: 'φαγεῖν', pos: 'infinitive' },
        { id: 't3', index: 3, surface: 'καὶ', pos: 'conjunction' },
        { id: 't4', index: 4, surface: 'πιεῖν', pos: 'infinitive' },
        { id: 't5', index: 5, surface: 'δή', pos: 'particle' },
      ],
      nodes: [
        { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'n_v', kind: 'word', role: 'predicate', tokenIds: ['t1'] },
        { id: 'CO', kind: 'clause', clauseType: 'coordinate', tokenIds: [] },
        { id: 'CI1', kind: 'clause', clauseType: 'infinitival', tokenIds: [] },
        { id: 'n_i1', kind: 'word', role: 'predicate', tokenIds: ['t2'] },
        { id: 'CI2', kind: 'clause', clauseType: 'infinitival', tokenIds: [] },
        { id: 'n_i2', kind: 'word', role: 'predicate', tokenIds: ['t4'] },
        { id: 'n_kai', kind: 'word', role: 'coordinator', tokenIds: ['t3'] },
        { id: 'n_de', kind: 'word', role: 'particle', tokenIds: ['t5'] },
        { id: 'n_ou', kind: 'word', role: 'particle', tokenIds: ['t0'] },
      ],
      relations: [
        { id: 'r_p', type: 'predicate', headId: 'n_root', dependentId: 'n_v' },
        { id: 'r_do', type: 'directObject', headId: 'n_v', dependentId: 'CO' },
        // Lead words declared LATER-first: δή (index 5) before οὐ (index 0).
        { id: 'r_l1', type: 'particle', headId: 'CO', dependentId: 'n_de' },
        { id: 'r_l2', type: 'particle', headId: 'CO', dependentId: 'n_ou' },
        { id: 'r_m1', type: 'conjunct', headId: 'CO', dependentId: 'CI1' },
        { id: 'r_m2', type: 'conjunct', headId: 'CO', dependentId: 'CI2' },
        { id: 'r_c', type: 'coordinator', headId: 'CO', dependentId: 'n_kai' },
        { id: 'r_i1', type: 'predicate', headId: 'CI1', dependentId: 'n_i1' },
        { id: 'r_i2', type: 'predicate', headId: 'CI2', dependentId: 'n_i2' },
      ],
    });
    const layout = layoutDocument(doc);
    const ou = textEl(layout, 'οὐ')!;
    const de = textEl(layout, 'δή')!;
    expect(ou).toBeDefined();
    expect(de).toBeDefined();
    expect(ou.x).toBeLessThan(de.x);
  });
});

describe('implied node with a label renders muted AND italic', () => {
  it('styles "(he)" as a muted italic label (CLAUDE.md §8)', () => {
    const doc = makeDoc({
      tokens: [{ id: 't1', index: 0, surface: 'runs', pos: 'verb' }],
      nodes: [
        { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'n_s', kind: 'word', role: 'subject', tokenIds: [], implied: true, label: '(he)' },
        { id: 'n_v', kind: 'word', role: 'predicate', tokenIds: ['t1'] },
      ],
      relations: [
        { id: 'r_s', type: 'subject', headId: 'n_root', dependentId: 'n_s' },
        { id: 'r_p', type: 'predicate', headId: 'n_root', dependentId: 'n_v' },
      ],
    });
    const he = textEl(layoutDocument(doc), '(he)')!;
    expect(he).toBeDefined();
    expect(he.muted).toBe(true);
    expect(he.italic).toBe(true);
    // The real word stays plain ink.
    const runs = textEl(layoutDocument(doc), 'runs')!;
    expect(runs.italic).toBeFalsy();
  });
});

describe('morphology clause divider spans the measured row width', () => {
  it('sizes the dotted divider to the rows instead of a hardcoded 600', () => {
    const doc = makeDoc({
      language: 'grc',
      tokens: [
        { id: 't1', index: 0, surface: 'θεός', pos: 'noun' },
        { id: 't2', index: 1, surface: 'ἦν', pos: 'verb' },
        { id: 't3', index: 2, surface: 'λέγει', pos: 'verb' },
      ],
      nodes: [
        { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'n_s', kind: 'word', role: 'subject', tokenIds: ['t1'] },
        { id: 'n_v', kind: 'word', role: 'predicate', tokenIds: ['t2'] },
        { id: 'SUB', kind: 'clause', clauseType: 'adverbial', tokenIds: [] },
        { id: 'n_v2', kind: 'word', role: 'predicate', tokenIds: ['t3'] },
      ],
      relations: [
        { id: 'r_s', type: 'subject', headId: 'n_root', dependentId: 'n_s' },
        { id: 'r_p', type: 'predicate', headId: 'n_root', dependentId: 'n_v' },
        { id: 'r_a', type: 'adverbial', headId: 'n_v', dependentId: 'SUB' },
        { id: 'r_p2', type: 'predicate', headId: 'SUB', dependentId: 'n_v2' },
      ],
    });
    const layout = layoutForMode('morphology', doc, {});
    const dividers = layout.elements.filter(
      (e) => e.kind === 'line' && (e as { style: string }).style === 'dotted',
    ) as { x1: number; x2: number }[];
    expect(dividers.length).toBe(1);
    const divider = dividers[0]!;
    // Two short rows: the divider tracks the table, far narrower than the old
    // hardcoded x ∈ [-10, 600] span…
    expect(divider.x2 - divider.x1).toBeLessThan(400);
    // …while still covering every word in the rows.
    const maxTextX = Math.max(
      ...layout.elements.filter((e) => e.kind === 'text').map((e) => (e as { x: number }).x),
    );
    expect(divider.x2).toBeGreaterThanOrEqual(maxTextX);
  });
});
