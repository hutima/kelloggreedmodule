import { useEditorStore } from '@/state';
import type { EditIntent } from './types';
import { grandparentId, previousSiblingId, keepType } from './hierarchy';

/**
 * The ONE place an {@link EditIntent} becomes an effect. Every editing surface —
 * the inline popover, the action sheet, the phrase/block workbench, the
 * dependency overlay — routes through here, so semantic edits always flow to the
 * shared syntax graph and modals are hosted centrally (store `editModal`).
 *
 * Hierarchy intents (promote/demote/move-under) are resolved to the existing
 * `attachNodeTo` mutation; tool/visual-link intents drive the Basic interaction
 * state; modal intents set `editModal`.
 */
export function dispatchEditIntent(intent: EditIntent): void {
  const s = useEditorStore.getState();
  const { doc } = s;

  switch (intent.kind) {
    // --- direct semantic edits ---
    case 'setRole':
      s.setNodeRole(intent.nodeId, intent.role);
      break;
    case 'addClause':
      s.addClause();
      break;
    case 'setMainPredicate':
      s.setMainPredicate(intent.nodeId);
      break;
    case 'setImplied':
      s.setImplied(intent.nodeId, intent.implied);
      break;
    case 'setClauseType':
      s.setClauseType(intent.nodeId, intent.clauseType);
      break;
    case 'attachNodeTo':
      s.attachNodeTo(intent.dependentId, intent.headId, intent.type);
      break;
    case 'assignToClause':
      s.assignToClause(intent.nodeId, intent.clauseId);
      break;
    case 'changeRelationType':
      s.changeRelationType(intent.relationId, intent.type);
      break;
    case 'reverseRelation':
      s.reverseRelation(intent.relationId);
      break;
    case 'removeRelation':
      s.removeRelation(intent.relationId);
      s.select({});
      break;
    case 'removeNode':
      s.removeNode(intent.nodeId);
      s.select({});
      break;
    case 'detachWord':
      s.detachWord(intent.nodeId);
      break;
    case 'startRelink':
      s.startRelink(intent.relationId, intent.end);
      break;

    // --- hierarchy moves (resolved to attachNodeTo) ---
    case 'promoteNode': {
      const head = grandparentId(doc, intent.nodeId);
      if (head) s.attachNodeTo(intent.nodeId, head, keepType(doc, intent.nodeId));
      break;
    }
    case 'demoteNode': {
      const head = previousSiblingId(doc, intent.nodeId);
      if (head) s.attachNodeTo(intent.nodeId, head, keepType(doc, intent.nodeId));
      break;
    }
    case 'moveNodeUnder':
      s.attachNodeTo(intent.nodeId, intent.headId, intent.type ?? keepType(doc, intent.nodeId));
      break;

    // --- grouping ---
    case 'groupTokens':
      s.groupTokens(intent.tokenIds);
      break;
    case 'ungroupNode':
      s.ungroupNode(intent.nodeId);
      break;

    // --- visual linking / tools ---
    case 'startVisualLink':
      s.setActiveEditTool('link');
      s.startVisualLink(intent.dependentId);
      break;
    case 'completeVisualLink':
      s.completeVisualLink(intent.headId);
      break;
    case 'openQuickRolePicker':
      s.startVisualLink(intent.dependentId);
      s.completeVisualLink(intent.headId);
      break;
    case 'setEditTool':
      s.setActiveEditTool(intent.tool);
      break;
    case 'switchDiagramMode':
      s.setDiagramMode(intent.mode);
      break;

    // --- layout (view-only) ---
    case 'resetLayout':
      s.setLayoutHint(intent.nodeId, undefined);
      break;

    // --- sermon ---
    case 'toggleHighlight':
      s.toggleHighlight({ anchor: intent.anchor, category: intent.category });
      break;

    // --- modals ---
    case 'openRelationBuilder':
      s.openEditModal({
        type: 'relation',
        dependentId: intent.dependentId,
        headId: intent.headId,
        relationId: intent.relationId,
      });
      break;
    case 'openRoleEditor':
      s.openEditModal({ type: 'role', nodeId: intent.nodeId });
      break;
    case 'openBlockEditor':
      s.openEditModal({ type: 'block', nodeId: intent.nodeId });
      break;
    case 'openAdvancedWordDetails':
      s.openEditModal({ type: 'wordDetails', nodeId: intent.nodeId });
      break;
    case 'openQuickGloss':
      s.openEditModal({ type: 'quickGloss', nodeId: intent.nodeId });
      break;
    case 'openNote':
      s.openEditModal({ type: 'note', anchor: intent.anchor });
      break;
  }
}
