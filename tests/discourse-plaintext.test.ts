import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildDiscourseDocumentFromPlainText,
  splitPlainTextSentences,
  hashDiscourseBase,
  leafUnits,
  labelDiscourseUnit,
  splitDiscourseUnit,
} from '@/domain/discourse';
import { DiscourseDocumentSchema } from '@/domain/schema';
import { useDiscourseStore, useEditorStore } from '@/state';
import { cloneSample } from '@/fixtures';

/**
 * Phase 3/5 — Discourse "New text" plaintext loader. Pastes become sentence
 * units with NO LLM prompt, NO syntax parse, and NO fabricated markers/tags.
 * Ids are deterministic so re-loading the same text restores patches.
 */

const NOW = '2026-01-01T00:00:00.000Z';
const SAMPLE = 'The boy ran. The boy ran home.';

describe('plaintext → discourse builder (pure)', () => {
  it('splits into sentence units and tokenizes every word', () => {
    const doc = buildDiscourseDocumentFromPlainText(SAMPLE, { now: NOW })!;
    expect(() => DiscourseDocumentSchema.parse(doc)).not.toThrow();
    const leaves = leafUnits(doc);
    expect(leaves).toHaveLength(2);
    // All non-space words are present as tokens (incl. trailing punctuation).
    const surfaces = doc.tokens.map((t) => t.surface);
    expect(surfaces).toContain('boy');
    expect(surfaces).toContain('home.');
    expect(doc.language).toBe('en');
    expect(doc.sourceId).toBe('custom-plaintext');
  });

  it('invents no markers, suggestions, lemmas, morphology, or Strong’s', () => {
    const doc = buildDiscourseDocumentFromPlainText('Therefore he went. But she stayed.', { now: NOW })!;
    expect(doc.markers).toHaveLength(0);
    expect(doc.suggestions).toHaveLength(0);
    expect(doc.relations).toHaveLength(0);
    for (const t of doc.tokens) {
      expect(t.lemma).toBeUndefined();
      expect(t.pos).toBeUndefined();
      expect(t.strong).toBeUndefined();
    }
  });

  it('is deterministic — same text yields same ids and baseHash', () => {
    const a = buildDiscourseDocumentFromPlainText(SAMPLE, { now: NOW })!;
    const b = buildDiscourseDocumentFromPlainText(SAMPLE, { now: '2030-02-02T00:00:00.000Z' })!;
    expect(a.id).toBe(b.id);
    expect(a.units.map((u) => u.id)).toEqual(b.units.map((u) => u.id));
    expect(a.tokens.map((t) => t.id)).toEqual(b.tokens.map((t) => t.id));
    expect(hashDiscourseBase(a)).toBe(hashDiscourseBase(b));
  });

  it('treats blank lines as paragraph breaks and handles ? and !', () => {
    expect(splitPlainTextSentences('One. Two? Three!')).toEqual(['One.', 'Two?', 'Three!']);
    expect(splitPlainTextSentences('Para one.\n\nPara two here')).toEqual(['Para one.', 'Para two here']);
    // Trailing text with no terminal punctuation still becomes a sentence.
    expect(splitPlainTextSentences('No stop here')).toEqual(['No stop here']);
  });

  it('returns null for empty / whitespace-only input', () => {
    expect(buildDiscourseDocumentFromPlainText('   \n\n  ')).toBeNull();
    expect(buildDiscourseDocumentFromPlainText('')).toBeNull();
  });

  it('uses a supplied title, else the opening words', () => {
    expect(buildDiscourseDocumentFromPlainText(SAMPLE, { title: 'My draft' })!.title).toBe('My draft');
    expect(buildDiscourseDocumentFromPlainText(SAMPLE)!.title).toMatch(/^The boy ran/);
  });
});

describe('plaintext in the discourse store (edit / persist / reset / isolation)', () => {
  beforeEach(() => {
    localStorage.clear();
    useDiscourseStore.setState({ baseDoc: null, doc: null, status: 'idle', error: null, past: [], future: [] });
  });

  it('loads plaintext without touching the syntax passage', () => {
    const john = cloneSample('doc_sample_john_1_1a')!;
    useEditorStore.getState().loadDocument(john, { corpus: 'gnt' });
    const syntaxBefore = useEditorStore.getState().doc;

    const ok = useDiscourseStore.getState().loadPlainText(SAMPLE, 'Draft');
    expect(ok).toBe(true);
    expect(useDiscourseStore.getState().status).toBe('loaded');
    expect(leafUnits(useDiscourseStore.getState().doc!)).toHaveLength(2);
    // Syntax passage is the same object — untouched.
    expect(useEditorStore.getState().doc).toBe(syntaxBefore);
  });

  it('supports edit, undo, and reload-persistence keyed by the text', () => {
    useDiscourseStore.getState().loadPlainText(SAMPLE);
    const first = leafUnits(useDiscourseStore.getState().doc!)[0]!;
    useDiscourseStore.getState().labelUnit(first.id, 'A');
    expect(useDiscourseStore.getState().doc!.units.find((u) => u.id === first.id)?.label).toBe('A');

    // Fresh session: clear in-memory docs, re-paste the SAME text → label restored.
    useDiscourseStore.setState({ baseDoc: null, doc: null, status: 'idle', past: [], future: [] });
    useDiscourseStore.getState().loadPlainText(SAMPLE);
    expect(useDiscourseStore.getState().doc!.units.find((u) => u.id === first.id)?.label).toBe('A');
  });

  it('reset isolates to this plaintext doc only', () => {
    useDiscourseStore.getState().loadPlainText(SAMPLE);
    const first = leafUnits(useDiscourseStore.getState().doc!)[0]!;
    useDiscourseStore.getState().labelUnit(first.id, 'A');
    useDiscourseStore.getState().resetEdits();
    expect(useDiscourseStore.getState().doc!.units.find((u) => u.id === first.id)?.label).toBeUndefined();
  });

  it('reports an error on empty input without clobbering a loaded doc', () => {
    useDiscourseStore.getState().loadPlainText(SAMPLE);
    const before = useDiscourseStore.getState().doc;
    const ok = useDiscourseStore.getState().loadPlainText('   ');
    expect(ok).toBe(false);
    expect(useDiscourseStore.getState().status).toBe('error');
    expect(useDiscourseStore.getState().doc).toBe(before);
  });
});

describe('pure-function edits over plaintext (split/label)', () => {
  it('splits and labels a plaintext unit', () => {
    let doc = buildDiscourseDocumentFromPlainText('One two three four.', { now: NOW })!;
    const unit = leafUnits(doc)[0]!;
    doc = splitDiscourseUnit(doc, unit.id, unit.tokenIds[2]!, NOW);
    expect(leafUnits(doc)).toHaveLength(2);
    doc = labelDiscourseUnit(doc, unit.id, 'X', NOW);
    expect(doc.units.find((u) => u.id === unit.id)?.label).toBe('X');
  });
});
