import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveCustomParse,
  listCustomParses,
  getCustomParse,
  deleteCustomParse,
} from '@/persistence';
import { createDocument } from '@/domain/model';

/**
 * The saved custom-parse store (the "my sentences" list behind the New tab):
 * an explicit, curated list kept apart from the autosave session cache.
 */
function customDoc(title: string) {
  return { ...createDocument({ language: 'en', title, text: `${title} text` }) };
}

describe('saved custom parses', () => {
  beforeEach(async () => {
    for (const c of await listCustomParses()) await deleteCustomParse(c.id);
  });

  it('round-trips save → list → get → delete', async () => {
    const doc = customDoc('My sentence');
    await saveCustomParse(doc);

    const list = await listCustomParses();
    expect(list.map((c) => c.id)).toContain(doc.id);
    expect(list.find((c) => c.id === doc.id)!.title).toBe('My sentence');

    const got = await getCustomParse(doc.id);
    expect(got?.id).toBe(doc.id);

    await deleteCustomParse(doc.id);
    expect((await listCustomParses()).map((c) => c.id)).not.toContain(doc.id);
  });

  it('lists most-recently-updated first', async () => {
    const a = { ...customDoc('A'), updatedAt: '2024-01-01T00:00:00.000Z' };
    const b = { ...customDoc('B'), updatedAt: '2024-06-01T00:00:00.000Z' };
    await saveCustomParse(a);
    await saveCustomParse(b);
    const list = await listCustomParses();
    expect(list[0]!.id).toBe(b.id); // newer first
  });
});
