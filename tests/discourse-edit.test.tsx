import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { lowfatToDocuments, sblgntDialect } from '@/io/lowfat';
import { useDiscourseStore } from '@/state';
import { childUnits, leafUnits } from '@/domain/discourse';
import { DiscourseView } from '@/ui/discourse/DiscourseView';
import { DiscourseToolbar } from '@/ui/discourse/DiscourseToolbar';

/**
 * PR 4 acceptance — Discourse EDIT mode: breaks, merges, indentation, labels,
 * custom parents, relations, persistence, and reset — all against the
 * DiscourseDocument and its own patches, never syntax.
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

const store = useDiscourseStore;

async function loadEphesians() {
  store.setState({
    sourceId: 'macula-greek-sblgnt-lowfat',
    bookNum: 10,
    startRef: '5:3',
    endRef: '5:33',
    granularity: 'sentence',
    baseDoc: null,
    doc: null,
    status: 'idle',
    past: [],
    future: [],
    selection: {},
    pendingRelationSource: null,
    relationDraft: null,
    splitPickUnitId: null,
    multiSelectedUnitIds: [],
  });
  await store.getState().loadRange({ bookDocs: ephesiansBookDocs() });
}

describe('discourse edit mode (store walk-through)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await loadEphesians();
  });

  it('walks the full acceptance path: break, merge, indent, outdent, chiasm labels, persist, reset', async () => {
    // Guard rails: unrelated user data that must survive discourse edits/reset.
    localStorage.setItem('kr:patch:some_passage', '{"fake":"syntax patch"}');
    localStorage.setItem('kr:sermon:some_passage', '{"fake":"sermon"}');

    const s = () => store.getState();
    const doc = () => s().doc!;
    const leaves = () => leafUnits(doc());
    const startCount = leaves().length;

    // Insert a break inside a unit (word-level split point).
    const target = leaves().find((u) => u.tokenIds.length > 6)!;
    s().splitUnit(target.id, target.tokenIds[4]!);
    expect(leaves().length).toBe(startCount + 1);

    // Merge the two halves back together.
    const second = doc().units.find((u) => u.id === `du_s_${target.tokenIds[4]}`)!;
    s().mergeUnits(target.id, second.id);
    expect(leaves().length).toBe(startCount);

    // Indent a unit under the preceding unit, then outdent it again.
    const b = leaves()[1]!;
    s().indentUnit(b.id);
    expect(doc().units.find((u) => u.id === b.id)!.depth).toBe(1);
    s().outdentUnit(b.id);
    expect(doc().units.find((u) => u.id === b.id)!.depth).toBe(0);

    // Label units A, B, C … C′, B′, A′ and pair A ↔ A′ as a chiasm.
    const names = ['A', 'B', 'C', 'C′', 'B′', 'A′'];
    const ids = [0, 1, 2, startCount - 3, startCount - 2, startCount - 1].map((i) => leaves()[i]!.id);
    names.forEach((n, i) => s().labelUnit(ids[i]!, n));
    expect(doc().units.find((u) => u.id === ids[0])!.label).toBe('A');
    expect(doc().units.find((u) => u.id === ids[5])!.label).toBe('A′');
    s().addRelation({ sourceUnitId: ids[0]!, targetUnitId: ids[5]!, type: 'chiasm', label: 'A ↔ A′' });
    const rel = doc().relations.find((r) => r.type === 'chiasm')!;
    expect(rel.label).toBe('A ↔ A′');
    expect(rel.provenance.source).toBe('manual');

    // Wrap adjacent units in a custom parent ("Household code") and unwrap it.
    s().select({ unitId: ids[1]! });
    s().extendMultiSelect(ids[2]!);
    expect(s().multiSelectedUnitIds).toEqual([ids[1], ids[2]]);
    s().wrapUnits(s().multiSelectedUnitIds, { label: 'Household code' });
    const wrapper = doc().units.find((u) => u.label === 'Household code')!;
    expect(childUnits(doc(), wrapper.id).map((u) => u.id)).toEqual([ids[1], ids[2]]);
    s().unwrapUnit(wrapper.id);
    expect(doc().units.some((u) => u.id === wrapper.id)).toBe(false);

    // "Reload": drop in-memory docs, reload the same range → edits persist.
    store.setState({ baseDoc: null, doc: null, status: 'idle', past: [], future: [] });
    await store.getState().loadRange({ bookDocs: ephesiansBookDocs() });
    expect(doc().units.find((u) => u.id === ids[0])!.label).toBe('A');
    expect(doc().relations.some((r) => r.type === 'chiasm')).toBe(true);

    // Reset discourse edits: labels/relations go, OTHER user data stays.
    s().resetEdits();
    expect(doc().units.find((u) => u.id === ids[0])!.label).toBeUndefined();
    expect(doc().relations).toEqual([]);
    expect(localStorage.getItem('kr:patch:some_passage')).toBe('{"fake":"syntax patch"}');
    expect(localStorage.getItem('kr:sermon:some_passage')).toBe('{"fake":"sermon"}');
    expect(localStorage.getItem(`kr:discourse:${doc().id}`)).toBeNull();
  });

  it('relation flow: pick source, pick target, choose type', () => {
    const s = () => store.getState();
    const [a, b] = leafUnits(s().doc!);
    s().startRelation(a!.id);
    expect(s().pendingRelationSource).toBe(a!.id);
    s().setRelationDraft({ sourceUnitId: a!.id, targetUnitId: b!.id });
    expect(s().pendingRelationSource).toBeNull();
    s().addRelation({ sourceUnitId: a!.id, targetUnitId: b!.id, type: 'ground' });
    expect(s().pendingRelationSource).toBeNull();
    expect(s().doc!.relations).toHaveLength(1);
    s().updateRelation(s().doc!.relations[0]!.id, { type: 'inference', confidence: 'medium' });
    expect(s().doc!.relations[0]!.type).toBe('inference');
    s().deleteRelation(s().doc!.relations[0]!.id);
    expect(s().doc!.relations).toHaveLength(0);
  });

  it('multi-selection only extends across contiguous siblings', () => {
    const s = () => store.getState();
    const leaves = leafUnits(s().doc!);
    s().select({ unitId: leaves[0]!.id });
    s().extendMultiSelect(leaves[3]!.id);
    expect(s().multiSelectedUnitIds).toEqual(leaves.slice(0, 4).map((u) => u.id));
    // Indent one of them so parents differ; extending across parents is refused.
    s().indentUnit(leaves[1]!.id);
    s().select({ unitId: leaves[0]!.id });
    s().extendMultiSelect(leaves[1]!.id);
    expect(s().multiSelectedUnitIds).toEqual([leaves[0]!.id]);
  });
});

describe('discourse edit mode (UI)', () => {
  afterEach(cleanup);
  beforeEach(async () => {
    localStorage.clear();
    await loadEphesians();
  });

  it('toolbar buttons cover every keyboard shortcut and reflect the selection', () => {
    const s = store.getState();
    const first = leafUnits(s.doc!)[0]!;
    store.setState({ selection: { unitId: first.id }, multiSelectedUnitIds: [first.id] });
    const { getByTitle, getByText } = render(createElement(DiscourseToolbar));
    expect(getByText('Split')).toBeTruthy();
    expect(getByText('Merge ←')).toBeTruthy();
    expect(getByText('→ Indent')).toBeTruthy();
    expect(getByText('← Outdent')).toBeTruthy();
    expect(getByText('Group')).toBeTruthy();
    expect(getByText('Label…')).toBeTruthy();
    expect(getByText('Relate →')).toBeTruthy();
    expect(getByText('↶ Undo')).toBeTruthy();
    expect(getByText('↷ Redo')).toBeTruthy();
    // The first unit has no previous sibling: indent + merge are disabled.
    expect((getByText('→ Indent') as HTMLButtonElement).disabled).toBe(true);
    expect((getByText('Merge ←') as HTMLButtonElement).disabled).toBe(true);
    expect(getByTitle(/Discard all discourse edits/i)).toBeTruthy();
  });

  it('Tab indents and Shift+Tab outdents the selected unit', () => {
    const s = store.getState();
    const second = leafUnits(s.doc!)[1]!;
    store.setState({ selection: { unitId: second.id } });
    const { container, rerender } = render(
      createElement(DiscourseView, { doc: store.getState().doc!, editing: true }),
    );
    const view = container.querySelector('.discourse-view')!;
    fireEvent.keyDown(view, { key: 'Tab' });
    expect(store.getState().doc!.units.find((u) => u.id === second.id)!.depth).toBe(1);
    // The canvas re-renders with the updated doc in the app; mirror that here.
    rerender(createElement(DiscourseView, { doc: store.getState().doc!, editing: true }));
    fireEvent.keyDown(view, { key: 'Tab', shiftKey: true });
    expect(store.getState().doc!.units.find((u) => u.id === second.id)!.depth).toBe(0);
  });

  it('Enter begins split-picking and clicking a word splits the unit', () => {
    const doc0 = store.getState().doc!;
    const unit = leafUnits(doc0).find((u) => u.tokenIds.length > 5)!;
    store.setState({ selection: { unitId: unit.id } });
    const { container } = render(
      createElement(DiscourseView, { doc: doc0, editing: true }),
    );
    const view = container.querySelector('.discourse-view')!;
    fireEvent.keyDown(view, { key: 'Enter' });
    expect(store.getState().splitPickUnitId).toBe(unit.id);
    // Re-render with the same doc: split words appear.
    cleanup();
    const { container: c2 } = render(
      createElement(DiscourseView, { doc: store.getState().doc!, editing: true }),
    );
    const words = c2.querySelectorAll('.discourse-split-word');
    expect(words.length).toBe(unit.tokenIds.length);
    fireEvent.click(words[3]!);
    const after = store.getState().doc!;
    expect(after.units.some((u) => u.id === `du_s_${unit.tokenIds[3]}`)).toBe(true);
    expect(store.getState().splitPickUnitId).toBeNull();
  });

  it('clicking a target while relating stages the relation draft (type picker)', () => {
    const doc0 = store.getState().doc!;
    const [a, b] = leafUnits(doc0);
    store.setState({ pendingRelationSource: a!.id });
    const { container } = render(createElement(DiscourseView, { doc: doc0, editing: true }));
    const targetEl = container.querySelector(`[data-unit-id="${b!.id}"]`)!;
    fireEvent.click(targetEl);
    expect(store.getState().relationDraft).toEqual({ sourceUnitId: a!.id, targetUnitId: b!.id });
    // The picker is visible; choosing a type creates the manual relation.
    cleanup();
    const { getByText } = render(createElement(DiscourseView, { doc: store.getState().doc!, editing: true }));
    fireEvent.click(getByText('ground'));
    expect(store.getState().doc!.relations).toHaveLength(1);
    expect(store.getState().doc!.relations[0]!.type).toBe('ground');
    expect(store.getState().relationDraft).toBeNull();
  });
});
