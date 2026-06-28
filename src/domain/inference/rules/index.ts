import type { InferenceRule } from '../types';
import { posRule } from './posRule';
import { clauseRule } from './clauseRule';
import { determinerRule } from './determinerRule';
import { prepositionRule } from './prepositionRule';
import { coordinationRule } from './coordinationRule';

/**
 * The ordered rule registry. To extend the inference engine, write a new
 * `InferenceRule` and add it here — nothing else needs to change. Order matters
 * only for presentation; rules are otherwise independent and idempotent.
 */
export const defaultRules: InferenceRule[] = [
  posRule,
  clauseRule,
  determinerRule,
  prepositionRule,
  coordinationRule,
];

export {
  posRule,
  clauseRule,
  determinerRule,
  prepositionRule,
  coordinationRule,
};
