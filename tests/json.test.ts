import { describe, it, expect } from 'vitest';
import { importJson, exportJson } from '@/io';
import { PARSE_EXAMPLE } from '@/domain/prompt';

/**
 * JSON import is the paste-from-a-chat-model path, so it must accept output that
 * is valid apart from the cosmetic quoting LLMs and word processors introduce.
 */
describe('importJson', () => {
  const valid = exportJson(PARSE_EXAMPLE as never);

  it('imports clean JSON', () => {
    expect(importJson(valid).ok).toBe(true);
  });

  it('tolerates smart/curly quotes from a chat-model paste', () => {
    const smart = valid.replace(/"/g, '”'); // every quote becomes a curly one
    const res = importJson(smart);
    expect(res.ok).toBe(true);
    expect(res.document?.id).toBe('doc_paste');
  });

  it('tolerates a ```json code fence wrapper', () => {
    const fenced = '```json\n' + valid + '\n```';
    expect(importJson(fenced).ok).toBe(true);
  });

  it('still reports genuinely malformed JSON', () => {
    expect(importJson('{ not json').ok).toBe(false);
  });
});
