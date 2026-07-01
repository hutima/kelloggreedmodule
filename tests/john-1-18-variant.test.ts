import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEditorStore } from '@/state';
import { importLlmDiagram, LLM_DIAGRAM_KIND } from '@/io';
import { alignedDiff, getAlternateReadings, userIssueId } from '@/domain/contested';
import { listCustomParses, loadUserVariants } from '@/persistence';
import type { KrDocument } from '@/domain/schema';

const store = useEditorStore;

/**
 * John 1:18 — the Christological textual variant μονογενὴς θεός ("the only God")
 * vs μονογενὴς υἱός ("the only Son"). This exercises the full variant flow the way
 * the user described: the loaded sentence stays the BASE, the other wording is a
 * variant reading, and the difference analysis shows one word removed (θεός) and
 * one added (υἱός) — a substitution over the shared μονογενὴς … ἐξηγήσατο.
 */

/** Build a compact John 1:18 clause with `head` as the predicate-noun word. */
function j118(head: 'θεὸς' | 'υἱὸς'): KrDocument {
  const reply = {
    kind: LLM_DIAGRAM_KIND,
    language: 'grc',
    text: `ὁ μονογενὴς ${head} ἐκεῖνος ἐξηγήσατο`,
    tokens: [
      { id: 't0', surface: 'ὁ', pos: 'article' },
      { id: 't1', surface: 'μονογενὴς', pos: 'adjective' },
      { id: 't2', surface: head, pos: 'noun' },
      { id: 't3', surface: 'ἐκεῖνος', pos: 'pronoun' },
      { id: 't4', surface: 'ἐξηγήσατο', pos: 'verb' },
    ],
    nodes: [
      { id: 'c0', kind: 'clause', clauseType: 'independent' },
      { id: 'ns', kind: 'word', role: 'subject', tokens: ['t2'] },
      { id: 'nd', kind: 'word', role: 'determiner', tokens: ['t0'] },
      { id: 'na', kind: 'word', role: 'adjectival', tokens: ['t1'] },
      { id: 'nap', kind: 'word', role: 'apposition', tokens: ['t3'] },
      { id: 'nv', kind: 'word', role: 'predicate', tokens: ['t4'] },
    ],
    relations: [
      { type: 'subject', head: 'c0', dependent: 'ns' },
      { type: 'determiner', head: 'ns', dependent: 'nd' },
      { type: 'adjectival', head: 'ns', dependent: 'na' },
      { type: 'apposition', head: 'ns', dependent: 'nap' },
      { type: 'predicate', head: 'c0', dependent: 'nv' },
    ],
    rootId: 'c0',
  };
  const res = importLlmDiagram(JSON.stringify(reply), { title: `John 1:18 (${head})` });
  if (!res.ok || !res.document) throw new Error(res.error);
  return res.document;
}

describe('John 1:18 variant reading (θεός vs υἱός)', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
    // The loaded sentence — "the only GOD" — is the base.
    store.getState().loadDocument(j118('θεὸς'), { corpus: 'custom' });
  });

  it('with LLM diff words, flags EXACTLY the substitution θεός → υἱός (the default path)', () => {
    // The recommended flow: the model tags the differing words, so the app
    // highlights precisely the one word removed and the one added — nothing else.
    const base = store.getState().doc;
    const variant = j118('υἱὸς');
    const { diff, matched } = alignedDiff(base, variant, ['θεός', 'υἱός']);
    expect(matched).toBe(true);

    const baseGod = base.tokens.find((t) => t.surface === 'θεὸς')!.id;
    const varSon = variant.tokens.find((t) => t.surface === 'υἱὸς')!.id;
    expect(diff.changedTokenIds).toContain(baseGod); // removed
    expect(diff.changedTokenIds).toContain(varSon); // added
    // The shared words stay put — only the substitution is flagged.
    const shared = ['ὁ', 'μονογενὴς', 'ἐκεῖνος', 'ἐξηγήσατο'].map(
      (s) => base.tokens.find((t) => t.surface === s)!.id,
    );
    for (const id of shared) expect(diff.changedTokenIds).not.toContain(id);
  });

  it('app-fallback detection still flags the removed/added words (and leaves the verb)', () => {
    // Without LLM diff words, the app aligns lexemes: θεός is present only in the
    // base and υἱός only in the variant, so both are flagged as an insert/delete.
    const base = store.getState().doc;
    const variant = j118('υἱὸς');
    const { diff, matched } = alignedDiff(base, variant);
    expect(matched).toBe(true);

    expect(diff.changedTokenIds).toContain(base.tokens.find((t) => t.surface === 'θεὸς')!.id);
    expect(diff.changedTokenIds).toContain(variant.tokens.find((t) => t.surface === 'υἱὸς')!.id);
    // The predicate verb attaches to the clause, not the substituted noun, so it is
    // untouched — the change stays local to the subject phrase.
    expect(diff.changedTokenIds).not.toContain(base.tokens.find((t) => t.surface === 'ἐξηγήσατο')!.id);
  });

  it('keeps the loaded sentence as base and attaches the other wording as a reading', () => {
    const base = store.getState().doc;
    const variant = j118('υἱὸς');
    store.getState().importAsVariants(
      [{ label: 'μονογενὴς υἱός ("the only Son")', impact: 'Reads “Son” for “God”.', doc: variant }],
      { targetDoc: base },
    );

    // Base is untouched — still "the only God".
    expect(store.getState().doc.id).toBe(base.id);
    expect(store.getState().doc.tokens.some((t) => t.surface === 'θεὸς')).toBe(true);

    // The variant is a reading of this passage.
    const readings = getAlternateReadings(userIssueId(base.id));
    expect(readings).toHaveLength(1);
    expect(readings[0]!.label).toMatch(/only Son/);
    expect(readings[0]!.fullDoc?.tokens.some((t) => t.surface === 'υἱὸς')).toBe(true);
  });

  it('previews the variant without persisting, then deletes it cleanly', () => {
    const base = store.getState().doc;
    store.getState().importAsVariants([{ label: 'only Son', doc: j118('υἱὸς') }], { targetDoc: base });
    const readingId = getAlternateReadings(userIssueId(base.id))[0]!.id;

    // Preview → shows the υἱός parse, saves no patch.
    store.getState().previewAlternateReading(readingId);
    expect(store.getState().previewDoc?.tokens.some((t) => t.surface === 'υἱὸς')).toBe(true);
    expect(loadUserVariants(base.id)?.readings).toHaveLength(1); // stored as a reading, not a base edit

    // Delete → the reading and its issue are gone, and the preview returns to base.
    store.getState().deleteImportedVariant(readingId);
    expect(getAlternateReadings(userIssueId(base.id))).toHaveLength(0);
    expect(loadUserVariants(base.id)).toBeNull();
    expect(store.getState().previewDoc).toBeNull();
  });

  it('can be saved as a standalone sentence that owns its variant reading', () => {
    const base = store.getState().doc;
    store.getState().importAsVariants([{ label: 'only Son', doc: j118('υἱὸς') }], { targetDoc: base });
    // Save the base + its readings as one custom sentence (in place: a custom
    // sentence keeps its id, so the readings keyed by it stay attached).
    store.getState().saveWithVariants();
    const savedId = store.getState().doc.id;
    expect(getAlternateReadings(userIssueId(savedId)).some((r) => r.label === 'only Son')).toBe(true);
    expect(loadUserVariants(savedId)?.readings).toHaveLength(1);
  });

  it('saves a REOPENED custom sentence in place — one "My sentences" entry, same id', async () => {
    // `loadDocument` (the reopen path) sets `baseDoc` to the custom doc itself,
    // so `baseDoc === null` cannot discriminate custom from source passages;
    // saving must still update the SAME entry rather than fork a copy.
    const base = store.getState().doc;
    expect(store.getState().baseDoc?.id).toBe(base.id); // the reopened state
    store.getState().importAsVariants([{ label: 'only Son', doc: j118('υἱὸς') }], { targetDoc: base });

    store.getState().saveWithVariants();
    expect(store.getState().doc.id).toBe(base.id); // id kept → readings stay attached
    store.getState().saveWithVariants(); // saving again must not fork either
    await vi.waitFor(async () => {
      const list = await listCustomParses();
      expect(list.filter((c) => c.id === base.id)).toHaveLength(1);
    });
    expect(loadUserVariants(base.id)?.readings).toHaveLength(1);
  });

  it('preserves diff words when a SOURCE passage is saved with its variants', () => {
    // A source (GNT-corpus) passage is copied to a new custom sentence and its
    // readings re-keyed; the LLM-supplied diff words must survive the re-key or
    // the saved sentence loses its precise difference highlighting.
    const base = j118('θεὸς');
    store.getState().loadDocument(base, { corpus: 'gnt' });
    store.getState().importAsVariants([
      { label: 'only Son', impact: 'Reads “Son” for “God”.', diffWords: ['θεός', 'υἱός'], doc: j118('υἱὸς') },
    ]);
    store.getState().saveWithVariants();
    const savedId = store.getState().doc.id;
    expect(savedId).not.toBe(base.id); // copied, not hijacking the source id
    const saved = loadUserVariants(savedId)?.readings[0];
    expect(saved?.diffWords).toEqual(['θεός', 'υἱός']);
    expect(saved?.impact).toBe('Reads “Son” for “God”.');
  });
});
