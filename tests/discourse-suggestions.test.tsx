import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { lowfatToDocuments, sblgntDialect } from '@/io/lowfat';
import { useDiscourseStore, useEditorStore } from '@/state';
import {
  acceptDiscourseSuggestion,
  applyDiscoursePatch,
  buildDiscourseDocumentFromRange,
  diffDiscourseDocuments,
  leafUnits,
  rejectDiscourseSuggestion,
} from '@/domain/discourse';
import { DiscourseSuggestions } from '@/ui/discourse/DiscourseSuggestions';

/**
 * PR 5 acceptance — marker-driven suggestions: non-authoritative, harmless
 * when wrong, and only ever applied through an explicit accept.
 */

const NOW = '2026-01-01T00:00:00.000Z';

function ephesiansBookDocs() {
  const xml = readFileSync('tests/fixtures-sblgnt-lowfat-eph-5-3-33.xml', 'utf8');
  return lowfatToDocuments(xml, {
    book: 'Ephesians',
    dialect: sblgntDialect,
    docIdPrefix: 'sblgnt',
    sourceId: 'macula-greek-sblgnt-lowfat',
  });
}

const ephesians = () =>
  buildDiscourseDocumentFromRange(ephesiansBookDocs(), {
    sourceId: 'macula-greek-sblgnt-lowfat',
    editionId: 'sblgnt',
    book: 'Ephesians',
    startRef: '5:3',
    endRef: '5:33',
    now: NOW,
  });

describe('suggestion heuristics (Eph 5:3–33)', () => {
  it('surfaces γάρ grounds, contrasts, repeated lemmas — hint language only', () => {
    const doc = ephesians();
    const types = new Set(doc.suggestions.map((s) => s.type));
    expect(types.has('possibleGround')).toBe(true);
    expect(types.has('possibleContrast')).toBe(true);
    expect(types.has('repeatedLemma')).toBe(true);
    for (const s of doc.suggestions) {
      expect(['low', 'medium']).toContain(s.confidence);
      // The language stays hedged: no suggestion claims detection.
      expect(s.explanation.toLowerCase()).not.toContain('detected');
    }
  });

  it('proposes command→γάρ ground where an imperative precedes a γάρ unit', () => {
    const doc = ephesians();
    // Eph 5:5 "ἴστε γινώσκοντες …" follows imperatives; the fixture range has
    // several imperative+γάρ seams — at least one must surface.
    const cmd = doc.suggestions.filter((s) => s.id.startsWith('ds_cmdground_'));
    expect(cmd.length).toBeGreaterThan(0);
    expect(cmd[0]!.label).toBe('command → γάρ');
  });

  it('suggests break points at verse seams with transition particles', () => {
    const doc = ephesians();
    const breaks = doc.suggestions.filter((s) => s.type === 'possibleBreak');
    expect(breaks.length).toBeGreaterThan(0);
    for (const b of breaks) {
      expect(b.unitIds).toHaveLength(1);
      expect(b.tokenIds?.length).toBe(1);
    }
  });

  it('accepting a possibleBreak splits the unit at the suggested token', () => {
    const doc = ephesians();
    const b = doc.suggestions.find((s) => s.type === 'possibleBreak')!;
    const before = leafUnits(doc).length;
    const after = acceptDiscourseSuggestion(doc, b.id, NOW);
    expect(leafUnits(after).length).toBe(before + 1);
    expect(after.units.some((u) => u.id === `du_s_${b.tokenIds![0]}`)).toBe(true);
    // A stale break (unit already re-cut) is harmless: accept flags it, splits nothing.
    const merged = { ...doc, units: doc.units.filter((u) => u.id !== b.unitIds[0]) };
    const stale = acceptDiscourseSuggestion(merged, b.id, NOW);
    expect(leafUnits(stale).length).toBe(leafUnits(merged).length);
  });

  it('dismissals persist through the patch and survive a rebuild', () => {
    const base = ephesians();
    const victim = base.suggestions[0]!;
    const live = rejectDiscourseSuggestion(base, victim.id, NOW);
    const patch = diffDiscourseDocuments(base, live, NOW);
    expect(patch.dismissedSuggestionIds).toEqual([victim.id]);
    const rebuilt = applyDiscoursePatch(ephesians(), patch);
    expect(rebuilt.suggestions.some((s) => s.id === victim.id)).toBe(false);
  });
});

describe('DiscourseSuggestions panel', () => {
  afterEach(cleanup);
  beforeEach(async () => {
    localStorage.clear();
    useEditorStore.setState({ appMode: 'edit' });
    useDiscourseStore.setState({
      baseDoc: null,
      doc: null,
      status: 'idle',
      past: [],
      future: [],
      selection: {},
      suggestionsOpen: true,
      sourceId: 'macula-greek-sblgnt-lowfat',
      bookNum: 10,
      startRef: '5:3',
      endRef: '5:33',
      granularity: 'sentence',
    });
    await useDiscourseStore.getState().loadRange({ bookDocs: ephesiansBookDocs() });
  });

  it('lists hints with hedged language and provenance', () => {
    const { container } = render(createElement(DiscourseSuggestions));
    expect(container.textContent).toContain('clues, not');
    expect(container.textContent).toContain('possible');
    expect(container.textContent).toContain('source-derived hint');
    expect(container.textContent).not.toContain('detected');
  });

  it('accepting a relation hint creates an editable relation; nothing silent', () => {
    const before = useDiscourseStore.getState().doc!;
    expect(before.relations).toHaveLength(0); // nothing pre-committed
    const { getAllByText } = render(createElement(DiscourseSuggestions));
    fireEvent.click(getAllByText('Accept')[0]!);
    const after = useDiscourseStore.getState().doc!;
    const acceptedCount = after.suggestions.filter((s) => s.accepted).length;
    expect(acceptedCount).toBe(1);
    // The accepted hint materialized as exactly one editable manual edit
    // (a relation or a split), and every OTHER hint stayed uncommitted.
    expect(after.relations.length + (leafUnits(after).length - leafUnits(before).length)).toBe(1);
  });

  it('dismissing a hint removes it without touching structure', () => {
    const before = useDiscourseStore.getState().doc!;
    const { getAllByText } = render(createElement(DiscourseSuggestions));
    fireEvent.click(getAllByText('Dismiss')[0]!);
    const after = useDiscourseStore.getState().doc!;
    expect(after.suggestions.length).toBe(before.suggestions.length - 1);
    expect(after.relations).toEqual(before.relations);
    expect(after.units).toEqual(before.units);
  });

  it('is read-only outside Edit mode', () => {
    useEditorStore.setState({ appMode: 'explore' });
    const { queryByText, container } = render(createElement(DiscourseSuggestions));
    expect(queryByText('Accept')).toBeNull();
    expect(container.textContent).toContain('Switch to Edit mode');
  });
});
