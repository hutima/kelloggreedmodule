import { useState } from 'react';
import type { SermonAnchor } from '@/domain/schema';
import { useEditorStore } from '@/state';
import { SelectionActionSheet } from './SelectionActionSheet';
import { adapterFor } from './adapters';
import type { EditIntent, EditorAction } from './types';
import { RelationBuilderModal } from './modals/RelationBuilderModal';
import { RoleEditorModal } from './modals/RoleEditorModal';
import { BlockEditorModal } from './modals/BlockEditorModal';
import { MorphologyEditorModal } from './modals/MorphologyEditorModal';
import { NoteModal } from './modals/NoteModal';

type ActiveModal =
  | { type: 'relation'; dependentId?: string; headId?: string; relationId?: string }
  | { type: 'role'; nodeId: string }
  | { type: 'block'; nodeId: string }
  | { type: 'morphology'; nodeId: string }
  | { type: 'note'; anchor: SermonAnchor }
  | null;

/**
 * Shared editing orchestrator. It reads the active visualization adapter, asks
 * it for the actions appropriate to the current selection, shows them in a
 * SelectionActionSheet, and routes each chosen action either to a store edit
 * (which flows to the shared model) or to a guided modal. Mounted once; renders
 * nothing unless Edit mode is active with something selected.
 */
export function EditorController() {
  const appMode = useEditorStore((s) => s.appMode);
  const doc = useEditorStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);
  const linking = useEditorStore((s) => s.linking);
  const diagramMode = useEditorStore((s) => s.diagramMode);
  const select = useEditorStore((s) => s.select);
  const store = useEditorStore;

  const [modal, setModal] = useState<ActiveModal>(null);

  const dispatch = (intent: EditIntent) => {
    const s = store.getState();
    switch (intent.kind) {
      case 'setRole':
        s.setNodeRole(intent.nodeId, intent.role);
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
      case 'changeRelationType':
        s.changeRelationType(intent.relationId, intent.type);
        break;
      case 'reverseRelation':
        s.reverseRelation(intent.relationId);
        break;
      case 'removeRelation':
        s.removeRelation(intent.relationId);
        select({});
        break;
      case 'removeNode':
        s.removeNode(intent.nodeId);
        select({});
        break;
      case 'startRelink':
        s.startRelink(intent.relationId, intent.end);
        break;
      case 'resetLayout':
        s.setLayoutHint(intent.nodeId, undefined);
        break;
      case 'toggleHighlight':
        s.toggleHighlight({ anchor: intent.anchor, category: intent.category });
        break;
      case 'openRelationBuilder':
        setModal({
          type: 'relation',
          dependentId: intent.dependentId,
          headId: intent.headId,
          relationId: intent.relationId,
        });
        break;
      case 'openRoleEditor':
        setModal({ type: 'role', nodeId: intent.nodeId });
        break;
      case 'openBlockEditor':
        setModal({ type: 'block', nodeId: intent.nodeId });
        break;
      case 'openMorphology':
        setModal({ type: 'morphology', nodeId: intent.nodeId });
        break;
      case 'openNote':
        setModal({ type: 'note', anchor: intent.anchor });
        break;
    }
  };

  const onAction = (a: EditorAction) => dispatch(a.intent);

  const adapter = adapterFor(diagramMode);
  const actions = appMode === 'edit' && !linking ? adapter.getActions(doc, selection) : [];
  const title = appMode === 'edit' ? adapter.describeTarget(doc, selection) : null;
  const showSheet = appMode === 'edit' && !linking && !modal && actions.length > 0;

  return (
    <>
      {showSheet && (
        <SelectionActionSheet
          title={title}
          actions={actions}
          onAction={onAction}
          onClose={() => select({})}
        />
      )}
      {modal?.type === 'relation' && (
        <RelationBuilderModal
          dependentId={modal.dependentId}
          headId={modal.headId}
          relationId={modal.relationId}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'role' && (
        <RoleEditorModal nodeId={modal.nodeId} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'block' && (
        <BlockEditorModal nodeId={modal.nodeId} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'morphology' && (
        <MorphologyEditorModal nodeId={modal.nodeId} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'note' && (
        <NoteModal anchor={modal.anchor} onClose={() => setModal(null)} />
      )}
    </>
  );
}
