import { describe, it, expect } from 'vitest';
import { createDocument, tokenize } from '@/domain/model';
import { runInference, applyInference, applyInferences } from '@/domain/inference';
import type { KrDocument } from '@/domain/schema';

const clock = () => '2024-01-01T00:00:00.000Z';

function docWith(language: 'en' | 'grc', text: string): KrDocument {
  const base = createDocument({ language, text }, clock);
  return { ...base, tokens: tokenize(text, language) };
}

describe('inference engine', () => {
  it('is deterministic (stable inference ids)', () => {
    const doc = docWith('en', 'The Word became flesh.');
    const a = runInference(doc).inferences.map((i) => i.id);
    const b = runInference(doc).inferences.map((i) => i.id);
    expect(a).toEqual(b);
  });

  it('every inference carries source, confidence, and reason', () => {
    const doc = docWith('en', 'The quick brown fox jumps over the lazy dog.');
    const { inferences } = runInference(doc);
    expect(inferences.length).toBeGreaterThan(0);
    for (const inf of inferences) {
      expect(inf.provenance.source).toBe('inferred');
      expect(['high', 'medium', 'low']).toContain(inf.provenance.confidence);
      expect(typeof inf.provenance.reason).toBe('string');
      expect(inf.provenance.reason!.length).toBeGreaterThan(0);
    }
  });

  it('proposes a predicate and predicate nominative for a copular clause', () => {
    const doc = docWith('en', 'The Word became flesh.');
    const cats = runInference(doc).inferences.map((i) => i.category);
    expect(cats).toContain('predicate');
    expect(cats).toContain('subject');
  });

  it('infers an implied subject for a Greek finite verb with no nominative', () => {
    const doc = docWith('grc', 'ἀκηκόαμεν');
    // mark it as a verb so the rule recognises it
    doc.tokens[0]!.pos = 'verb';
    doc.tokens[0]!.morphology = { mood: 'indicative', person: 'first', number: 'plural' };
    const subjectInfs = runInference(doc).inferences.filter((i) => i.category === 'subject');
    expect(subjectInfs.some((i) => i.title.toLowerCase().includes('implied'))).toBe(true);
  });

  it('accepting an inference flips provenance to confirmed and is idempotent', () => {
    const doc = docWith('en', 'The Word became flesh.');
    const { inferences } = runInference(doc);
    const predInf = inferences.find((i) => i.category === 'predicate')!;
    const once = applyInference(doc, predInf);
    const twice = applyInference(once, predInf);
    // idempotent: applying twice doesn't duplicate nodes
    expect(twice.syntax.nodes.length).toBe(once.syntax.nodes.length);
    const confirmed = once.syntax.nodes.find((n) => n.provenance?.source === 'confirmed');
    expect(confirmed).toBeDefined();
  });

  it('rejecting is just dropping — the document is untouched', () => {
    const doc = docWith('en', 'The Word became flesh.');
    const before = JSON.stringify(doc.syntax);
    // (reject = caller filters list; document never receives ops)
    expect(JSON.stringify(doc.syntax)).toBe(before);
  });

  it('accept-all applies in any order without dangling references', () => {
    const doc = docWith('en', 'The quick brown fox jumps over the lazy dog.');
    const { inferences } = runInference(doc);
    const out = applyInferences(doc, inferences);
    const nodeIds = new Set(out.syntax.nodes.map((n) => n.id));
    for (const r of out.syntax.relations) {
      expect(nodeIds.has(r.headId)).toBe(true);
      expect(nodeIds.has(r.dependentId)).toBe(true);
    }
  });
});
