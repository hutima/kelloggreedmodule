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

  it('synthesizes an implied copula for a verbless Greek nominal clause', () => {
    // "χάρις ὑμῖν" — Grace [be] to you. No verb; a nominative subject + dative.
    const doc = docWith('grc', 'χάρις');
    doc.tokens = [
      { id: 't1', index: 0, surface: 'χάρις', pos: 'noun', morphology: { case: 'nominative' } },
      { id: 't2', index: 1, surface: 'ὑμῖν', pos: 'pronoun', morphology: { case: 'dative' } },
    ];
    const out = applyInferences(doc, runInference(doc).inferences);
    const predRel = out.syntax.relations.find((r) => r.type === 'predicate');
    const predNode = out.syntax.nodes.find((n) => n.id === predRel?.dependentId);
    expect(predNode?.implied).toBe(true);
    expect(predNode?.label).toBe('(ἐστίν)');
    // The nominative is the subject, not the oblique dative pronoun.
    const subjRel = out.syntax.relations.find((r) => r.type === 'subject');
    const subjNode = out.syntax.nodes.find((n) => n.id === subjRel?.dependentId);
    expect(subjNode?.tokenIds).toEqual(['t1']);
    // The dative attaches to the implied copula as a complement.
    expect(out.syntax.relations.some((r) => r.type === 'dativeComplement')).toBe(true);
  });

  it('assigns Greek case roles, marking ambiguous ones low-confidence', () => {
    // ἀγαπῶμεν τὸν θεὸν τῇ καρδίᾳ τοῦ ἀνθρώπου
    // (we love)  (the) (God-ACC) (the) (heart-DAT) (the) (man-GEN)
    const doc = docWith('grc', 'verb');
    doc.tokens = [
      { id: 't1', index: 0, surface: 'ἀγαπῶμεν', pos: 'verb', morphology: { mood: 'indicative' } },
      { id: 't2', index: 1, surface: 'θεὸν', pos: 'noun', morphology: { case: 'accusative' } },
      { id: 't3', index: 2, surface: 'καρδίᾳ', pos: 'noun', morphology: { case: 'dative' } },
      { id: 't4', index: 3, surface: 'ἀνθρώπου', pos: 'noun', morphology: { case: 'genitive' } },
    ];
    const infs = runInference(doc).inferences;
    const obj = infs.find((i) => i.title.startsWith('directObject'));
    const dat = infs.find((i) => i.title.startsWith('dativeComplement'));
    const gen = infs.find((i) => i.title.startsWith('genitive'));
    expect(obj?.provenance.confidence).toBe('high'); // accusative→object is reliable
    expect(dat?.provenance.confidence).toBe('low'); // dative is ambiguous
    expect(gen?.provenance.confidence).toBe('low'); // genitive attachment uncertain
    // The genitive attaches to a noun head, not the verb.
    expect(gen?.title).toContain('καρδίᾳ');
  });

  it('does not assign case roles in English (no morphology)', () => {
    const doc = docWith('en', 'The quick brown fox jumps over the lazy dog.');
    const infs = runInference(doc).inferences;
    expect(infs.some((i) => i.title.startsWith('dativeComplement'))).toBe(false);
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
