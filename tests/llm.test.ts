import { describe, it, expect } from 'vitest';
import { buildLlmPrompt, importLlmDiagram, LLM_DIAGRAM_KIND } from '@/io';
import { tokenize } from '@/domain/model';
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
