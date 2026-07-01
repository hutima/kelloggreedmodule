import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEditorStore } from '@/state';
import { applyStoredPatch, loadPatch } from '@/persistence';
import { createDocument } from '@/domain/model';
import type { KrDocument, Token } from '@/domain/schema';

const store = useEditorStore;

/**
 * The baseHash guard on the normal load path: a stored patch was authored
 * against a specific base (fingerprinted by `patch.base.baseHash`). When the
 * base itself changes under the same id — e.g. a combined passage's base shifts
 * whenever an included sentence's own patch changes — the stale patch must be
 * SKIPPED (never applied to the wrong base, never deleted).
 */

const tok = (id: string, index: number, surface: string): Token => ({
  id,
  index,
  surface,
  language: 'en',
});

/** A base with a FIXED id so a "same id, different content" successor exists. */
function baseA(): KrDocument {
  const d = createDocument({
    language: 'en',
    title: 'Guard test',
    text: 'The Word became flesh.',
  });
  return {
    ...d,
    id: 'doc_patch_guard',
    tokens: [tok('t1', 0, 'The'), tok('t2', 1, 'Word'), tok('t3', 2, 'became'), tok('t4', 3, 'flesh.')],
  };
}

describe('baseHash-guarded patch application', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('skips (but keeps) a patch saved against base A when loading a modified base A′', () => {
    const A = baseA();
    store.getState().loadDocument(A, { corpus: 'custom' });
    // A user edit persists as a patch against A (stamped with A's hash).
    store.getState().upsertNode({ id: 'n_extra', kind: 'word', tokenIds: [] });
    const patch = loadPatch(A.id);
    expect(patch).not.toBeNull();
    expect(patch!.base.baseHash).toBeTruthy();

    // A′ — the SAME id but different content, so the fingerprint no longer matches.
    const A2: KrDocument = {
      ...A,
      tokens: A.tokens.map((t) => (t.id === 't2' ? { ...t, surface: 'Logos' } : t)),
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    store.getState().loadDocument(A2, { corpus: 'custom' });
    // The stale patch is NOT applied to the new base…
    expect(store.getState().doc.syntax.nodes.some((n) => n.id === 'n_extra')).toBe(false);
    expect(store.getState().doc.tokens.find((t) => t.id === 't2')!.surface).toBe('Logos');
    // …but the user's edits stay in storage, and the skip is surfaced.
    expect(loadPatch(A.id)).not.toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();

    // Loading the ORIGINAL base still reconstructs the edits.
    store.getState().loadDocument(A, { corpus: 'custom' });
    expect(store.getState().doc.syntax.nodes.some((n) => n.id === 'n_extra')).toBe(true);
  });

  it('loadDocument drops the previous book’s prev/next reading context', () => {
    // The nav strip renders whenever gntIndex >= 0; opening an unrelated document
    // must not leave it pointing into the previously loaded book. Callers that
    // open FROM a book (the pickers, search) re-set the context after loading.
    const A = baseA();
    store.getState().setGntContext([A], 0);
    expect(store.getState().gntIndex).toBe(0);
    store.getState().loadDocument(baseA(), { corpus: 'custom' });
    expect(store.getState().gntPassages).toHaveLength(0);
    expect(store.getState().gntIndex).toBe(-1);
  });

  it('applyStoredPatch applies a matching patch and passes through when none is stored', () => {
    const A = baseA();
    expect(applyStoredPatch(A)).toBe(A); // no patch stored → the base itself
    store.getState().loadDocument(A, { corpus: 'custom' });
    store.getState().upsertNode({ id: 'n_extra', kind: 'word', tokenIds: [] });
    const live = applyStoredPatch(A);
    expect(live.syntax.nodes.some((n) => n.id === 'n_extra')).toBe(true);
  });
});
