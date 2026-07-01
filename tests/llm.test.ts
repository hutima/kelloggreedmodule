import { describe, it, expect } from 'vitest';
import { buildLlmPrompt, importLlmDiagram, importLlmDiagrams, LLM_DIAGRAM_KIND } from '@/io';
import { detectLanguage, tokenize } from '@/domain/model';
import { layoutDocument } from '@/domain/layout';

/**
 * LLM-assisted diagramming: the prompt builder and the importer that hydrates an
 * LLM reply (the compact format) into a validated KrDocument.
 */

describe('buildLlmPrompt', () => {
  const text = 'The Word became flesh.';
  const tokens = tokenize(text, 'en');
  const prompt = buildLlmPrompt(text, tokens, 'en');

  it('embeds the sentence, the token ids, and the format kind', () => {
    expect(prompt).toContain(JSON.stringify(text));
    expect(prompt).toContain(LLM_DIAGRAM_KIND);
    for (const t of tokens) expect(prompt).toContain(t.id);
  });

  it('lists the allowed enum values so the model uses valid labels', () => {
    expect(prompt).toContain('subject');
    expect(prompt).toContain('independent');
    expect(prompt).toContain('article');
  });

  it('tells the model to diagram multiple sentences as SEPARATE objects in an array', () => {
    expect(prompt).toMatch(/MULTIPLE SENTENCES/i);
    expect(prompt).toMatch(/array/i);
    expect(prompt).toMatch(/separate diagrams|SEPARATELY/i);
  });

  it('steers away from empty wrapper nodes and toward head-based coordination', () => {
    // The reported bug: an LLM wrapped a compound subject in an empty "phrase"
    // node, which is spliced on import — dropping the subject role. The prompt now
    // forbids empty grouping nodes and gives the head-based coordination pattern.
    expect(prompt).toMatch(/empty grouping node/i);
    expect(prompt).toMatch(/COORDINATION/);
    expect(prompt).toMatch(/FIRST (part|conjunct) .*(carries|subject)/i);
    expect(prompt).toMatch(/conjunct/);
    expect(prompt).toMatch(/coordinator/);
  });
});

describe('importLlmDiagram', () => {
  const valid = {
    kind: LLM_DIAGRAM_KIND,
    version: 1,
    language: 'en',
    text: 'The Word became flesh.',
    tokens: [
      { id: 't0', surface: 'The', pos: 'article' },
      { id: 't1', surface: 'Word', pos: 'noun' },
      { id: 't2', surface: 'became', pos: 'verb' },
      { id: 't3', surface: 'flesh.', pos: 'noun' },
    ],
    nodes: [
      { id: 'c0', kind: 'clause', clauseType: 'independent' },
      { id: 'n_subj', kind: 'word', role: 'subject', tokens: ['t1'] },
      { id: 'n_art', kind: 'word', role: 'determiner', tokens: ['t0'] },
      { id: 'n_verb', kind: 'word', role: 'predicate', tokens: ['t2'] },
      { id: 'n_pn', kind: 'word', role: 'predicateNominative', tokens: ['t3'] },
    ],
    relations: [
      { type: 'subject', head: 'c0', dependent: 'n_subj' },
      { type: 'determiner', head: 'n_subj', dependent: 'n_art' },
      { type: 'predicate', head: 'c0', dependent: 'n_verb' },
      { type: 'predicateNominative', head: 'n_verb', dependent: 'n_pn' },
    ],
    rootId: 'c0',
  };

  it('hydrates a valid compact diagram into a renderable KrDocument', () => {
    const res = importLlmDiagram(JSON.stringify(valid));
    expect(res.ok).toBe(true);
    const doc = res.document!;
    expect(doc.tokens).toHaveLength(4);
    expect(doc.syntax.rootId).toBe('c0');
    expect(doc.syntax.relations).toHaveLength(4);
    // relations got minted ids and provenance
    expect(doc.syntax.relations.every((r) => r.id && r.provenance?.source === 'manual')).toBe(true);
    // and it lays out without throwing
    expect(layoutDocument(doc).elements.length).toBeGreaterThan(0);
  });

  it('tolerates markdown code fences and smart quotes', () => {
    const fenced = '```json\n' + JSON.stringify(valid).replace(/"/g, '“') + '\n```';
    const res = importLlmDiagram(fenced);
    expect(res.ok).toBe(true);
  });

  it('coerces unknown pos / role values to "unknown" instead of failing', () => {
    const odd = {
      ...valid,
      tokens: [{ id: 't0', surface: 'Foo', pos: 'gerundive' }],
      nodes: [
        { id: 'c0', kind: 'clause', clauseType: 'independent' },
        { id: 'n0', kind: 'word', role: 'wizard', tokens: ['t0'] },
      ],
      relations: [{ type: 'sorcery', head: 'c0', dependent: 'n0' }],
    };
    const res = importLlmDiagram(JSON.stringify(odd));
    expect(res.ok).toBe(true);
    expect(res.document!.tokens[0]!.pos).toBe('unknown');
    expect(res.document!.syntax.relations[0]!.type).toBe('unknown');
  });

  it('lays out a HEAD-BASED compound subject with the subject role intact', () => {
    // The format the fixed prompt produces: the first conjunct carries "subject";
    // the others attach to it via conjunct/coordinator. No empty wrapper, so the
    // clause keeps its subject relation (the coordinate subject stays a subject,
    // not stranded in the predicate).
    const compound = {
      kind: LLM_DIAGRAM_KIND,
      language: 'en',
      text: 'Tomorrow and tomorrow creeps.',
      tokens: [
        { id: 't1', surface: 'Tomorrow', pos: 'noun' },
        { id: 'ta', surface: 'and', pos: 'conjunction' },
        { id: 't2', surface: 'tomorrow', pos: 'noun' },
        { id: 'tv', surface: 'creeps', pos: 'verb' },
      ],
      nodes: [
        { id: 'c0', kind: 'clause', clauseType: 'independent' },
        { id: 'n1', kind: 'word', role: 'subject', tokens: ['t1'] },
        { id: 'na', kind: 'word', role: 'coordinator', tokens: ['ta'] },
        { id: 'n2', kind: 'word', role: 'conjunct', tokens: ['t2'] },
        { id: 'nv', kind: 'word', role: 'predicate', tokens: ['tv'] },
      ],
      relations: [
        { type: 'subject', head: 'c0', dependent: 'n1' },
        { type: 'conjunct', head: 'n1', dependent: 'n2' },
        { type: 'coordinator', head: 'n1', dependent: 'na' },
        { type: 'predicate', head: 'c0', dependent: 'nv' },
      ],
      rootId: 'c0',
    };
    const res = importLlmDiagram(JSON.stringify(compound));
    expect(res.ok).toBe(true);
    const rels = res.document!.syntax.relations;
    // The clause keeps BOTH a subject and a predicate relation.
    expect(rels.some((r) => r.type === 'subject' && r.headId === 'c0' && r.dependentId === 'n1')).toBe(true);
    expect(rels.some((r) => r.type === 'predicate' && r.headId === 'c0')).toBe(true);
    // and the other conjunct hangs off the subject head, not the clause.
    expect(rels.some((r) => r.type === 'conjunct' && r.headId === 'n1' && r.dependentId === 'n2')).toBe(true);
    expect(layoutDocument(res.document!).elements.length).toBeGreaterThan(0);
  });

  it('drops an EMPTY wrapper subject node and its role (why the prompt forbids them)', () => {
    // Documents the failure mode: a compound subject wrapped in an empty phrase
    // node loses its subject relation on normalize, so the clause has no subject.
    const wrapped = {
      kind: LLM_DIAGRAM_KIND,
      language: 'en',
      text: 'Tomorrow and tomorrow creeps.',
      tokens: [
        { id: 't1', surface: 'Tomorrow', pos: 'noun' },
        { id: 't2', surface: 'tomorrow', pos: 'noun' },
        { id: 'tv', surface: 'creeps', pos: 'verb' },
      ],
      nodes: [
        { id: 'c0', kind: 'clause', clauseType: 'independent' },
        { id: 'w', kind: 'phrase', role: 'subject', tokens: [] }, // empty wrapper
        { id: 'n1', kind: 'word', role: 'conjunct', tokens: ['t1'] },
        { id: 'n2', kind: 'word', role: 'conjunct', tokens: ['t2'] },
        { id: 'nv', kind: 'word', role: 'predicate', tokens: ['tv'] },
      ],
      relations: [
        { type: 'subject', head: 'c0', dependent: 'w' },
        { type: 'conjunct', head: 'w', dependent: 'n1' },
        { type: 'conjunct', head: 'w', dependent: 'n2' },
        { type: 'predicate', head: 'c0', dependent: 'nv' },
      ],
      rootId: 'c0',
    };
    const res = importLlmDiagram(JSON.stringify(wrapped));
    expect(res.ok).toBe(true);
    const rels = res.document!.syntax.relations;
    // The wrapper is spliced and the subject relation is gone — exactly the bug.
    expect(rels.some((r) => r.type === 'subject')).toBe(false);
  });

  it('rejects a relation pointing at a missing node', () => {
    const broken = { ...valid, relations: [{ type: 'subject', head: 'c0', dependent: 'ghost' }] };
    const res = importLlmDiagram(JSON.stringify(broken));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/unknown node/i);
  });

  it('rejects input with no clause node to root', () => {
    const noClause = {
      tokens: [{ id: 't0', surface: 'Word' }],
      nodes: [{ id: 'n0', kind: 'word', role: 'subject', tokens: ['t0'] }],
      relations: [],
    };
    const res = importLlmDiagram(JSON.stringify(noClause));
    expect(res.ok).toBe(false);
  });

  it('reports invalid JSON clearly', () => {
    const res = importLlmDiagram('not json at all');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/invalid json/i);
  });
});

describe('importLlmDiagrams (multiple sentences)', () => {
  const oneSentence = (id: string, subj: string, verb: string) => ({
    kind: LLM_DIAGRAM_KIND,
    language: 'en',
    text: `${subj} ${verb}.`,
    tokens: [
      { id: `${id}s`, surface: subj, pos: 'noun' },
      { id: `${id}v`, surface: `${verb}.`, pos: 'verb' },
    ],
    nodes: [
      { id: `${id}c`, kind: 'clause', clauseType: 'independent' },
      { id: `${id}ns`, kind: 'word', role: 'subject', tokens: [`${id}s`] },
      { id: `${id}nv`, kind: 'word', role: 'predicate', tokens: [`${id}v`] },
    ],
    relations: [
      { type: 'subject', head: `${id}c`, dependent: `${id}ns` },
      { type: 'predicate', head: `${id}c`, dependent: `${id}nv` },
    ],
    rootId: `${id}c`,
  });

  it('makes ONE document per sentence from a top-level array', () => {
    const res = importLlmDiagrams(JSON.stringify([oneSentence('a', 'Boys', 'run'), oneSentence('b', 'Girls', 'walk')]));
    expect(res.ok).toBe(true);
    expect(res.documents).toHaveLength(2);
    // Distinct documents, each its own single-clause tree — NOT linked together.
    expect(res.documents![0]!.id).not.toBe(res.documents![1]!.id);
    expect(res.documents![0]!.tokens.map((t) => t.surface)).toEqual(['Boys', 'run.']);
    expect(res.documents![1]!.tokens.map((t) => t.surface)).toEqual(['Girls', 'walk.']);
    for (const d of res.documents!) {
      // no cross-sentence conjunct/clause link — each is a standalone diagram
      expect(d.syntax.relations.some((r) => r.type === 'conjunct')).toBe(false);
    }
  });

  it('accepts a { diagrams: [...] } wrapper too', () => {
    const res = importLlmDiagrams(JSON.stringify({ diagrams: [oneSentence('a', 'Boys', 'run')] }));
    expect(res.ok).toBe(true);
    expect(res.documents).toHaveLength(1);
  });

  it('still handles a SINGLE object (one sentence) as one document', () => {
    const res = importLlmDiagrams(JSON.stringify(oneSentence('a', 'Boys', 'run')));
    expect(res.ok).toBe(true);
    expect(res.documents).toHaveLength(1);
  });

  it('reports which sentence failed in a multi-sentence import', () => {
    const bad = { ...oneSentence('b', 'Girls', 'walk'), relations: [{ type: 'subject', head: 'bc', dependent: 'ghost' }] };
    const res = importLlmDiagrams(JSON.stringify([oneSentence('a', 'Boys', 'run'), bad]));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/sentence 2/i);
  });
});

describe('language detection (drives the auto-detected prompt, no dropdown)', () => {
  it('detects Greek, Hebrew, and English by dominant script', () => {
    expect(detectLanguage('διδάσκειν δὲ γυναικὶ οὐκ ἐπιτρέπω')).toBe('grc');
    expect(detectLanguage('בְּרֵאשִׁית בָּרָא אֱלֹהִים')).toBe('hbo');
    expect(detectLanguage('The Word became flesh.')).toBe('en');
  });

  it('is robust to a stray foreign word — the majority script wins', () => {
    expect(detectLanguage('the λόγος became flesh')).toBe('en');
    expect(detectLanguage('ὁ λόγος (the Word) ἦν πρὸς τὸν θεόν')).toBe('grc');
  });
});

describe('buildLlmPrompt is language-agnostic and asks for morphology', () => {
  const text = 'ἀγαπῶμεν ἀλλήλους';
  const prompt = buildLlmPrompt(text, tokenize(text)); // no language arg → detects

  it('tells the model to detect the language itself (so the UI needs no dropdown)', () => {
    expect(prompt).toMatch(/DETECT THE LANGUAGE/i);
    expect(prompt).toContain('"en", "grc", or "hbo"');
  });

  it('requests morphology and lists the schema-derived feature values', () => {
    expect(prompt).toMatch(/MORPHOLOGY/);
    expect(prompt).toContain('"morphology"');
    expect(prompt).toContain('indicative');
    expect(prompt).toContain('genitive');
    expect(prompt).toContain('aorist');
  });
});

describe('importLlmDiagram carries the morphological parse through', () => {
  const base = {
    kind: LLM_DIAGRAM_KIND,
    language: 'grc',
    text: 'ἀγαπῶμεν',
    nodes: [
      { id: 'c0', kind: 'clause', clauseType: 'independent' },
      { id: 'v', kind: 'word', role: 'predicate', tokens: ['tok_a'] },
    ],
    relations: [{ type: 'predicate', head: 'c0', dependent: 'v' }],
    rootId: 'c0',
  };

  it('validates and attaches a full verb parse on the imported token', () => {
    const reply = {
      ...base,
      tokens: [
        {
          id: 'tok_a',
          surface: 'ἀγαπῶμεν',
          pos: 'verb',
          morphology: { person: 'first', number: 'plural', tense: 'present', voice: 'active', mood: 'indicative' },
        },
      ],
    };
    const res = importLlmDiagram(JSON.stringify(reply));
    expect(res.ok).toBe(true);
    expect(res.document!.tokens[0]!.morphology).toEqual({
      person: 'first', number: 'plural', tense: 'present', voice: 'active', mood: 'indicative',
    });
  });

  it('lower-cases valid values and keeps unknown keys under extra (nothing lost)', () => {
    const reply = {
      ...base,
      tokens: [{ id: 'tok_a', surface: 'ἀγαπῶμεν', pos: 'verb', morphology: { case: 'GENITIVE', bogus: 'xyz' } }],
    };
    const res = importLlmDiagram(JSON.stringify(reply));
    expect(res.ok).toBe(true);
    const m = res.document!.tokens[0]!.morphology!;
    expect(m.case).toBe('genitive');
    expect(m.extra).toEqual({ bogus: 'xyz' });
  });
});
