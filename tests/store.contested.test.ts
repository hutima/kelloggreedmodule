import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '@/state';
import { loadPatch } from '@/persistence';
import { cloneSample } from '@/fixtures';

const store = useEditorStore;

/**
 * Contested-reading store behaviour: previewing must NEVER persist; adopting a
 * structural alternate MUST persist through the normal user-patch system; a
 * semantic-only alternate is not adoptable; and single-preview is the default
 * (mobile never escalates to side-by-side on its own).
 */
describe('store — contested readings', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
    store.getState().loadDocument(cloneSample('doc_sample_1john_1_1')!, { corpus: 'gnt' });
  });

  it('previewing an alternate sets previewDoc but saves NOTHING', () => {
    const id = store.getState().baseDoc!.id;
    store.getState().previewAlternateReading('alt_1john_1_1_chain');
    const s = store.getState();
    expect(s.previewDoc).not.toBeNull();
    expect(s.previewDoc!.syntax.relations.find((r) => r.id === 'r2')!.headId).toBe('n_rc1');
    expect(s.contested.previewAlternateReadingId).toBe('alt_1john_1_1_chain');
    // single-preview by default (the mobile-safe path)
    expect(s.contested.alternateDisplayMode).toBe('single-preview');
    // nothing persisted; the live doc is still the base
    expect(loadPatch(id)).toBeNull();
    expect(s.doc.syntax.relations.find((r) => r.id === 'r2')!.headId).toBe('n_root');
  });

  it('returning to base clears the preview', () => {
    store.getState().previewAlternateReading('alt_1john_1_1_chain');
    store.getState().returnToBaseReading();
    expect(store.getState().previewDoc).toBeNull();
    expect(store.getState().contested.alternateDisplayMode).toBe('base-only');
  });

  it('adopting a structural alternate persists a patch and edits the live doc', () => {
    const id = store.getState().baseDoc!.id;
    store.getState().adoptContestedReading('alt_1john_1_1_chain');
    const s = store.getState();
    expect(s.doc.syntax.relations.find((r) => r.id === 'r2')!.headId).toBe('n_rc1');
    expect(s.previewDoc).toBeNull();
    const patch = loadPatch(id);
    expect(patch).not.toBeNull();
    expect(patch!.syntaxPatch.relations.upsert.some((r) => r.id === 'r2')).toBe(true);
  });

  it('a semantic-only alternate cannot be adopted (no patch written)', () => {
    const id = store.getState().baseDoc!.id;
    store.getState().adoptContestedReading('alt_phil_3_9_objective');
    expect(loadPatch(id)).toBeNull();
  });

  it('side-by-side keeps the preview document; base-only clears it', () => {
    store.getState().previewAlternateReading('alt_1john_1_1_chain');
    store.getState().setAlternateDisplayMode('side-by-side');
    expect(store.getState().contested.alternateDisplayMode).toBe('side-by-side');
    expect(store.getState().previewDoc).not.toBeNull();
    store.getState().setAlternateDisplayMode('base-only');
    expect(store.getState().previewDoc).toBeNull();
  });

  it('closing the panel hides it but KEEPS an active preview/comparison', () => {
    store.getState().openContestedPanel('iss_1john_1_1_relative_chain');
    expect(store.getState().contested.showAlternateParsePanel).toBe(true);
    store.getState().previewAlternateReading('alt_1john_1_1_chain');
    store.getState().closeContestedPanel();
    const s = store.getState();
    expect(s.contested.showAlternateParsePanel).toBe(false);
    // The preview survives so closing the drawer reveals the full comparison.
    expect(s.previewDoc).not.toBeNull();
    // Return-to-base is the explicit way to clear it.
    store.getState().returnToBaseReading();
    expect(store.getState().previewDoc).toBeNull();
  });

  it('restoreBaseParse discards an adopted custom parse', () => {
    const id = store.getState().baseDoc!.id;
    store.getState().adoptContestedReading('alt_1john_1_1_chain');
    expect(store.getState().doc.syntax.relations.find((r) => r.id === 'r2')!.headId).toBe('n_rc1');
    store.getState().restoreBaseParse();
    expect(store.getState().doc.syntax.relations.find((r) => r.id === 'r2')!.headId).toBe('n_root');
    expect(loadPatch(id)).toBeNull();
  });
});
