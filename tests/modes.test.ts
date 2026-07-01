import { describe, it, expect } from 'vitest';
import { lowfatToDocuments } from '@/io/lowfat';
import { layoutForMode, mirrorLayout, DIAGRAM_MODES, DEFAULT_MODE } from '@/domain/layout';
import { lookupGloss, createDocument, docDirection } from '@/domain/model';
import { buildSvg } from '@/io';
import type { KrDocument } from '@/domain/schema';

/** A relative clause "who was bald" — three short children fanning off one node,
 *  the shape that used to pile subj/cop/pred-adj chips on one spot. */
function relClause(): KrDocument {
  const d = createDocument({ language: 'en', title: 'rel' });
  const root = d.syntax.rootId;
  return {
    ...d,
    tokens: [
      { id: 'tw', index: 0, surface: 'who', pos: 'pronoun' },
      { id: 'ts', index: 1, surface: 'was', pos: 'verb' },
      { id: 'tb', index: 2, surface: 'bald', pos: 'adjective' },
    ],
    syntax: {
      rootId: root,
      nodes: [
        { id: root, kind: 'clause', clauseType: 'relative', tokenIds: [] },
        { id: 'nw', kind: 'word', role: 'subject', tokenIds: ['tw'] },
        { id: 'ns', kind: 'word', role: 'copula', tokenIds: ['ts'] },
        { id: 'nb', kind: 'word', role: 'predicateAdjective', tokenIds: ['tb'] },
      ],
      relations: [
        { id: 'r1', type: 'subject', headId: root, dependentId: 'nw' },
        { id: 'r2', type: 'copula', headId: root, dependentId: 'ns' },
        { id: 'r3', type: 'predicateAdjective', headId: root, dependentId: 'nb' },
      ],
    },
  };
}

/**
 * Alternate diagram modes share the layout→primitive→canvas pipeline. These pin
 * the registry and the first data-driven mode (Dependency); per-mode visual
 * details are verified by rendering.
 */
const XML = `<book name="Test"><sentence><wg role="cl" class="cl" rule="S-V-O">
  <w class="noun" role="s" n="010010010010010" case="nominative" gender="masculine" number="singular">θεός</w>
  <w class="verb" role="v" n="010010010020010" tense="aorist" voice="active" mood="indicative" person="third" number="singular">ἠγάπησεν</w>
  <wg role="o" class="np" rule="DetNp">
    <w class="det" n="010010010030010" case="accusative" gender="masculine" number="singular">τὸν</w>
    <w class="noun" head="true" n="010010010040010" case="accusative" gender="masculine" number="singular">κόσμον</w>
  </wg>
</wg></sentence></book>`;

const doc = () => lowfatToDocuments(XML, { book: 'Test' })[0]!;

describe('diagram mode registry', () => {
  it('lists the modes (selector order) and defaults to Phrase/Block', () => {
    expect(DEFAULT_MODE).toBe('phrase-block');
    expect(DIAGRAM_MODES.map((m) => m.id)).toEqual([
      'kellogg-reed',
      'phrase-block',
      'dependency',
      'dependency-tree',
      'constituency',
      'morphology',
    ]);
    expect(DIAGRAM_MODES.every((m) => m.label && m.description)).toBe(true);
  });

  it('every mode produces a non-empty layout (no crash on a real parse)', () => {
    for (const m of DIAGRAM_MODES) {
      const layout = layoutForMode(m.id, doc(), {}, {});
      expect(layout.width).toBeGreaterThan(0);
      expect(layout.elements.length).toBeGreaterThan(0);
    }
  });
});

describe('dependency mode', () => {
  it('keeps Greek tokens in surface order on the baseline', () => {
    const layout = layoutForMode('dependency', doc(), {}, {});
    // The main (non-small) text run is the Greek tokens, left to right.
    const greek = layout.elements
      .filter((e) => e.kind === 'text' && !e.small)
      .map((e) => e as { x: number; text: string })
      .sort((a, b) => a.x - b.x)
      .map((e) => e.text);
    expect(greek).toEqual(['θεός', 'ἠγάπησεν', 'τὸν', 'κόσμον']);
  });

  it('draws head→dependent arcs (curves) with relation labels', () => {
    const layout = layoutForMode('dependency', doc(), {}, {});
    const curves = layout.elements.filter((e) => e.kind === 'curve');
    expect(curves.length).toBeGreaterThanOrEqual(3); // subject, object, determiner…
    expect(curves.every((c) => c.kind === 'curve' && c.arrow)).toBe(true);
    const labels = layout.elements.filter((e) => e.kind === 'text' && e.small && e.italic).map((e) => (e as { text: string }).text);
    expect(labels).toContain('subj');
    expect(labels).toContain('obj');
  });

  it('colour-codes arcs and renders each label as a glossable chip', () => {
    const layout = layoutForMode('dependency', doc(), {}, {});
    // Every dependency arc carries an explicit colour.
    const arcs = layout.elements.filter((e) => e.kind === 'curve' && e.relationId);
    expect(arcs.length).toBeGreaterThan(0);
    expect(arcs.every((c) => typeof (c as { color?: string }).color === 'string')).toBe(true);
    // Each relation label is a chip and is tappable for its meaning.
    const chips = layout.elements.filter(
      (e) => e.kind === 'text' && (e as { box?: boolean }).box && (e as { relationId?: string }).relationId,
    ) as Array<{ text: string; color?: string; glossKey?: string }>;
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.every((c) => c.color && c.glossKey)).toBe(true);
    const subj = chips.find((c) => c.text === 'subj');
    expect(subj?.glossKey).toBe('subject');
  });

  it('stacks overlapping arcs at different heights so they do not collide', () => {
    const layout = layoutForMode('dependency', doc(), {}, {});
    const yOf = (label: string) =>
      (layout.elements.find(
        (e) => e.kind === 'text' && (e as { box?: boolean }).box && (e as { text: string }).text === label,
      ) as { y: number }).y;
    // The object arc spans across the determiner arc, so it must ride higher
    // (smaller y) than the subject arc, which sits at the base level.
    expect(yOf('obj')).toBeLessThan(yOf('subj'));
  });

  it('marks each sentence root with a glossable chip pointing at the main verb', () => {
    const layout = layoutForMode('dependency', doc(), {}, {});
    const root = layout.elements.find(
      (e) => e.kind === 'text' && (e as { text: string }).text === 'root',
    ) as { box?: boolean; glossKey?: string } | undefined;
    expect(root?.box).toBe(true);
    expect(root?.glossKey).toBe('root');
  });
});

describe('mode-aware export', () => {
  it('exports the SELECTED mode, not always Kellogg-Reed', () => {
    const krSvg = buildSvg(doc()); // default kellogg-reed
    const depSvg = buildSvg(doc(), {}, 'dependency');
    expect(depSvg).not.toEqual(krSvg);
    // Dependency chips are rounded rects (rx); Kellogg-Reed emits none.
    expect(depSvg).toContain('rx="4"');
    expect(krSvg).not.toContain('rx="4"');
  });
});

describe('phrase / block mode', () => {
  it('renders an indented outline with function labels and Greek words', () => {
    const layout = layoutForMode('phrase-block', doc(), {}, {});
    const labels = layout.elements
      .filter((e) => e.kind === 'text' && e.small)
      .map((e) => (e as { text: string }).text);
    expect(labels).toContain('subject');
    expect(labels).toContain('verb');
    expect(labels).toContain('object');
    // Greek words present as full-size rows.
    const greek = layout.elements
      .filter((e) => e.kind === 'text' && !e.small)
      .map((e) => (e as { text: string }).text);
    expect(greek).toEqual(expect.arrayContaining(['θεός', 'ἠγάπησεν', 'κόσμον', 'τὸν']));
  });

  it('indents a dependent deeper than its head (article under its noun)', () => {
    const layout = layoutForMode('phrase-block', doc(), {}, {});
    const xOf = (t: string) =>
      (layout.elements.find((e) => e.kind === 'text' && !e.small && (e as { text: string }).text === t) as { x: number }).x;
    // The article τὸν nests under the object κόσμον, so it is indented further right.
    expect(xOf('τὸν')).toBeGreaterThan(xOf('κόσμον'));
  });
});

describe('constituency (phrase-structure) tree mode', () => {
  it('builds an S → NP/VP tree with category nodes and POS-tagged leaves', () => {
    const layout = layoutForMode('constituency', doc(), {}, {});
    const texts = layout.elements.filter((e) => e.kind === 'text') as Array<{
      text: string;
      small?: boolean;
      box?: boolean;
      nodeId?: string;
    }>;
    const all = texts.map((t) => t.text);
    // Category (internal) nodes.
    expect(all).toEqual(expect.arrayContaining(['S', 'VP', 'NP']));
    // The actual words sit at the leaves.
    expect(all).toEqual(expect.arrayContaining(['θεός', 'ἠγάπησεν', 'κόσμον', 'τὸν']));
    // POS tags label the leaves (small, not a role chip).
    const posTags = texts.filter((t) => t.small && !t.box).map((t) => t.text);
    expect(posTags).toEqual(expect.arrayContaining(['N', 'V', 'Det']));
    // The grammatical role rides each branch as a tappable chip.
    const chips = texts.filter((t) => t.box).map((t) => t.text);
    expect(chips).toEqual(expect.arrayContaining(['subj', 'obj']));
  });

  it('makes every category and POS-tag symbol tappable for a plain-English definition', () => {
    const layout = layoutForMode('constituency', doc(), {}, {});
    const texts = layout.elements.filter((e) => e.kind === 'text') as Array<{ text: string; glossKey?: string }>;
    const byText = (t: string) => texts.find((e) => e.text === t)!;
    // Category symbols carry a glossary key that resolves to a definition.
    expect(lookupGloss(byText('S').glossKey)?.term).toMatch(/Sentence|Clause/);
    expect(lookupGloss(byText('NP').glossKey)?.term).toContain('Noun phrase');
    expect(lookupGloss(byText('VP').glossKey)?.term).toContain('Verb phrase');
    // POS leaf tags too — and "N" must NOT collide with the neuter morphology code.
    expect(lookupGloss(byText('N').glossKey)?.term).toContain('Noun (N)');
    expect(lookupGloss(byText('Det').glossKey)?.term).toContain('Determiner');
  });

  it('keeps sibling role chips from overlapping in a shallow fan — vertical (clash guard)', () => {
    const layout = layoutForMode('constituency', relClause(), {}, { treeOrientation: 'vertical' });
    const chips = (layout.elements.filter(
      (e) => e.kind === 'text' && (e as { box?: boolean }).box,
    ) as Array<{ text: string; x: number }>)
      .filter((c) => ['subj', 'cop', 'pred-adj'].includes(c.text))
      .sort((a, b) => a.x - b.x);
    expect(chips.map((c) => c.text)).toEqual(['subj', 'cop', 'pred-adj']);
    // Top-down: siblings fan across X, so the chip boxes can't pile up on one spot.
    for (let i = 1; i < chips.length; i++) {
      expect(chips[i]!.x - chips[i - 1]!.x).toBeGreaterThan(45);
    }
  });

  it('keeps sibling role chips from overlapping in a shallow fan — horizontal (clash guard)', () => {
    // Horizontal is the default; siblings stack down Y instead of across X.
    const layout = layoutForMode('constituency', relClause(), {}, {});
    const chips = (layout.elements.filter(
      (e) => e.kind === 'text' && (e as { box?: boolean }).box,
    ) as Array<{ text: string; y: number }>)
      .filter((c) => ['subj', 'cop', 'pred-adj'].includes(c.text))
      .sort((a, b) => a.y - b.y);
    expect(chips.length).toBe(3);
    for (let i = 1; i < chips.length; i++) {
      expect(chips[i]!.y - chips[i - 1]!.y).toBeGreaterThan(20);
    }
  });

  it('prefers the gold-standard Lowfat <wg> category over the POS estimate', () => {
    // The converter stamps the source phrase category on the head token; the
    // object NP "τὸν κόσμον" therefore carries an explicit NP from the <wg>.
    const kosmon = doc().tokens.find((t) => t.surface === 'κόσμον')!;
    expect(kosmon.morphology?.extra?.cat).toBe('NP');
  });
});

describe('dependency tree clash guard', () => {
  it('vertical: places each edge label above its child so close-fanned labels do not overlap', () => {
    const layout = layoutForMode('dependency-tree', relClause(), {}, { treeOrientation: 'vertical' });
    const chips = (layout.elements.filter(
      (e) => e.kind === 'text' && (e as { box?: boolean }).box,
    ) as Array<{ text: string; x: number }>).filter((c) => c.text === 'subj' || c.text === 'pred-adj');
    expect(chips.length).toBe(2);
    expect(Math.abs(chips[0]!.x - chips[1]!.x)).toBeGreaterThan(45);
  });

  it('horizontal (default): stacks edge labels down Y so close-fanned labels do not overlap', () => {
    const layout = layoutForMode('dependency-tree', relClause(), {}, {});
    const chips = (layout.elements.filter(
      (e) => e.kind === 'text' && (e as { box?: boolean }).box,
    ) as Array<{ text: string; y: number }>).filter((c) => c.text === 'subj' || c.text === 'pred-adj');
    expect(chips.length).toBe(2);
    expect(Math.abs(chips[0]!.y - chips[1]!.y)).toBeGreaterThan(20);
  });
});

describe('tree orientation', () => {
  it('defaults to horizontal growth: the root sits left of its children', () => {
    const layout = layoutForMode('dependency-tree', relClause(), {}, {});
    const texts = layout.elements.filter((e) => e.kind === 'text') as Array<{ text: string; x: number }>;
    const root = texts.find((t) => t.text === '[ROOT]')!;
    const verb = texts.find((t) => t.text === 'was')!; // the predicate, one level in
    expect(root.x).toBeLessThan(verb.x);
  });

  it('vertical growth puts the root above its children', () => {
    const layout = layoutForMode('dependency-tree', relClause(), {}, { treeOrientation: 'vertical' });
    const texts = layout.elements.filter((e) => e.kind === 'text') as Array<{ text: string; y: number }>;
    const root = texts.find((t) => t.text === '[ROOT]')!;
    const verb = texts.find((t) => t.text === 'was')!;
    expect(root.y).toBeLessThan(verb.y);
  });
});

describe('right-to-left layout + horizontal flip', () => {
  // x of the first text element with this surface, in a laid-out diagram.
  const xOf = (layout: { elements: readonly unknown[] }, text: string) =>
    (layout.elements.find(
      (e) => (e as { kind: string; text?: string }).kind === 'text' && (e as { text?: string }).text === text,
    ) as { x: number }).x;

  it('docDirection: Hebrew is RTL, Greek/English LTR, and an explicit flag wins', () => {
    expect(docDirection({ language: 'hbo' })).toBe('rtl');
    expect(docDirection({ language: 'grc' })).toBe('ltr');
    expect(docDirection({ language: 'en' })).toBe('ltr');
    // explicit direction overrides the language guess (e.g. an Arabic custom doc)
    expect(docDirection({ language: 'ar', direction: 'ltr' })).toBe('ltr');
    expect(docDirection({ language: 'en', direction: 'rtl' })).toBe('rtl');
  });

  it('mirrors the Kellogg-Reed baseline about the diagram width when RTL', () => {
    const ltr = layoutForMode('kellogg-reed', doc(), {}, { rtl: false });
    const rtl = layoutForMode('kellogg-reed', doc(), {}, { rtl: true });
    expect(rtl.width).toBeCloseTo(ltr.width);
    // Every word's x is reflected across the diagram width (x → width − x).
    expect(xOf(rtl, 'ἠγάπησεν')).toBeCloseTo(ltr.width - xOf(ltr, 'ἠγάπησεν'));
    expect(xOf(rtl, 'θεός')).toBeCloseTo(ltr.width - xOf(ltr, 'θεός'));
  });

  it('mirrors the Phrase/Block diagram too (via mirrorLayout)', () => {
    const ltr = layoutForMode('phrase-block', doc(), {}, { rtl: false });
    const rtl = layoutForMode('phrase-block', doc(), {}, { rtl: true });
    expect(xOf(rtl, 'θεός')).toBeCloseTo(ltr.width - xOf(ltr, 'θεός'));
    // Mirroring the LTR layout directly reproduces the RTL one.
    expect(xOf(mirrorLayout(ltr), 'θεός')).toBeCloseTo(xOf(rtl, 'θεός'));
  });

  it('auto-mirrors when the document itself is RTL, and the flip toggle un-mirrors it', () => {
    const rtlDoc = { ...doc(), language: 'hbo', direction: 'rtl' as const };
    // No explicit option: an RTL document lays out right-to-left by default.
    const auto = layoutForMode('kellogg-reed', rtlDoc, {}, {});
    // The flip toggle forces rtl:false (read left-to-right, English word order).
    const flipped = layoutForMode('kellogg-reed', rtlDoc, {}, { rtl: false });
    expect(xOf(auto, 'ἠγάπησεν')).toBeCloseTo(flipped.width - xOf(flipped, 'ἠγάπησεν'));
  });

  it('leaves an LTR (Greek) document unmirrored by default', () => {
    const auto = layoutForMode('kellogg-reed', doc(), {}, {});
    const forcedLtr = layoutForMode('kellogg-reed', doc(), {}, { rtl: false });
    expect(xOf(auto, 'ἠγάπησεν')).toBeCloseTo(xOf(forcedLtr, 'ἠγάπησεν'));
  });
});

describe('morphology clause mode', () => {
  it('shows compact morphology under each Greek word, in surface order', () => {
    const layout = layoutForMode('morphology', doc(), {}, {});
    const small = layout.elements.filter((e) => e.kind === 'text' && e.small).map((e) => (e as { text: string }).text);
    expect(small).toContain('nom sg m'); // θεός
    expect(small).toContain('aor act ind 3sg'); // ἠγάπησεν
    expect(small).toContain('acc sg m'); // κόσμον / τὸν
  });

  it('tints grammatical categories (verb, nominative, accusative)', () => {
    const layout = layoutForMode('morphology', doc(), {}, {});
    const toneOf = (t: string) =>
      (layout.elements.find((e) => e.kind === 'text' && (e as { text: string }).text === t) as { tone?: string }).tone;
    expect(toneOf('θεός')).toBe('nominative');
    expect(toneOf('ἠγάπησεν')).toBe('verb');
    expect(toneOf('κόσμον')).toBe('accusative');
  });

  it('draws agreement/government links (article→noun, subject→verb)', () => {
    const layout = layoutForMode('morphology', doc(), {}, {});
    const linkLabels = layout.elements.filter((e) => e.kind === 'text' && e.italic).map((e) => (e as { text: string }).text);
    expect(linkLabels).toContain('subj');
    expect(linkLabels).toContain('agr');
    expect(layout.elements.some((e) => e.kind === 'curve')).toBe(true);
  });

  it('makes the agreement / subject link labels tappable for their meaning', () => {
    const layout = layoutForMode('morphology', doc(), {}, {});
    const labelGloss = (text: string) =>
      (layout.elements.find((e) => e.kind === 'text' && (e as { text: string }).text === text) as {
        glossKey?: string;
      }).glossKey;
    expect(labelGloss('agr')).toBe('agreement');
    expect(labelGloss('subj')).toBe('subject');
  });
});
