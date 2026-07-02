/**
 * Schema layer — the single source of truth for the domain's data shapes.
 *
 * Architecture note: the model deliberately separates three concerns so that
 * the renderer can never confuse one for another:
 *   1. surface word order        -> `Token` (`token.ts`)
 *   2. syntactic relationships   -> `SyntaxModel` (`syntax.ts`)
 *   3. diagram layout            -> `LayoutHints` (`layout.ts`)
 *
 * Everything downstream (inference, layout, render, state, io) imports types
 * and validators from here.
 */
export * from './primitives';
export * from './token';
export * from './syntax';
export * from './constituency';
export * from './layout';
export * from './document';
export * from './sermon';
export * from './patch';
export * from './contested';
