/**
 * CONTESTED SYNTAX domain module — pure helpers over the curated registry plus
 * the overlay apply / diff engine. The base parse tree is never mutated; an
 * alternate reading is applied as an overlay for preview and converted to a
 * normal user patch only when explicitly adopted.
 */
export * from './registry';
export * from './apply';
export * from './diff';
export * from './userVariants';
