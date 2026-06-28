import type { KrDocument } from '@/domain/schema';
import { upsertNode, upsertRelation, updateNode, updateToken } from '@/domain/model';
import type { Inference, InferenceOp } from './types';

/**
 * Applies one op to a document immutably. `addNode`/`addRelation` use upsert,
 * so applying the same inference twice (or two inferences that share a node) is
 * safe and order-independent.
 */
function applyOp(doc: KrDocument, op: InferenceOp): KrDocument {
  switch (op.op) {
    case 'addNode':
      return { ...doc, syntax: upsertNode(doc.syntax, op.node) };
    case 'updateNode':
      return { ...doc, syntax: updateNode(doc.syntax, op.nodeId, op.patch) };
    case 'addRelation':
      return { ...doc, syntax: upsertRelation(doc.syntax, op.relation) };
    case 'updateToken':
      return updateToken(doc, op.tokenId, op.patch);
    default: {
      const _exhaustive: never = op;
      return _exhaustive;
    }
  }
}

/**
 * Accepts an inference: runs its ops and stamps every entity it touched as
 * `confirmed` so the analysis is no longer marked provisional.
 */
export function applyInference(doc: KrDocument, inf: Inference): KrDocument {
  let next = inf.ops.reduce(applyOp, doc);
  next = stampConfirmed(next, inf);
  return next;
}

/** Accept several inferences in order. */
export function applyInferences(doc: KrDocument, infs: Inference[]): KrDocument {
  return infs.reduce(applyInference, doc);
}

/**
 * After ops run, flip the provenance of the affected nodes/relations/tokens
 * from `inferred` to `confirmed`, preserving the original reason.
 */
function stampConfirmed(doc: KrDocument, inf: Inference): KrDocument {
  const confirm = <T extends { provenance?: { source: string; confidence?: 'high' | 'medium' | 'low'; reason?: string } }>(
    entity: T,
  ): T =>
    entity.provenance?.source === 'inferred'
      ? { ...entity, provenance: { ...entity.provenance, source: 'confirmed' as const } }
      : entity;

  const touchedNodeIds = new Set(
    inf.ops.flatMap((o) =>
      o.op === 'addNode' ? [o.node.id] : o.op === 'updateNode' ? [o.nodeId] : [],
    ),
  );
  const touchedRelIds = new Set(
    inf.ops.flatMap((o) => (o.op === 'addRelation' ? [o.relation.id] : [])),
  );

  return {
    ...doc,
    syntax: {
      ...doc.syntax,
      nodes: doc.syntax.nodes.map((n) => (touchedNodeIds.has(n.id) ? confirm(n) : n)),
      relations: doc.syntax.relations.map((r) =>
        touchedRelIds.has(r.id) ? confirm(r) : r,
      ),
    },
  };
}
