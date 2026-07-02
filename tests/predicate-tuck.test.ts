import { describe, it, expect } from 'vitest';
import { importLlmDiagram } from '@/io/llm';
import { layoutDocument } from '@/domain/layout';
import { measureText, SMALL_FONT } from '@/domain/layout/measure';
import { LAYOUT } from '@/domain/layout/constants';
import type { TextElement } from '@/domain/layout/types';

/**
 * PREDICATE TUCK — a subject whose width is dominated by a DEEP below-hanging
 * relative clause (its rows cascade down-and-right, so the wide part sits well
 * below the baseline) must NOT fling the predicate past that whole width. The
 * predicate slides left into the empty band above the clause's deep rows.
 *
 * Mirrors the Colossians 1:18 shape "αὐτός ἐστιν ἡ κεφαλὴ … , ὅς ἐστιν
 * πρωτότοκος …": here the relative clause's predicate nominative trails a long
 * genitive chain that cascades down-right, and the main predicate nominative is
 * attached to the clause (as an LLM parse does), so it draws as a right-hand
 * phrase whose depth is measured, not guessed.
 */
const DOC = {
  kind: 'scripture-diagrammer/diagram',
  version: 1,
  language: 'en',
  text: 'He is head, who is firstborn of creation of ages of light of glory.',
  tokens: [
    { id: 'he', surface: 'He', pos: 'pronoun' },
    { id: 'is', surface: 'is', pos: 'verb' },
    { id: 'head', surface: 'head', pos: 'noun' },
    { id: 'who', surface: 'who', pos: 'pronoun' },
    { id: 'is2', surface: 'is', pos: 'verb' },
    { id: 'first', surface: 'firstborn', pos: 'noun' },
    { id: 'creation', surface: 'creation', pos: 'noun' },
    { id: 'ages', surface: 'ages', pos: 'noun' },
    { id: 'light', surface: 'light', pos: 'noun' },
    { id: 'glory', surface: 'glory', pos: 'noun' },
  ],
  nodes: [
    { id: 'c0', kind: 'clause', clauseType: 'independent' },
    { id: 'ns', kind: 'word', role: 'subject', tokens: ['he'] },
    { id: 'nv', kind: 'word', role: 'copula', tokens: ['is'] },
    { id: 'nn', kind: 'word', role: 'predicateNominative', tokens: ['head'] },
    { id: 'crel', kind: 'clause', clauseType: 'relative' },
    { id: 'nrs', kind: 'word', role: 'subject', tokens: ['who'] },
    { id: 'nrv', kind: 'word', role: 'copula', tokens: ['is2'] },
    { id: 'nrn', kind: 'word', role: 'predicateNominative', tokens: ['first'] },
    { id: 'g1', kind: 'word', role: 'genitive', tokens: ['creation'] },
    { id: 'g2', kind: 'word', role: 'genitive', tokens: ['ages'] },
    { id: 'g3', kind: 'word', role: 'genitive', tokens: ['light'] },
    { id: 'g4', kind: 'word', role: 'genitive', tokens: ['glory'] },
  ],
  relations: [
    { type: 'subject', head: 'c0', dependent: 'ns' },
    { type: 'copula', head: 'c0', dependent: 'nv' },
    { type: 'predicateNominative', head: 'c0', dependent: 'nn' },
    { type: 'adjectival', head: 'ns', dependent: 'crel' },
    { type: 'subject', head: 'crel', dependent: 'nrs' },
    { type: 'copula', head: 'crel', dependent: 'nrv' },
    { type: 'predicateNominative', head: 'crel', dependent: 'nrn' },
    { type: 'genitive', head: 'nrn', dependent: 'g1' },
    { type: 'genitive', head: 'g1', dependent: 'g2' },
    { type: 'genitive', head: 'g2', dependent: 'g3' },
    { type: 'genitive', head: 'g3', dependent: 'g4' },
  ],
  rootId: 'c0',
};

const wordX = (els: TextElement[], text: string) => els.find((e) => e.text === text)!.x;

function textElements(doc: Parameters<typeof layoutDocument>[0]): TextElement[] {
  return layoutDocument(doc).elements.filter((e): e is TextElement => e.kind === 'text');
}

describe('predicate tuck: a deep relative-clause subject does not push the predicate past its full width', () => {
  const imported = importLlmDiagram(JSON.stringify(DOC));
  it('imports the synthetic diagram', () => {
    expect(imported.ok).toBe(true);
  });

  it('tucks the main predicate LEFT of the relative clause’s deep right extent', () => {
    const els = textElements(imported.document!);
    const headX = wordX(els, 'head');
    // The relative clause cascades down-and-right through its genitive chain; its
    // deepest word (glory) sits far to the right. The tuck must place the predicate
    // nominative (head) to the LEFT of that — not past the whole clause.
    const cascadeRight = Math.max(
      wordX(els, 'creation'),
      wordX(els, 'ages'),
      wordX(els, 'light'),
      wordX(els, 'glory'),
    );
    expect(headX).toBeLessThan(cascadeRight);
  });

  it('produces no overlapping words', () => {
    const els = textElements(imported.document!);
    const bbox = (e: TextElement) => {
      const fs = e.small ? LAYOUT.smallFontSize : LAYOUT.fontSize;
      const w = measureText(e.text, e.small ? SMALL_FONT : undefined);
      if (e.rotate) {
        const c = Math.max(w, fs) / 2;
        return { x0: e.x - c, x1: e.x + c, y0: e.y - c, y1: e.y + c };
      }
      const x0 = e.anchor === 'middle' ? e.x - w / 2 : e.anchor === 'end' ? e.x - w : e.x;
      return { x0, x1: x0 + w, y0: e.y - fs * 0.8, y1: e.y + fs * 0.2 };
    };
    const boxes = els.filter((e) => e.text.trim()).map(bbox);
    let clashes = 0;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        if (a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1) clashes++;
      }
    }
    expect(clashes).toBe(0);
  });
});
