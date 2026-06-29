import { z } from 'zod';

/**
 * SERMON PREP DATA — a separate concern from syntax.
 *
 * Edit Mode answers "What is the syntax?"; Sermon Prep answers "What do I need to
 * notice, preserve, and preach?". Sermon prep data therefore lives in its own
 * schema, anchored to the shared document by STABLE IDS (token / node / relation
 * / block ids, or a verse reference) rather than fragile character offsets, so a
 * note survives edits to the surrounding text.
 *
 * Like the rest of the domain these shapes are additive: new categories or
 * anchor kinds must never break documents persisted by an older build.
 */

/** What a note or highlight is attached to. */
export const SermonAnchorTypeSchema = z.enum([
  'passage',
  'verse',
  'token',
  'node',
  'relation',
  'block',
  'highlight',
  'tokenRange',
]);
export type SermonAnchorType = z.infer<typeof SermonAnchorTypeSchema>;

/**
 * A stable anchor. Different anchor kinds populate different fields; consumers
 * read the field matching `type` and ignore the rest. `blockId` is a node id in
 * the Phrase/Block view (blocks are nodes), kept named distinctly to match the
 * product spec's vocabulary.
 */
export const SermonAnchorSchema = z.object({
  type: SermonAnchorTypeSchema,
  /** Generic id (e.g. the highlight id for a note attached to a highlight). */
  id: z.string().optional(),
  tokenIds: z.array(z.string()).optional(),
  nodeId: z.string().optional(),
  relationId: z.string().optional(),
  blockId: z.string().optional(),
  verseRef: z.string().optional(),
});
export type SermonAnchor = z.infer<typeof SermonAnchorSchema>;

export const SermonNoteCategorySchema = z.enum([
  'observation',
  'translation',
  'syntax',
  'theology',
  'illustration',
  'application',
  'question',
  'outline',
  'crossReference',
  'commentary',
]);
export type SermonNoteCategory = z.infer<typeof SermonNoteCategorySchema>;

export const SermonNoteSchema = z.object({
  id: z.string(),
  anchor: SermonAnchorSchema,
  category: SermonNoteCategorySchema,
  title: z.string().optional(),
  body: z.string().default(''),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SermonNote = z.infer<typeof SermonNoteSchema>;

export const HighlightCategorySchema = z.enum([
  'mainIdea',
  'repeatedWord',
  'command',
  'promise',
  'warning',
  'theologicalClaim',
  'illustration',
  'application',
  'question',
  'contrast',
  'conjunction',
  'emphasis',
]);
export type HighlightCategory = z.infer<typeof HighlightCategorySchema>;

export const HighlightSchema = z.object({
  id: z.string(),
  anchor: SermonAnchorSchema,
  category: HighlightCategorySchema,
  /** Optional note attached to this highlight. */
  noteId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Highlight = z.infer<typeof HighlightSchema>;

/** A free-standing exegetical observation (lighter than a full note). */
export const ObservationSchema = z.object({
  id: z.string(),
  anchor: SermonAnchorSchema.optional(),
  body: z.string().default(''),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Observation = z.infer<typeof ObservationSchema>;

export const SermonOutlineSectionSchema = z.object({
  id: z.string(),
  title: z.string().default(''),
  body: z.string().default(''),
  /** Anchors tying this point back to the text. */
  anchors: z.array(SermonAnchorSchema).default([]),
});
export type SermonOutlineSection = z.infer<typeof SermonOutlineSectionSchema>;

export const SermonOutlineSchema = z.object({
  bigIdea: z.string().optional(),
  sections: z.array(SermonOutlineSectionSchema).default([]),
});
export type SermonOutline = z.infer<typeof SermonOutlineSchema>;

export const SermonPrepDataSchema = z.object({
  schemaVersion: z.number().int().positive().default(1),
  passageId: z.string(),
  /** Where the base passage came from, for export provenance. */
  source: z
    .object({
      corpus: z.string().optional(),
      passageId: z.string().optional(),
      sourceId: z.string().optional(),
      reference: z.string().optional(),
    })
    .optional(),
  notes: z.array(SermonNoteSchema).default([]),
  highlights: z.array(HighlightSchema).default([]),
  observations: z.array(ObservationSchema).default([]),
  outline: SermonOutlineSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SermonPrepData = z.infer<typeof SermonPrepDataSchema>;

/** An empty sermon-prep record for a passage. */
export function emptySermonPrep(passageId: string, now: string): SermonPrepData {
  return {
    schemaVersion: 1,
    passageId,
    notes: [],
    highlights: [],
    observations: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** True when there is nothing worth persisting. */
export function isEmptySermonPrep(data: SermonPrepData): boolean {
  return (
    data.notes.length === 0 &&
    data.highlights.length === 0 &&
    data.observations.length === 0 &&
    (!data.outline ||
      (!data.outline.bigIdea && data.outline.sections.length === 0))
  );
}
