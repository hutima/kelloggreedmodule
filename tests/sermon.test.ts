import { describe, it, expect } from 'vitest';
import {
  addNote,
  updateNote,
  removeNote,
  addHighlight,
  toggleHighlight,
  removeHighlight,
  addObservation,
  setBigIdea,
  addOutlineSection,
  updateOutlineSection,
  removeOutlineSection,
} from '@/domain/sermon';
import { emptySermonPrep, isEmptySermonPrep } from '@/domain/schema';
import { relationHighlightColors, nodeHighlightColors, highlightColor } from '@/ui/sermon/highlights';

const NOW = '2024-01-01T00:00:00.000Z';
const LATER = '2024-01-02T00:00:00.000Z';

describe('sermon prep mutations', () => {
  it('starts empty', () => {
    const s = emptySermonPrep('p1', NOW);
    expect(isEmptySermonPrep(s)).toBe(true);
  });

  it('adds, updates, and removes a note (with anchor)', () => {
    let s = emptySermonPrep('p1', NOW);
    const r = addNote(s, { anchor: { type: 'node', nodeId: 'n1' }, category: 'theology', body: 'x' }, NOW);
    s = r.data;
    expect(s.notes).toHaveLength(1);
    expect(s.notes[0]!.anchor.nodeId).toBe('n1');
    s = updateNote(s, r.note.id, { body: 'y', category: 'application' }, LATER);
    expect(s.notes[0]!.body).toBe('y');
    expect(s.notes[0]!.category).toBe('application');
    s = removeNote(s, r.note.id, LATER);
    expect(s.notes).toHaveLength(0);
  });

  it('toggles a highlight on and off for the same anchor+category', () => {
    let s = emptySermonPrep('p1', NOW);
    const anchor = { type: 'node' as const, nodeId: 'n1' };
    s = toggleHighlight(s, { anchor, category: 'mainIdea' }, NOW);
    expect(s.highlights).toHaveLength(1);
    s = toggleHighlight(s, { anchor, category: 'mainIdea' }, NOW);
    expect(s.highlights).toHaveLength(0);
  });

  it('keeps distinct highlight categories on the same anchor', () => {
    let s = emptySermonPrep('p1', NOW);
    const anchor = { type: 'node' as const, nodeId: 'n1' };
    s = toggleHighlight(s, { anchor, category: 'mainIdea' }, NOW);
    s = toggleHighlight(s, { anchor, category: 'command' }, NOW);
    expect(s.highlights).toHaveLength(2);
  });

  it('maps relation highlights to colours (and node colours skip relations)', () => {
    let s = emptySermonPrep('p1', NOW);
    s = toggleHighlight(s, { anchor: { type: 'relation', relationId: 'r1' }, category: 'command' }, NOW);
    s = toggleHighlight(s, { anchor: { type: 'node', nodeId: 'n1' }, category: 'mainIdea' }, NOW);

    const rel = relationHighlightColors(s.highlights);
    expect(rel.get('r1')).toBe(highlightColor('command'));
    expect(rel.has('n1')).toBe(false); // node highlight isn't a relation

    const nodes = nodeHighlightColors(s.highlights);
    expect(nodes.get('n1')).toBe(highlightColor('mainIdea'));
    expect(nodes.has('r1')).toBe(false); // relation highlight skipped (not word-level)
  });

  it('removing a note detaches a highlight that referenced it', () => {
    let s = emptySermonPrep('p1', NOW);
    const note = addNote(s, { anchor: { type: 'passage' }, category: 'observation', body: 'a' }, NOW);
    s = note.data;
    const hl = addHighlight(s, { anchor: { type: 'node', nodeId: 'n1' }, category: 'emphasis', noteId: note.note.id }, NOW);
    s = hl.data;
    s = removeNote(s, note.note.id, NOW);
    expect(s.highlights[0]!.noteId).toBeUndefined();
    s = removeHighlight(s, hl.highlight.id, NOW);
    expect(s.highlights).toHaveLength(0);
  });

  it('manages the outline and big idea', () => {
    let s = emptySermonPrep('p1', NOW);
    s = setBigIdea(s, 'God is faithful', NOW);
    expect(s.outline?.bigIdea).toBe('God is faithful');
    s = addOutlineSection(s, NOW);
    const id = s.outline!.sections[0]!.id;
    s = updateOutlineSection(s, id, { title: 'Point 1', body: 'b' }, NOW);
    expect(s.outline!.sections[0]!.title).toBe('Point 1');
    s = removeOutlineSection(s, id, NOW);
    expect(s.outline!.sections).toHaveLength(0);
    expect(isEmptySermonPrep(s)).toBe(false); // big idea still set
  });

  it('records an observation', () => {
    let s = emptySermonPrep('p1', NOW);
    s = addObservation(s, { body: 'note the repetition' }, NOW).data;
    expect(s.observations[0]!.body).toBe('note the repetition');
  });
});
