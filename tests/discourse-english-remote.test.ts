import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useDiscourseStore, useEditorStore } from '@/state';
import { ASV_URL, clearRemoteEnglishCache } from '@/io';
import { leafUnits } from '@/domain/discourse';
import { cloneSample } from '@/fixtures';

/**
 * Phase 2/5 — KJV/ASV in the discourse STORE. Loading a remote English range
 * builds a valid English discourse document, skips Greek marker hints, and never
 * touches the syntax passage. All fetches are mocked (no live network).
 */

function kjvJohnJson() {
  return {
    book: 'John',
    chapters: [
      {
        chapter: '3',
        verses: [
          { verse: '16', text: 'For God so loved the world.' },
          { verse: '17', text: 'For God sent not his Son to condemn the world.' },
          { verse: '18', text: 'He that believeth on him is not condemned.' },
        ],
      },
    ],
  };
}

function stubFetch() {
  const fn = vi.fn(async (url: string) => {
    if (url === ASV_URL) return { ok: true, status: 200, json: async () => ({ translation: 'ASV', books: [] }) } as Response;
    if (url.includes('aruljohn')) return { ok: true, status: 200, json: async () => kjvJohnJson() } as Response;
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => {
  localStorage.clear();
  clearRemoteEnglishCache();
  useDiscourseStore.setState({
    baseDoc: null, doc: null, status: 'idle', error: null, past: [], future: [],
    sourceId: 'english-kjv', bookNum: 43, startRef: '3:16', endRef: '3:18', granularity: 'verse',
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('KJV discourse loading via the store', () => {
  it('loads John 3:16–18 KJV as a valid English discourse document', async () => {
    stubFetch();
    await useDiscourseStore.getState().loadRange();
    const s = useDiscourseStore.getState();
    expect(s.status).toBe('loaded');
    expect(s.doc?.language).toBe('en');
    expect(s.doc?.sourceId).toBe('english-kjv');
    expect(leafUnits(s.doc!).map((u) => u.refStart)).toEqual(['3:16', '3:17', '3:18']);
  });

  it('skips Greek marker hints (no Greek-lemma markers on English text)', async () => {
    stubFetch();
    await useDiscourseStore.getState().loadRange();
    const doc = useDiscourseStore.getState().doc!;
    // Any markers are the conservative ENGLISH heuristic — never Greek particles.
    for (const m of doc.markers) {
      expect(/[Ͱ-Ͽἀ-῿]/.test(m.surface)).toBe(false);
    }
    // No Greek-particle suggestions (γάρ/οὖν/…): those heuristics can't match English.
    expect(doc.suggestions.every((x) => !/[Ͱ-Ͽἀ-῿]/.test(x.label ?? ''))).toBe(true);
  });

  it('does not touch the open syntax passage, and survives a mode switch', async () => {
    stubFetch();
    const john = cloneSample('doc_sample_john_1_1a')!;
    useEditorStore.getState().loadDocument(john, { corpus: 'gnt' });
    const syntaxBefore = useEditorStore.getState().doc;

    await useDiscourseStore.getState().loadRange();
    expect(useEditorStore.getState().doc).toBe(syntaxBefore);

    // Mode switch reloads neither store; the KJV range stays put.
    useEditorStore.getState().setDiagramMode('discourse');
    useEditorStore.getState().setDiagramMode('kellogg-reed');
    expect(useEditorStore.getState().doc).toBe(syntaxBefore);
    expect(useDiscourseStore.getState().doc?.sourceId).toBe('english-kjv');
  });

  it('surfaces a readable error without corrupting state when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response));
    await useDiscourseStore.getState().loadRange();
    const s = useDiscourseStore.getState();
    expect(s.status).toBe('error');
    expect(s.error).toBeTruthy();
    expect(s.doc).toBeNull();
    // Syntax store is untouched by the failed English fetch.
    expect(useEditorStore.getState().doc).toBeTruthy();
  });

  it('supports edit + reset over a KJV discourse document', async () => {
    stubFetch();
    await useDiscourseStore.getState().loadRange();
    const first = leafUnits(useDiscourseStore.getState().doc!)[0]!;
    useDiscourseStore.getState().labelUnit(first.id, 'A');
    expect(useDiscourseStore.getState().doc!.units.find((u) => u.id === first.id)?.label).toBe('A');
    useDiscourseStore.getState().resetEdits();
    expect(useDiscourseStore.getState().doc!.units.find((u) => u.id === first.id)?.label).toBeUndefined();
  });
});
