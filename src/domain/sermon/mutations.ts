import type {
  SermonPrepData,
  SermonNote,
  SermonNoteCategory,
  Highlight,
  HighlightCategory,
  Observation,
  SermonAnchor,
  SermonOutline,
  SermonOutlineSection,
} from '@/domain/schema';
import { makeId } from '@/domain/model';

/**
 * Pure, immutable edits to sermon-prep data. Each returns a NEW object; the
 * store wires these to actions and persists the result. `now` is injected so the
 * domain stays pure and tests are deterministic.
 */

function touch(data: SermonPrepData, now: string): SermonPrepData {
  return { ...data, updatedAt: now };
}

// --- notes --------------------------------------------------------------------

export function addNote(
  data: SermonPrepData,
  input: { anchor: SermonAnchor; category: SermonNoteCategory; title?: string; body?: string },
  now: string,
): { data: SermonPrepData; note: SermonNote } {
  const note: SermonNote = {
    id: makeId('note'),
    anchor: input.anchor,
    category: input.category,
    title: input.title,
    body: input.body ?? '',
    createdAt: now,
    updatedAt: now,
  };
  return { data: touch({ ...data, notes: [...data.notes, note] }, now), note };
}

export function updateNote(
  data: SermonPrepData,
  id: string,
  patch: Partial<Pick<SermonNote, 'title' | 'body' | 'category' | 'anchor'>>,
  now: string,
): SermonPrepData {
  return touch(
    {
      ...data,
      notes: data.notes.map((n) =>
        n.id === id ? { ...n, ...patch, updatedAt: now } : n,
      ),
    },
    now,
  );
}

export function removeNote(data: SermonPrepData, id: string, now: string): SermonPrepData {
  return touch(
    {
      ...data,
      notes: data.notes.filter((n) => n.id !== id),
      // Detach any highlight that pointed at this note.
      highlights: data.highlights.map((h) =>
        h.noteId === id ? { ...h, noteId: undefined } : h,
      ),
    },
    now,
  );
}

// --- highlights ---------------------------------------------------------------

export function addHighlight(
  data: SermonPrepData,
  input: { anchor: SermonAnchor; category: HighlightCategory; noteId?: string },
  now: string,
): { data: SermonPrepData; highlight: Highlight } {
  const highlight: Highlight = {
    id: makeId('hl'),
    anchor: input.anchor,
    category: input.category,
    noteId: input.noteId,
    createdAt: now,
    updatedAt: now,
  };
  return {
    data: touch({ ...data, highlights: [...data.highlights, highlight] }, now),
    highlight,
  };
}

export function updateHighlight(
  data: SermonPrepData,
  id: string,
  patch: Partial<Pick<Highlight, 'category' | 'noteId' | 'anchor'>>,
  now: string,
): SermonPrepData {
  return touch(
    {
      ...data,
      highlights: data.highlights.map((h) =>
        h.id === id ? { ...h, ...patch, updatedAt: now } : h,
      ),
    },
    now,
  );
}

export function removeHighlight(data: SermonPrepData, id: string, now: string): SermonPrepData {
  return touch({ ...data, highlights: data.highlights.filter((h) => h.id !== id) }, now);
}

/**
 * Toggle a highlight of `category` for an anchor key: if one already exists for
 * the same node/relation/token-set with the same category, remove it; otherwise
 * add it. Anchor identity is by the populated id field.
 */
export function toggleHighlight(
  data: SermonPrepData,
  input: { anchor: SermonAnchor; category: HighlightCategory },
  now: string,
): SermonPrepData {
  const key = anchorKey(input.anchor);
  const existing = data.highlights.find(
    (h) => h.category === input.category && anchorKey(h.anchor) === key,
  );
  if (existing) return removeHighlight(data, existing.id, now);
  return addHighlight(data, input, now).data;
}

function anchorKey(a: SermonAnchor): string {
  return [
    a.type,
    a.nodeId ?? '',
    a.relationId ?? '',
    a.blockId ?? '',
    a.verseRef ?? '',
    (a.tokenIds ?? []).join(','),
  ].join('|');
}

// --- observations -------------------------------------------------------------

export function addObservation(
  data: SermonPrepData,
  input: { body?: string; anchor?: SermonAnchor },
  now: string,
): { data: SermonPrepData; observation: Observation } {
  const observation: Observation = {
    id: makeId('obs'),
    anchor: input.anchor,
    body: input.body ?? '',
    createdAt: now,
    updatedAt: now,
  };
  return {
    data: touch({ ...data, observations: [...data.observations, observation] }, now),
    observation,
  };
}

export function updateObservation(
  data: SermonPrepData,
  id: string,
  patch: Partial<Pick<Observation, 'body' | 'anchor'>>,
  now: string,
): SermonPrepData {
  return touch(
    {
      ...data,
      observations: data.observations.map((o) =>
        o.id === id ? { ...o, ...patch, updatedAt: now } : o,
      ),
    },
    now,
  );
}

export function removeObservation(data: SermonPrepData, id: string, now: string): SermonPrepData {
  return touch({ ...data, observations: data.observations.filter((o) => o.id !== id) }, now);
}

// --- outline ------------------------------------------------------------------

function ensureOutline(data: SermonPrepData): SermonOutline {
  return data.outline ?? { sections: [] };
}

export function setBigIdea(data: SermonPrepData, bigIdea: string, now: string): SermonPrepData {
  return touch({ ...data, outline: { ...ensureOutline(data), bigIdea } }, now);
}

export function addOutlineSection(data: SermonPrepData, now: string): SermonPrepData {
  const outline = ensureOutline(data);
  const section: SermonOutlineSection = {
    id: makeId('sec'),
    title: '',
    body: '',
    anchors: [],
  };
  return touch(
    { ...data, outline: { ...outline, sections: [...outline.sections, section] } },
    now,
  );
}

export function updateOutlineSection(
  data: SermonPrepData,
  id: string,
  patch: Partial<Pick<SermonOutlineSection, 'title' | 'body' | 'anchors'>>,
  now: string,
): SermonPrepData {
  const outline = ensureOutline(data);
  return touch(
    {
      ...data,
      outline: {
        ...outline,
        sections: outline.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      },
    },
    now,
  );
}

export function removeOutlineSection(data: SermonPrepData, id: string, now: string): SermonPrepData {
  const outline = ensureOutline(data);
  return touch(
    { ...data, outline: { ...outline, sections: outline.sections.filter((s) => s.id !== id) } },
    now,
  );
}
