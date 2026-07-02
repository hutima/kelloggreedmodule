import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { useEditorStore, useDiscourseStore } from '@/state';
import { lowfatToDocuments, sblgntDialect } from '@/io/lowfat';
import { leafUnits } from '@/domain/discourse';
import { cloneSample } from '@/fixtures';

/**
 * PR 2 acceptance — loader/store SEPARATION. The discourse store and the
 * syntax editor store are independent: loading a discourse range never
 * touches the syntax passage, loading a syntax passage never touches the
 * discourse range, and switching the diagram mode reloads neither.
 */

function ephesiansBookDocs() {
  const xml = readFileSync('tests/fixtures-sblgnt-lowfat-eph-5-3-33.xml', 'utf8');
  return lowfatToDocuments(xml, {
    book: 'Ephesians',
    dialect: sblgntDialect,
    docIdPrefix: 'sblgnt',
    sourceId: 'macula-greek-sblgnt-lowfat',
  });
}

function philemonBookDocs() {
  const xml = readFileSync('tests/fixtures-sblgnt-lowfat-philemon.xml', 'utf8');
  return lowfatToDocuments(xml, {
    book: 'Philemon',
    dialect: sblgntDialect,
    docIdPrefix: 'sblgnt',
    sourceId: 'macula-greek-sblgnt-lowfat',
  });
}

describe('discourse store — separation from syntax state', () => {
  beforeEach(() => {
    localStorage.clear();
    useDiscourseStore.setState({
      baseDoc: null,
      doc: null,
      status: 'idle',
      error: null,
      past: [],
      future: [],
      selection: {},
      sourceId: 'macula-greek-sblgnt-lowfat',
      bookNum: 10,
      startRef: '5:3',
      endRef: '5:33',
      granularity: 'sentence',
    });
  });

  it('loads a discourse range without touching the open syntax passage', async () => {
    // 1. Open John 1:1 (the bundled sample) as the syntax passage.
    const john = cloneSample('doc_sample_john_1_1a')!;
    useEditorStore.getState().loadDocument(john, { corpus: 'gnt' });
    const syntaxDocBefore = useEditorStore.getState().doc;
    const syntaxBaseBefore = useEditorStore.getState().baseDoc;

    // 2. Switch to Discourse (mode only — nothing reloads).
    useEditorStore.getState().setDiagramMode('discourse');
    expect(useEditorStore.getState().doc).toBe(syntaxDocBefore);

    // 3. Load Ephesians 5:3–33 as the discourse range.
    await useDiscourseStore.getState().loadRange({ bookDocs: ephesiansBookDocs() });
    const disc = useDiscourseStore.getState();
    expect(disc.status).toBe('loaded');
    expect(disc.doc?.title).toBe('Ephesians 5:3–33');
    expect(leafUnits(disc.doc!).length).toBe(20);

    // 4./5. Switch back to Kellogg-Reed: John 1:1 is still the open passage.
    useEditorStore.getState().setDiagramMode('kellogg-reed');
    expect(useEditorStore.getState().doc).toBe(syntaxDocBefore);
    expect(useEditorStore.getState().baseDoc).toBe(syntaxBaseBefore);

    // 6./7. Switch back to Discourse: the range is still loaded.
    useEditorStore.getState().setDiagramMode('discourse');
    expect(useDiscourseStore.getState().doc?.title).toBe('Ephesians 5:3–33');

    // 8./9./10. Load whole-book Philemon in Discourse; syntax unchanged.
    useDiscourseStore.getState().setBookNum(18);
    useDiscourseStore.getState().setRange('1:1', '1:25');
    await useDiscourseStore.getState().loadRange({ bookDocs: philemonBookDocs() });
    expect(useDiscourseStore.getState().doc?.range.book).toBe('Philemon');
    expect(useEditorStore.getState().doc).toBe(syntaxDocBefore);

    // Loading a new syntax passage must not affect the discourse range.
    const again = cloneSample('doc_sample_john_1_1a')!;
    useEditorStore.getState().loadDocument({ ...again, id: `${again.id}_2` }, { corpus: 'gnt' });
    expect(useDiscourseStore.getState().doc?.range.book).toBe('Philemon');
  });

  it('reports load errors without clobbering the previous document', async () => {
    await useDiscourseStore.getState().loadRange({ bookDocs: ephesiansBookDocs() });
    expect(useDiscourseStore.getState().status).toBe('loaded');
    // A range no sentence overlaps → error, previous doc retained.
    useDiscourseStore.getState().setRange('99:1', '99:5');
    await useDiscourseStore.getState().loadRange({ bookDocs: ephesiansBookDocs() });
    const s = useDiscourseStore.getState();
    expect(s.status).toBe('error');
    expect(s.error).toBeTruthy();
    expect(s.doc?.title).toBe('Ephesians 5:3–33');
  });

  it('persists edits across a reload of the same range (patch round-trip)', async () => {
    await useDiscourseStore.getState().loadRange({ bookDocs: ephesiansBookDocs() });
    const first = leafUnits(useDiscourseStore.getState().doc!)[0]!;
    useDiscourseStore.getState().labelUnit(first.id, 'A');
    expect(
      useDiscourseStore.getState().doc!.units.find((u) => u.id === first.id)?.label,
    ).toBe('A');

    // Simulate a fresh session: clear in-memory docs, reload the range.
    useDiscourseStore.setState({ baseDoc: null, doc: null, status: 'idle', past: [], future: [] });
    await useDiscourseStore.getState().loadRange({ bookDocs: ephesiansBookDocs() });
    expect(
      useDiscourseStore.getState().doc!.units.find((u) => u.id === first.id)?.label,
    ).toBe('A');

    // Reset discourse edits: the label goes; syntax patches are untouched
    // (different namespace entirely).
    useDiscourseStore.getState().resetEdits();
    expect(
      useDiscourseStore.getState().doc!.units.find((u) => u.id === first.id)?.label,
    ).toBeUndefined();
  });

  it('undo/redo work over discourse edits', async () => {
    await useDiscourseStore.getState().loadRange({ bookDocs: ephesiansBookDocs() });
    const first = leafUnits(useDiscourseStore.getState().doc!)[0]!;
    useDiscourseStore.getState().labelUnit(first.id, 'A');
    useDiscourseStore.getState().undo();
    expect(
      useDiscourseStore.getState().doc!.units.find((u) => u.id === first.id)?.label,
    ).toBeUndefined();
    useDiscourseStore.getState().redo();
    expect(
      useDiscourseStore.getState().doc!.units.find((u) => u.id === first.id)?.label,
    ).toBe('A');
  });
});
