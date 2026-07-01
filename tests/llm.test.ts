import { describe, it, expect } from 'vitest';
import { buildLlmPrompt, importLlmDiagram, importLlmDiagrams, LLM_DIAGRAM_KIND } from '@/io';
import { detectLanguage, stripPunctuation, tokenize } from '@/domain/model';
import { layoutDocument } from '@/domain/layout';
import { alignedDiff } from '@/domain/contested';

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

describe('LLM alternate readings (variants)', () => {
  it('asks for variants (with an impact note) only when the option is set', () => {
    const text = 'faith of Christ';
    const plain = buildLlmPrompt(text, tokenize(text));
    const withVar = buildLlmPrompt(text, tokenize(text), undefined, { variants: true });
    expect(plain).not.toMatch(/ALTERNATE READINGS/);
    expect(withVar).toMatch(/ALTERNATE READINGS/);
    expect(withVar).toMatch(/"variants"/);
    expect(withVar).toMatch(/impact/i);
  });

  it('imports variants as full parses that reuse the primary tokens', () => {
    const reply = {
      kind: LLM_DIAGRAM_KIND,
      language: 'en',
      text: 'the love of God',
      tokens: [
        { id: 't0', surface: 'the', pos: 'article' },
        { id: 't1', surface: 'love', pos: 'noun' },
        { id: 't2', surface: 'of', pos: 'preposition' },
        { id: 't3', surface: 'God', pos: 'propernoun' },
      ],
      nodes: [
        { id: 'c0', kind: 'clause', clauseType: 'independent' },
        { id: 'n_love', kind: 'word', role: 'subject', tokens: ['t1'] },
      ],
      relations: [{ type: 'subject', head: 'c0', dependent: 'n_love' }],
      rootId: 'c0',
      variants: [
        {
          label: 'Objective genitive',
          impact: 'God is the object of love — “our love for God”.',
          // reuses the primary tokens (no tokens field)
          nodes: [
            { id: 'c0', kind: 'clause', clauseType: 'independent' },
            { id: 'n_love', kind: 'word', role: 'subject', tokens: ['t1'] },
            { id: 'n_god', kind: 'word', role: 'genitive', tokens: ['t3'] },
          ],
          relations: [
            { type: 'subject', head: 'c0', dependent: 'n_love' },
            { type: 'genitive', head: 'n_love', dependent: 'n_god' },
          ],
          rootId: 'c0',
        },
      ],
    };
    const res = importLlmDiagrams(JSON.stringify(reply));
    expect(res.ok).toBe(true);
    expect(res.documents).toHaveLength(1);
    const variants = res.variantsByDoc![0]!;
    expect(variants).toHaveLength(1);
    expect(variants[0]!.label).toBe('Objective genitive');
    expect(variants[0]!.impact).toMatch(/object of love/);
    // the variant reused the primary's 4 tokens and lays out
    expect(variants[0]!.doc.tokens).toHaveLength(4);
    expect(variants[0]!.doc.syntax.relations.some((r) => r.type === 'genitive')).toBe(true);
  });

  it('Romans 9:5-style: a punctuation-driven reply parses to an array and the diff is detectable', () => {
    // Punctuation decides whether θεὸς is predicated of Christ or heads its own
    // doxology. The reply returns the primary parse + a variant that re-attaches
    // θεὸς; importing yields the array, and aligning base↔variant flags θεὸς.
    const reply = {
      kind: LLM_DIAGRAM_KIND,
      language: 'grc',
      text: 'Χριστὸς ὁ ὢν ἐπὶ πάντων θεὸς εὐλογητός',
      tokens: [
        { id: 't0', surface: 'Χριστὸς', pos: 'propernoun' },
        { id: 't1', surface: 'ὢν', pos: 'participle' },
        { id: 't2', surface: 'θεὸς', pos: 'noun' },
        { id: 't3', surface: 'εὐλογητός', pos: 'adjective' },
      ],
      nodes: [
        { id: 'c0', kind: 'clause', clauseType: 'independent' },
        { id: 'nc', kind: 'word', role: 'subject', tokens: ['t0'] },
        { id: 'np', kind: 'word', role: 'adjectival', tokens: ['t1'] },
        { id: 'ng', kind: 'word', role: 'predicateNominative', tokens: ['t2'] },
        { id: 'nb', kind: 'word', role: 'predicateAdjective', tokens: ['t3'] },
      ],
      relations: [
        { type: 'subject', head: 'c0', dependent: 'nc' },
        { type: 'adjectival', head: 'nc', dependent: 'np' },
        { type: 'predicateNominative', head: 'nc', dependent: 'ng' }, // God OF Christ
        { type: 'predicateAdjective', head: 'c0', dependent: 'nb' },
      ],
      variants: [
        {
          label: 'Independent doxology',
          impact: 'θεὸς heads its own clause: “God … be blessed”.',
          diff: ['θεὸς'],
          nodes: [
            { id: 'c0', kind: 'clause', clauseType: 'independent' },
            { id: 'nc', kind: 'word', role: 'subject', tokens: ['t0'] },
            { id: 'np', kind: 'word', role: 'adjectival', tokens: ['t1'] },
            { id: 'ng', kind: 'word', role: 'subject', tokens: ['t2'] },
            { id: 'nb', kind: 'word', role: 'predicateAdjective', tokens: ['t3'] },
          ],
          relations: [
            { type: 'subject', head: 'c0', dependent: 'nc' },
            { type: 'adjectival', head: 'nc', dependent: 'np' },
            { type: 'subject', head: 'nb', dependent: 'ng' }, // God heads the doxology
            { type: 'predicateAdjective', head: 'c0', dependent: 'nb' },
          ],
        },
      ],
    };
    const res = importLlmDiagrams(JSON.stringify(reply));
    expect(res.ok).toBe(true);
    const base = res.documents![0]!;
    const variant = res.variantsByDoc![0]![0]!;
    expect(variant.diffWords).toEqual(['θεὸς']);

    // App auto-detection over the aligned overlap flags exactly θεὸς.
    const auto = alignedDiff(base, variant.doc);
    expect(auto.matched).toBe(true);
    const godBase = base.tokens.find((t) => t.surface === 'θεὸς')!.id;
    expect(auto.diff.changedTokenIds).toContain(godBase);
    // and the LLM-supplied diff words agree.
    const llm = alignedDiff(base, variant.doc, variant.diffWords);
    expect(llm.diff.changedTokenIds).toContain(godBase);
  });

  it('skips a malformed variant without failing the primary import', () => {
    const reply = {
      kind: LLM_DIAGRAM_KIND,
      language: 'en',
      text: 'God is love',
      tokens: [{ id: 't0', surface: 'God', pos: 'noun' }],
      nodes: [
        { id: 'c0', kind: 'clause', clauseType: 'independent' },
        { id: 'n', kind: 'word', role: 'subject', tokens: ['t0'] },
      ],
      relations: [{ type: 'subject', head: 'c0', dependent: 'n' }],
      rootId: 'c0',
      variants: [{ label: 'broken', relations: [{ type: 'subject', head: 'c0', dependent: 'ghost' }] }],
    };
    const res = importLlmDiagrams(JSON.stringify(reply));
    expect(res.ok).toBe(true);
    expect(res.variantsByDoc![0]).toHaveLength(0); // the broken variant is dropped
  });
});

describe('ignore-punctuation export option', () => {
  it('strips editorial punctuation but keeps elision apostrophes', () => {
    const stripped = stripPunctuation('διδάσκειν, οὐκ ἐπιτρέπω· ἀλλ’ εἶναι.');
    expect(stripped).toBe('διδάσκειν οὐκ ἐπιτρέπω ἀλλ’ εἶναι'); // no comma / ano teleia / period
    expect(stripped).toContain('ἀλλ’'); // word-internal elision survives
    expect(stripPunctuation('The Word became flesh; and God saw it.')).toBe(
      'The Word became flesh and God saw it',
    );
  });

  it('adds an infer-punctuation instruction only when the option is set', () => {
    const text = 'ἀγαπῶμεν ἀλλήλους';
    const plain = buildLlmPrompt(text, tokenize(text));
    const infer = buildLlmPrompt(text, tokenize(text), undefined, { inferPunctuation: true });
    expect(plain).not.toMatch(/PUNCTUATION: the source has had its punctuation REMOVED/);
    expect(infer).toMatch(/PUNCTUATION: the source has had its punctuation REMOVED/);
    expect(infer).toMatch(/infer the most likely punctuation/i);
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

describe('importLlmDiagram is language-agnostic (any language + direction)', () => {
  it('preserves a non-en/grc/hbo language code on the document and its tokens', () => {
    // A Chinese sentence: the importer must keep "zh" verbatim, not coerce it to en.
    const reply = {
      kind: LLM_DIAGRAM_KIND,
      language: 'zh',
      text: '道 成 了 肉身',
      tokens: [
        { id: 't0', surface: '道', pos: 'noun' },
        { id: 't1', surface: '成', pos: 'verb' },
        { id: 't2', surface: '肉身', pos: 'noun' },
      ],
      nodes: [
        { id: 'c0', kind: 'clause', clauseType: 'independent' },
        { id: 'ns', kind: 'word', role: 'subject', tokens: ['t0'] },
        { id: 'nv', kind: 'word', role: 'predicate', tokens: ['t1'] },
        { id: 'no', kind: 'word', role: 'directObject', tokens: ['t2'] },
      ],
      relations: [
        { type: 'subject', head: 'c0', dependent: 'ns' },
        { type: 'predicate', head: 'c0', dependent: 'nv' },
        { type: 'directObject', head: 'nv', dependent: 'no' },
      ],
      rootId: 'c0',
    };
    const res = importLlmDiagram(JSON.stringify(reply));
    expect(res.ok).toBe(true);
    expect(res.document!.language).toBe('zh');
    expect(res.document!.tokens.every((t) => t.language === 'zh')).toBe(true);
    // left-to-right by default (Chinese is not an RTL script)
    expect(res.document!.direction).toBe('ltr');
    expect(layoutDocument(res.document!).elements.length).toBeGreaterThan(0);
  });

  it('honours an explicit rtl direction from the model', () => {
    const reply = {
      kind: LLM_DIAGRAM_KIND,
      language: 'ar',
      direction: 'rtl',
      text: 'الكلمة صار جسدا',
      tokens: [
        { id: 't0', surface: 'الكلمة', pos: 'noun' },
        { id: 't1', surface: 'صار', pos: 'verb' },
      ],
      nodes: [
        { id: 'c0', kind: 'clause', clauseType: 'independent' },
        { id: 'ns', kind: 'word', role: 'subject', tokens: ['t0'] },
        { id: 'nv', kind: 'word', role: 'predicate', tokens: ['t1'] },
      ],
      relations: [
        { type: 'subject', head: 'c0', dependent: 'ns' },
        { type: 'predicate', head: 'c0', dependent: 'nv' },
      ],
      rootId: 'c0',
    };
    const res = importLlmDiagram(JSON.stringify(reply));
    expect(res.ok).toBe(true);
    expect(res.document!.direction).toBe('rtl');
  });

  it('infers rtl from an RTL language code even when the model omits direction', () => {
    const reply = {
      kind: LLM_DIAGRAM_KIND,
      language: 'fa', // Persian — RTL, but no explicit direction field
      text: 'کلمه بود',
      tokens: [{ id: 't0', surface: 'کلمه', pos: 'noun' }],
      nodes: [
        { id: 'c0', kind: 'clause', clauseType: 'independent' },
        { id: 'ns', kind: 'word', role: 'subject', tokens: ['t0'] },
      ],
      relations: [{ type: 'subject', head: 'c0', dependent: 'ns' }],
      rootId: 'c0',
    };
    const res = importLlmDiagram(JSON.stringify(reply));
    expect(res.ok).toBe(true);
    expect(res.document!.direction).toBe('rtl');
  });
});

describe('buildLlmPrompt is language-agnostic and asks for morphology', () => {
  const text = 'ἀγαπῶμεν ἀλλήλους';
  const prompt = buildLlmPrompt(text, tokenize(text)); // no language arg → detects

  it('tells the model to detect the language itself (so the UI needs no dropdown)', () => {
    expect(prompt).toMatch(/DETECT THE LANGUAGE/i);
    expect(prompt).toMatch(/"en"\/"grc"\/"hbo"/);
  });

  it('works for ANY language — asks for a BCP-47 code and a text direction', () => {
    // The prompt is not English/Greek/Hebrew-only: a Chinese, Arabic, or Latin
    // sentence should parse too, with the model naming the language and direction.
    expect(prompt).toMatch(/ANY language/i);
    expect(prompt).toMatch(/BCP-47/);
    expect(prompt).toContain('"direction"');
    expect(prompt).toMatch(/rtl for/i);
  });

  it('lets the model fall back to a plain TOKENIZATION for a language it cannot parse', () => {
    // Sumerian, say: rather than guess a wrong tree, emit one clause + each word as
    // its own unknown-role node so the sentence still renders as a labelled list.
    expect(prompt).toMatch(/IF YOU CANNOT confidently analyse/i);
    expect(prompt).toMatch(/just TOKENIZE/i);
    expect(prompt).toMatch(/role "unknown"/);
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
