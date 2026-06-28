import { describe, it, expect } from 'vitest';
import { buildParsePrompt, PARSE_EXAMPLE } from '@/domain/prompt';
import { importJson } from '@/io';

describe('parse prompt builder', () => {
  it('fills in the sentence and language when provided', () => {
    const p = buildParsePrompt({ text: 'The Word became flesh.', language: 'grc' });
    expect(p).toContain('Sentence: The Word became flesh.');
    expect(p).toContain('Language: grc');
    expect(p).not.toContain('{{SENTENCE}}');
  });

  it('produces a reusable template when nothing is provided', () => {
    const p = buildParsePrompt();
    expect(p).toContain('{{SENTENCE}}');
    expect(p).toContain('{{LANGUAGE}}');
  });

  it('lists schema-derived enum values', () => {
    const p = buildParsePrompt();
    expect(p).toContain('predicateNominative');
    expect(p).toContain('nominative');
    expect(p).toContain('prepositionObject');
  });

  it('ships a worked example that actually validates against the schema', () => {
    const result = importJson(JSON.stringify(PARSE_EXAMPLE));
    expect(result.ok).toBe(true);
    // and the example text appears in the rendered prompt
    expect(buildParsePrompt()).toContain('"predicateNominative"');
  });
});
