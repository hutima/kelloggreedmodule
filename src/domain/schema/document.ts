import { z } from 'zod';
import { DirectionSchema, LanguageSchema } from './primitives';
import { TokenSchema } from './token';
import { SyntaxModelSchema } from './syntax';
import { SourceConstituencyTreeSchema } from './constituency';
import { LayoutHintsSchema } from './layout';

/** Bump when the on-disk shape changes; the importer migrates older docs. */
export const SCHEMA_VERSION = 1;

/**
 * A complete analysis document — the unit of persistence, import, and export.
 *
 * It bundles the three separated concerns:
 *   - `tokens`      surface word order
 *   - `syntax`      syntactic relationships
 *   - `layoutHints` diagram layout overrides
 */
export const KrDocumentSchema = z.object({
  schemaVersion: z.number().int().positive().default(SCHEMA_VERSION),
  id: z.string(),
  title: z.string().default('Untitled'),
  language: LanguageSchema,
  /**
   * Writing direction. Optional — when absent the layout infers it from the
   * language/script (RTL for Hebrew/Arabic). Stored explicitly for an imported
   * doc whose language the app doesn't otherwise recognise.
   */
  direction: DirectionSchema.optional(),
  /** Raw sentence text, if entered. */
  text: z.string().default(''),
  tokens: z.array(TokenSchema).default([]),
  syntax: SyntaxModelSchema,
  /**
   * The published source's own `<wg>` constituency, preserved verbatim
   * (OPTIONAL, additive — schemaVersion unchanged; older builds ignore it).
   * Never user-edited; never replaces `syntax`.
   */
  sourceConstituency: SourceConstituencyTreeSchema.optional(),
  layoutHints: LayoutHintsSchema.default({}),
  /** Free-form analyst notes for the whole document. */
  notes: z.string().default(''),
  createdAt: z.string().datetime().or(z.string()),
  updatedAt: z.string().datetime().or(z.string()),
});
export type KrDocument = z.infer<typeof KrDocumentSchema>;

/**
 * Parse input — what a user supplies in Parsed / Assisted modes. A subset of a
 * document: tokens plus an optional partial syntax model. The inference engine
 * fills the gaps to produce a full `KrDocument`.
 */
export const ParseInputSchema = z.object({
  language: LanguageSchema,
  text: z.string().optional(),
  title: z.string().optional(),
  tokens: z.array(TokenSchema),
  /** Optional partial syntax already known from the parse. */
  syntax: SyntaxModelSchema.partial({ rootId: true }).optional(),
});
export type ParseInput = z.infer<typeof ParseInputSchema>;
