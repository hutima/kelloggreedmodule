import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '@/state';
import { loadPatch, loadUserVariants } from '@/persistence';
import { getIssuesForPassage, getAlternateReadings, userIssueId } from '@/domain/contested';
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

describe('store — imported variant readings', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
    store.getState().loadDocument(cloneSample('doc_sample_fox')!, { corpus: 'custom' });
  });

  it('attaches an imported parse as a variant, persists it, and surfaces it in the dropdown', () => {
    const base = store.getState().doc;
    // A distinguishable "variant" parse (a full standalone doc).
    const variantDoc = { ...cloneSample('doc_sample_fox')!, id: 'doc_variant_x', title: 'Alt reading' };
    store.getState().importAsVariants([
      { label: 'Fronted adverb reading', impact: 'Reads “quickly” with the verb, not the fox.', doc: variantDoc },
    ]);

    // The synthesized issue + reading now show up via the normal accessors.
    const issues = getIssuesForPassage(base);
    expect(issues.some((i) => i.id === userIssueId(base.id))).toBe(true);
    const readings = getAlternateReadings(userIssueId(base.id));
    expect(readings).toHaveLength(1);
    expect(readings[0]!.label).toBe('Fronted adverb reading');
    expect(readings[0]!.fullDoc?.id).toBe('doc_variant_x');

    // Persisted for next load.
    const stored = loadUserVariants(base.id);
    expect(stored?.readings).toHaveLength(1);

    // The panel focuses the imported-variants issue.
    expect(store.getState().contested.selectedContestedIssueId).toBe(userIssueId(base.id));
  });

  it('previewing an imported variant shows its FULL doc, saving nothing', () => {
    const base = store.getState().doc;
    const variantDoc = { ...cloneSample('doc_sample_fox')!, id: 'doc_variant_y', title: 'Alt' };
    store.getState().importAsVariants([{ label: 'Alt', doc: variantDoc }]);
    const readingId = getAlternateReadings(userIssueId(base.id))[0]!.id;

    store.getState().previewAlternateReading(readingId);
    const s = store.getState();
    expect(s.previewDoc?.id).toBe('doc_variant_y'); // the full variant doc, verbatim
    expect(loadPatch(base.id)).toBeNull(); // preview never persists a patch
  });

  it('re-registers stored variants when the passage is reloaded', () => {
    const base = store.getState().doc;
    const variantDoc = { ...cloneSample('doc_sample_fox')!, id: 'doc_variant_z', title: 'Alt' };
    store.getState().importAsVariants([{ label: 'Alt', doc: variantDoc }]);
    // Navigate away and back: the overlay must be restored from storage.
    store.getState().loadDocument(cloneSample('doc_sample_word_flesh')!, { corpus: 'custom' });
    expect(getIssuesForPassage(store.getState().doc).some((i) => i.id === userIssueId(base.id))).toBe(false);
    store.getState().loadDocument(cloneSample('doc_sample_fox')!, { corpus: 'custom' });
    expect(getAlternateReadings(userIssueId(base.id))).toHaveLength(1);
  });
});
