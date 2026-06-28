import type {
  KrDocument,
  Provenance,
  Relation,
  SyntaxModel,
  SyntaxNode,
  Token,
} from '@/domain/schema';

/**
 * A single declarative edit. Inferences are made of these so they are pure
 * data — serializable, testable, and trivially reversible (an inference is
 * "applied" by running its ops and "rejected" by simply discarding it).
 */
export type InferenceOp =
  | { op: 'addNode'; node: SyntaxNode }
  | { op: 'addRelation'; relation: Relation }
  | { op: 'updateNode'; nodeId: string; patch: Partial<SyntaxNode> }
  | { op: 'updateToken'; tokenId: string; patch: Partial<Token> };

/**
 * A provisional analytical suggestion. Always editable, always removable, and
 * always annotated with source/confidence/reason via `provenance`.
 */
export interface Inference {
  id: string;
  /** Short label for the UI list, e.g. "Implied subject (he)". */
  title: string;
  /** Category, used for grouping / bulk accept-reject. */
  category:
    | 'pos'
    | 'morphology'
    | 'subject'
    | 'predicate'
    | 'object'
    | 'modifier'
    | 'preposition'
    | 'coordination'
    | 'clause';
  provenance: Provenance; // source is always 'inferred' when produced
  /** Tokens this inference is "about", for highlighting in the UI. */
  tokenIds?: string[];
  /** The edits applied together when the inference is accepted. */
  ops: InferenceOp[];
}

/** Everything a rule needs, plus id minting that stays unique across a run. */
export interface RuleContext {
  doc: KrDocument;
  model: SyntaxModel;
  /** Deterministic id factory injected by the engine (keeps tests stable). */
  nextId: (prefix: 'node' | 'rel' | 'inf') => string;
}

/** A rule inspects the current analysis and proposes zero or more inferences. */
export type Rule = (ctx: RuleContext) => Inference[];

export interface InferenceRule {
  name: string;
  description: string;
  run: Rule;
}
