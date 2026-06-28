import type { KrDocument } from '@/domain/schema';
import type { Inference, InferenceRule, RuleContext } from './types';
import { defaultRules } from './rules';

/**
 * Runs the inference rules against a document and returns provisional
 * inferences. The engine is pure and deterministic: ids are minted from a
 * counter so the same input always yields the same inference ids (handy for
 * tests and stable React keys).
 *
 * Inferences are NEVER applied here — the engine only proposes. The caller (the
 * editor) decides which to accept, reject, or override. This keeps the
 * "all inferences are provisional / editable / removable" guarantee structural.
 */
export interface InferenceResult {
  inferences: Inference[];
}

export function runInference(
  doc: KrDocument,
  rules: InferenceRule[] = defaultRules,
): InferenceResult {
  let counter = 0;
  const nextId = (prefix: 'node' | 'rel' | 'inf') => `${prefix}_i${counter++}`;

  const ctx: RuleContext = { doc, model: doc.syntax, nextId };

  const inferences: Inference[] = [];
  for (const rule of rules) {
    try {
      inferences.push(...rule.run(ctx));
    } catch (err) {
      // A misbehaving rule must never break the whole engine.
      console.error(`Inference rule "${rule.name}" failed:`, err);
    }
  }
  return { inferences };
}
