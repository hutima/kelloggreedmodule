import { describe, it, expect } from 'vitest';
import { exportJson, importJson, buildSvg, slugify } from '@/io';
import { cloneSample } from '@/fixtures';

describe('import / export', () => {
  it('round-trips a document through JSON without loss', () => {
    const doc = cloneSample('doc_sample_1john_1_1')!;
    const json = exportJson(doc);
    const result = importJson(json);
    expect(result.ok).toBe(true);
    expect(result.document).toEqual(doc);
  });

  it('reports a helpful error for invalid JSON', () => {
    const result = importJson('{ not valid');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Invalid JSON/);
  });

  it('reports schema errors with paths', () => {
    const result = importJson(JSON.stringify({ id: 'x', title: 'y' }));
    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  it('stamps a schemaVersion when migrating an older record', () => {
    const doc = cloneSample('doc_sample_fox')!;
    const raw = JSON.parse(exportJson(doc));
    delete raw.schemaVersion;
    const result = importJson(JSON.stringify(raw));
    expect(result.ok).toBe(true);
    expect(result.document!.schemaVersion).toBeGreaterThan(0);
  });

  it('builds an SVG export string', () => {
    const doc = cloneSample('doc_sample_word_flesh')!;
    const svg = buildSvg(doc);
    expect(svg.startsWith('<svg')).toBe(true);
  });

  it('slugifies titles for filenames', () => {
    expect(slugify('The quick brown fox!')).toBe('the-quick-brown-fox');
    expect(slugify('   ')).toBe('diagram');
  });
});
