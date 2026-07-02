import { z } from 'zod';

/**
 * SOURCE CONSTITUENCY — the published Lowfat `<wg>` hierarchy, preserved
 * verbatim so the Constituency Tree can render the SOURCE analysis instead of
 * having to reconstruct phrase structure from the converted dependency graph
 * (see docs/sblgnt-kellogg-reed-plan.md, phases 10–11).
 *
 * This layer is OPTIONAL and strictly additive: it never replaces the app's
 * syntax graph (which keeps driving Kellogg-Reed, Dependency, and
 * Phrase/Block), and documents without it fall back to the reconstructed
 * tree. Nothing here is user-editable — it is a faithful record of what the
 * source said, so there is no per-node provenance: the whole tree is
 * source-given by construction, identified by `sourceId`/`editionId`.
 */

export interface SourceConstituencyNode {
  id: string;
  /** `wg` = word group (phrase/clause); `word` = a `<w>` leaf. */
  kind: 'wg' | 'word';
  /** Source category: the `<wg class>` (np/vp/pp/adjp/advp/cl) or `<w class>`. */
  cat?: string;
  /** Source function role (s / v / vc / o / io / p / adv …). */
  role?: string;
  /** Source phrase rule (DetNP, PpNp2Np, Conj-CL …). */
  rule?: string;
  /** Source head marking (`head="true"`). Absent in SBLGNT Lowfat. */
  head?: boolean;
  /** Source articular marking on the group. */
  articular?: boolean;
  /** For `word` leaves: the document token(s) realizing this node. */
  tokenIds?: string[];
  children: SourceConstituencyNode[];
}

export const SourceConstituencyNodeSchema: z.ZodType<SourceConstituencyNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    kind: z.enum(['wg', 'word']),
    cat: z.string().optional(),
    role: z.string().optional(),
    rule: z.string().optional(),
    head: z.boolean().optional(),
    articular: z.boolean().optional(),
    tokenIds: z.array(z.string()).optional(),
    children: z.array(SourceConstituencyNodeSchema),
  }),
);

export const SourceConstituencyTreeSchema = z.object({
  /** The syntax source this tree came from (e.g. `macula-greek-sblgnt-lowfat`). */
  sourceId: z.string(),
  /** The underlying text edition, when distinct from the source id. */
  editionId: z.string().optional(),
  root: SourceConstituencyNodeSchema,
});
export type SourceConstituencyTree = z.infer<typeof SourceConstituencyTreeSchema>;
