import { z } from 'zod';
import {
  LanguageSchema,
  MorphologySchema,
  PartOfSpeechSchema,
  ProvenanceSchema,
} from './primitives';

/**
 * A surface token. Tokens model SURFACE WORD ORDER only.
 *
 * `index` is the linear position in the sentence as written. It carries NO
 * syntactic meaning — the syntax model references tokens by id, never by
 * order, so free word order, discontinuous constituents, and implied elements
 * are all representable. The renderer must never derive structure from `index`.
 */
export const TokenSchema = z.object({
  id: z.string(),
  /** 0-based position in surface order. */
  index: z.number().int().nonnegative(),
  /** The word as it appears (polytonic Greek preserved verbatim). */
  surface: z.string(),
  /** Dictionary/lexical form, if known. */
  lemma: z.string().optional(),
  language: LanguageSchema.optional(),
  pos: PartOfSpeechSchema.optional(),
  morphology: MorphologySchema.optional(),
  /** Short translation gloss for display under Greek tokens. */
  gloss: z.string().optional(),
  provenance: ProvenanceSchema.optional(),
});
export type Token = z.infer<typeof TokenSchema>;
