import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { maculaHebrewToDocuments } from '@/io/macula-hebrew';
import { KrDocumentSchema } from '@/domain/schema';
import { layoutDocument } from '@/domain/layout';
import { measureText } from '@/domain/layout/measure';
import { alignParallelHebrew, type OtParallelBook } from '@/io';

/**
 * The Hebrew Bible mode converts Clear-Bible macula-hebrew (WLC) Lowfat trees.
 * The structural conversion is shared with the Greek path; these tests pin the
 * Hebrew-specific leaf reads (xml:id keys, morpheme segmentation, Hebrew
 * morphology) and the right-to-left rendering, against a real Genesis 1:1 slice.
 */
const xml = () => readFileSync('tests/fixtures-macula-hebrew-gen-1-1.xml', 'utf8');

describe('macula-hebrew → KrDocument converter', () => {
  const surf = (doc: ReturnType<typeof maculaHebrewToDocuments>[number], id: string) => {
    const n = doc.syntax.nodes.find((x) => x.id === id);
    return doc.tokens.find((t) => t.id === n?.tokenIds[0])?.surface;
  };

  it('produces one valid Hebrew document for the sentence', () => {
    const docs = maculaHebrewToDocuments(xml(), { book: 'Genesis' });
    expect(docs).toHaveLength(1);
    const d = docs[0]!;
    expect(d.language).toBe('hbo');
    expect(d.title).toBe('Genesis 1:1');
    // The running text is rebuilt from the source `<p>` (correct morpheme
    // spacing), with the verse milestone stripped. Assert it structurally rather
    // than pinning the exact pointed+accented string: seven space-separated
    // words, ending in the sof-pasuq ׃, and consonants matching Gen 1:1.
    expect(d.text).not.toContain('GEN');
    expect(d.text.split(/\s+/)).toHaveLength(7);
    expect(d.text.endsWith('׃')).toBe(true);
    const consonants = d.text.replace(/[֑-ׇֽֿׁׂׅׄ]/g, '');
    expect(consonants).toBe('בראשית ברא אלהים את השמים ואת הארץ׃');
    expect(() => KrDocumentSchema.parse(d)).not.toThrow();
  });

  // Hebrew surfaces carry combining points/cantillation, so match tokens by
  // their (ASCII) gloss instead of by fragile pointed-string literals.
  const byGloss = (
    docs: ReturnType<typeof maculaHebrewToDocuments>,
    gloss: string,
  ) => docs[0]!.tokens.find((t) => t.gloss === gloss)!;

  it('reads xml:id so every token id is unique (segmented morphemes share a ref)', () => {
    const docs = maculaHebrewToDocuments(xml());
    const ids = docs[0]!.tokens.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Hebrew is segmented into morphemes: the article and its noun are separate
    // tokens that share one canonical `ref`.
    const article = byGloss(docs, 'the');
    const heavens = byGloss(docs, 'heavens');
    expect(article.id).not.toBe(heavens.id);
    expect(article.morphology?.extra?.ref).toBe(heavens.morphology?.extra?.ref);
  });

  it('maps Hebrew parts of speech (verb, object-marker, article, prep, noun)', () => {
    const docs = maculaHebrewToDocuments(xml());
    expect(byGloss(docs, 'he.created').pos).toBe('verb');
    expect(byGloss(docs, 'God').pos).toBe('noun');
    expect(byGloss(docs, 'in').pos).toBe('preposition');
    expect(byGloss(docs, 'the').pos).toBe('article');
    expect(byGloss(docs, '(et)').pos).toBe('particle'); // direct-object marker אֵת
  });

  it('carries Hebrew morphology — state & stem ride in `extra`, no case', () => {
    const docs = maculaHebrewToDocuments(xml());
    const verb = byGloss(docs, 'he.created');
    expect(verb.morphology?.extra?.stem).toBe('qal');
    expect(verb.morphology?.person).toBe('third');
    expect(verb.morphology?.case).toBeUndefined(); // Hebrew has no case
    const god = byGloss(docs, 'God');
    expect(god.morphology?.extra?.state).toBe('absolute');
    // The alignment anchors (canonical ref + Strong's) are preserved for the
    // parallel-English linker, exactly as the Greek path does.
    expect(verb.morphology?.extra?.ref).toMatch(/^GEN 1:1/);
    expect(verb.morphology?.extra?.strong).toBeTruthy();
  });

  it('heads a determined noun phrase with the NOUN, not the article', () => {
    // macula-hebrew never marks word-level heads, so the converter must skip the
    // leading article/object-marker and head the phrase with the content noun.
    const docs = maculaHebrewToDocuments(xml());
    const d = docs[0]!;
    const heavens = byGloss(docs, 'heavens');
    const heavensNode = d.syntax.nodes.find((n) => n.tokenIds.includes(heavens.id))!;
    // The article "the" depends on (hangs under) the noun as a determiner.
    const article = byGloss(docs, 'the');
    const articleNode = d.syntax.nodes.find((n) => n.tokenIds.includes(article.id))!;
    const det = d.syntax.relations.find(
      (r) => r.dependentId === articleNode.id && r.type === 'determiner',
    );
    expect(det?.headId).toBe(heavensNode.id);
  });

  it('coordinates the compound object (הַשָּׁמַיִם … וְאֵת הָאָרֶץ) as a conjunct', () => {
    const docs = maculaHebrewToDocuments(xml());
    const d = docs[0]!;
    const conj = d.syntax.relations.filter((r) => r.type === 'conjunct');
    expect(conj.length).toBeGreaterThanOrEqual(1);
    // earth is coordinated with heavens — the conjunct resolves to the earth NOUN
    // (not its article/object-marker), confirming head percolation through the fork.
    const earth = byGloss(docs, 'earth');
    const earthNode = d.syntax.nodes.find((n) => n.tokenIds.includes(earth.id))!;
    expect(conj.some((r) => r.dependentId === earthNode.id)).toBe(true);
    // …joined by the conjunction וְ as a coordinator.
    expect(d.syntax.relations.some((r) => r.type === 'coordinator' && surf(d, r.dependentId) === byGloss(docs, 'and').surface)).toBe(true);
  });
});

describe('right-to-left Hebrew layout', () => {
  it('mirrors the diagram horizontally for `hbo` (subject moves to the right)', () => {
    const [d] = maculaHebrewToDocuments(xml(), { book: 'Genesis' });
    const ltr = layoutDocument(d!, {}, { rtl: false });
    const rtl = layoutDocument(d!, {}, { rtl: true }); // also the default for hbo
    expect(rtl.width).toBeCloseTo(ltr.width, 5);

    const texts = (l: typeof ltr) =>
      l.elements.filter((e) => e.kind === 'text') as Array<{
        text: string;
        x: number;
        rotate?: number;
        anchor: string;
      }>;
    const findX = (l: typeof ltr, t: string) => texts(l).find((e) => e.text === t)?.x;

    // The subject God (אֱלֹהִים) sits left-of-centre in LTR and is mirrored to the
    // right-of-centre in RTL: x_rtl ≈ width − x_ltr.
    const word = 'אֱלֹהִ֑ים';
    const xl = findX(ltr, word)!;
    const xr = findX(rtl, word)!;
    expect(xr).toBeCloseTo(rtl.width - xl, 4);
    expect(xr).toBeGreaterThan(rtl.width / 2); // now on the right

    // A diagonal (rotated) modifier reverses its slant under the mirror.
    const diagL = texts(ltr).find((e) => e.rotate);
    const diagR = texts(rtl).find((e) => e.text === diagL?.text && e.rotate);
    if (diagL && diagR) expect(diagR.rotate).toBeCloseTo(-diagL.rotate!, 4);
  });

  it('defaults to RTL purely from the document language', () => {
    const [d] = maculaHebrewToDocuments(xml(), { book: 'Genesis' });
    const auto = layoutDocument(d!, {});
    const rtl = layoutDocument(d!, {}, { rtl: true });
    const x = (l: typeof auto, t: string) =>
      (l.elements.find((e) => e.kind === 'text' && e.text === t) as { x: number } | undefined)?.x;
    expect(x(auto, 'אֱלֹהִ֑ים')).toBeCloseTo(x(rtl, 'אֱלֹהִ֑ים')!, 4);
  });
});

describe('Hebrew parallel-English alignment (by shared word id)', () => {
  it('links Hebrew tokens to their BSB English words by morpheme id', () => {
    const [d] = maculaHebrewToDocuments(xml(), { book: 'Genesis' });
    // A minimal BSB book: God (idx 3) and heavens/earth, keyed by morpheme id.
    // אֱלֹהִים id o010010010031 → morpheme key "0031"; הַשָּׁמַיִם noun o010010010052 → "0052".
    const book: OtParallelBook = {
      version: 'BSB',
      book: 'Genesis',
      bookNum: 1,
      verses: { '1.1': ['In', 'the', 'beginning', 'God', 'created', 'the', 'heavens', 'and', 'the', 'earth'] },
      links: {
        '1.1': [
          { i: '0031', e: [3] }, // God
          { i: '0052', e: [6] }, // heavens
        ],
      },
    };
    const view = alignParallelHebrew(d!, book);
    expect(view.verses).toHaveLength(1);
    expect(view.verses[0]!.words[3]!.t).toBe('God');
    // The אֱלֹהִים node maps to the English "God" (index 3).
    const godNode = d!.syntax.nodes.find((n) =>
      n.tokenIds.some((t) => d!.tokens.find((x) => x.id === t)?.gloss === 'God'),
    )!;
    expect(view.nodeToEn.get(godNode.id)).toContain('1.1#3');
    expect(view.enToNodes.get('1.1#3')).toContain(godNode.id);
  });
});

describe('Hebrew text measurement', () => {
  it('treats Hebrew points & cantillation as zero-width', () => {
    // בָּרָא pointed vs its bare consonants ברא should measure the same.
    expect(measureText('בָּרָ֣א')).toBeCloseTo(measureText('ברא'), 5);
    // A maqaf (visible separator) DOES add width.
    expect(measureText('עַל־')).toBeGreaterThan(measureText('על'));
  });
});
