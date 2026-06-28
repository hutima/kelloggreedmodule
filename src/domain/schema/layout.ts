import { z } from 'zod';

/**
 * LAYOUT HINTS — the third separated concern, persisted with the document.
 *
 * The layout engine computes a full diagram geometry from the syntax model on
 * demand. Hints are OPTIONAL user overrides keyed by node id; they nudge or
 * pin the automatic layout without polluting the syntax model. Everything here
 * is advisory — a hint for a node that no longer exists is simply ignored.
 */
export const NodeLayoutHintSchema = z
  .object({
    /** Absolute pinned position (overrides automatic placement). */
    x: z.number().optional(),
    y: z.number().optional(),
    /** Relative nudge applied after automatic placement. */
    offsetX: z.number().optional(),
    offsetY: z.number().optional(),
    /** Collapse this node's subtree in the diagram. */
    collapsed: z.boolean().optional(),
    /** Override the slant angle (degrees) for a modifier line. */
    slantAngle: z.number().optional(),
  })
  .strict();
export type NodeLayoutHint = z.infer<typeof NodeLayoutHintSchema>;

export const LayoutHintsSchema = z.record(z.string(), NodeLayoutHintSchema);
export type LayoutHints = z.infer<typeof LayoutHintsSchema>;
