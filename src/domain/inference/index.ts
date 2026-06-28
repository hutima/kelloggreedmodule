/**
 * Inference engine — produces PROVISIONAL, editable, removable suggestions for
 * partially parsed input. Every inference carries source/confidence/reason
 * provenance. The engine proposes; the editor disposes (accept all, reject all,
 * accept/reject individually, override, or confirm).
 */
export * from './types';
export * from './engine';
export * from './apply';
export { defaultRules } from './rules';
export { lexicon, normalize } from './lexicon';
