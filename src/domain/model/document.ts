import {
  type Direction,
  type KrDocument,
  type Language,
  type ParseInput,
  type SyntaxModel,
  SCHEMA_VERSION,
} from '@/domain/schema';
import { makeId } from './ids';

/**
 * Stable "now" injection so the domain stays pure and tests are deterministic.
 * The app passes a real clock; tests can pass a fixed timestamp.
 */
export type Clock = () => string;
export const systemClock: Clock = () => new Date().toISOString();

export function emptySyntax(): SyntaxModel {
  const rootId = makeId('node');
  return {
    rootId,
    nodes: [{ id: rootId, kind: 'clause', clauseType: 'independent', tokenIds: [] }],
    relations: [],
  };
}

export function createDocument(
  opts: { title?: string; language: Language; text?: string; direction?: Direction },
  clock: Clock = systemClock,
): KrDocument {
  const now = clock();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: makeId('doc'),
    title: opts.title ?? 'Untitled',
    language: opts.language,
    ...(opts.direction ? { direction: opts.direction } : {}),
    text: opts.text ?? '',
    tokens: [],
    syntax: emptySyntax(),
    layoutHints: {},
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Builds a document skeleton from parse input. The syntax model is either the
 * partial one supplied or a fresh empty clause; the inference engine is
 * expected to enrich it afterwards.
 */
export function documentFromParse(
  input: ParseInput,
  clock: Clock = systemClock,
): KrDocument {
  const base = createDocument(
    { title: input.title, language: input.language, text: input.text },
    clock,
  );
  const syntax: SyntaxModel = input.syntax?.rootId
    ? (input.syntax as SyntaxModel)
    : base.syntax;
  return { ...base, tokens: input.tokens, syntax };
}

export function touch(doc: KrDocument, clock: Clock = systemClock): KrDocument {
  return { ...doc, updatedAt: clock() };
}
