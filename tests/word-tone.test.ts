import { describe, it, expect } from 'vitest';
import { KrDocumentSchema, type KrDocument } from '@/domain/schema';
import { layoutForMode, type DiagramMode } from '@/domain/layout';
import type { GrammarTone, TextElement } from '@/domain/layout/types';

/**
 * Word colouring is shared across the structural views: the Morphology Clause
 * mode tints each word by its grammatical category (case / finite verb /
 * participle), and the Kellogg-Reed and Phrase/Block modes reuse the SAME tone
 * so a word reads the same colour in every view.
 */

// "ἄνθρωπος γράφει λόγον θεοῦ" — a nominative subject, a finite verb, an
// accusative object, and a genitive — one token of each tinted category, plus an
// untinted article.
const doc: KrDocument = KrDocumentSchema.parse({
  schemaVersion: 1,
  id: 'doc',
  title: 't',
  language: 'grc',
  text: 'ὁ ἄνθρωπος γράφει λόγον θεοῦ',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  layoutHints: {},
  tokens: [
    { id: 'art', index: 0, surface: 'ὁ', pos: 'article', morphology: { case: 'nominative' } },
    { id: 'sub', index: 1, surface: 'ἄνθρωπος', pos: 'noun', morphology: { case: 'nominative' } },
    { id: 'vrb', index: 2, surface: 'γράφει', pos: 'verb', morphology: { tense: 'present', mood: 'indicative' } },
    { id: 'obj', index: 3, surface: 'λόγον', pos: 'noun', morphology: { case: 'accusative' } },
    { id: 'gen', index: 4, surface: 'θεοῦ', pos: 'noun', morphology: { case: 'genitive' } },
  ],
  syntax: {
    rootId: 'n_root',
    nodes: [
      { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
      { id: 'S', kind: 'word', role: 'subject', tokenIds: ['sub'] },
      { id: 'ART', kind: 'word', role: 'determiner', tokenIds: ['art'] },
      { id: 'V', kind: 'word', role: 'predicate', tokenIds: ['vrb'] },
      { id: 'O', kind: 'word', role: 'directObject', tokenIds: ['obj'] },
      { id: 'G', kind: 'word', role: 'genitive', tokenIds: ['gen'] },
    ],
    relations: [
      { id: 'r1', type: 'subject', headId: 'n_root', dependentId: 'S' },
      { id: 'r2', type: 'determiner', headId: 'S', dependentId: 'ART' },
      { id: 'r3', type: 'predicate', headId: 'n_root', dependentId: 'V' },
      { id: 'r4', type: 'directObject', headId: 'V', dependentId: 'O' },
      { id: 'r5', type: 'genitive', headId: 'O', dependentId: 'G' },
    ],
  },
});

const EXPECT: Record<string, GrammarTone | undefined> = {
  S: 'nominative',
  V: 'verb',
  O: 'accusative',
  G: 'genitive',
  ART: 'nominative', // the article agrees in case, so it tints too
};

const toneByNode = (mode: DiagramMode): Map<string, GrammarTone | undefined> => {
  const layout = layoutForMode(mode, doc, doc.layoutHints);
  const map = new Map<string, GrammarTone | undefined>();
  for (const el of layout.elements) {
    if (el.kind !== 'text') continue;
    const t = el as TextElement;
    if (t.nodeId) map.set(t.nodeId, t.tone);
  }
  return map;
};

describe('word tone is shared across the structural views', () => {
  for (const mode of ['kellogg-reed', 'phrase-block', 'morphology'] as DiagramMode[]) {
    it(`tints each word by its grammatical category in ${mode}`, () => {
      const tones = toneByNode(mode);
      for (const [nodeId, tone] of Object.entries(EXPECT)) {
        expect(tones.get(nodeId)).toBe(tone);
      }
    });
  }

  it('agrees between Kellogg-Reed and the Morphology Clause mode', () => {
    const kr = toneByNode('kellogg-reed');
    const morph = toneByNode('morphology');
    for (const nodeId of Object.keys(EXPECT)) {
      expect(kr.get(nodeId)).toBe(morph.get(nodeId));
    }
  });
});
