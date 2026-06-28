import { describe, it, expect } from 'vitest';
import {
  KrDocumentSchema,
  TokenSchema,
  SyntaxModelSchema,
  MorphologySchema,
  ParseInputSchema,
} from '@/domain/schema';
import { createDocument } from '@/domain/model';

describe('schema validation', () => {
  it('accepts a freshly created document', () => {
    const doc = createDocument({ language: 'en', title: 'Test' }, () => '2024-01-01T00:00:00.000Z');
    expect(() => KrDocumentSchema.parse(doc)).not.toThrow();
  });

  it('defaults tokenIds to an empty array', () => {
    const model = SyntaxModelSchema.parse({
      rootId: 'n1',
      nodes: [{ id: 'n1', kind: 'clause' }],
      relations: [],
    });
    expect(model.nodes[0]!.tokenIds).toEqual([]);
  });

  it('rejects unknown morphology fields (strict)', () => {
    expect(() => MorphologySchema.parse({ bogus: 'x' })).toThrow();
  });

  it('accepts partial Greek morphology', () => {
    expect(() =>
      MorphologySchema.parse({ case: 'genitive', gender: 'feminine', number: 'singular' }),
    ).not.toThrow();
  });

  it('rejects an invalid part of speech', () => {
    expect(() => TokenSchema.parse({ id: 't', index: 0, surface: 'x', pos: 'wizard' })).toThrow();
  });

  it('allows parse input without a root id', () => {
    expect(() =>
      ParseInputSchema.parse({
        language: 'grc',
        tokens: [{ id: 't1', index: 0, surface: 'λόγος' }],
      }),
    ).not.toThrow();
  });

  it('preserves polytonic Greek round-trip exactly', () => {
    const surface = 'ἑωράκαμεν';
    const parsed = TokenSchema.parse({ id: 't', index: 0, surface });
    expect(parsed.surface).toBe(surface);
    expect(parsed.surface.normalize('NFC')).toBe(surface.normalize('NFC'));
  });
});
