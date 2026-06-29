import { useEditorStore } from '@/state';
import { SelectionActionSheet } from './SelectionActionSheet';
import { InlineSyntaxPopover } from './InlineSyntaxPopover';
import { RelationshipQuickPicker } from './RelationshipQuickPicker';
import { adapterFor } from './adapters';
import { dispatchEditIntent } from './dispatch';
import type { EditorAction } from './types';
import { RelationBuilderModal } from './modals/RelationBuilderModal';
import { RoleEditorModal } from './modals/RoleEditorModal';
import { BlockEditorModal } from './modals/BlockEditorModal';
import { AdvancedWordDetailsModal } from './modals/AdvancedWordDetailsModal';
import { QuickGlossModal } from './modals/QuickGlossModal';
import { NoteModal } from './modals/NoteModal';

/**
 * Shared editing orchestrator. It reads the active visualization adapter and the
 * current EDIT TIER, asks for the tier's actions, and shows them in the right
 * contextual surface: a compact InlineSyntaxPopover for Basic, the fuller
 * SelectionActionSheet for Advanced. The visual relationship picker and all
 * guided modals are hosted here too, but every action is routed through the one
 * central dispatcher so semantic edits always reach the shared model.
 *
 * Phrase/Block edits inline in its own workbench (rendered in the canvas), so the
 * floating contextual surfaces are suppressed there to avoid double UI.
 */
export function EditorController() {
  const appMode = useEditorStore((s) => s.appMode);
  const doc = useEditorStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);
  const linking = useEditorStore((s) => s.linking);
  const diagramMode = useEditorStore((s) => s.diagramMode);
  const editTier = useEditorStore((s) => s.editTier);
  const pendingLinkStart = useEditorStore((s) => s.pendingLinkStart);
  const relationshipDraft = useEditorStore((s) => s.relationshipDraft);
  const editModal = useEditorStore((s) => s.editModal);
  const select = useEditorStore((s) => s.select);
  const closeEditModal = useEditorStore((s) => s.closeEditModal);
  const openEditModal = useEditorStore((s) => s.openEditModal);
  const cancelVisualLink = useEditorStore((s) => s.cancelVisualLink);

  const onAction = (a: EditorAction) => dispatchEditIntent(a.intent);

  const adapter = adapterFor(diagramMode);
  const editing = appMode === 'edit';
  // Phrase/Block uses its own inline row workbench; don't also float a sheet.
  const inlineWorkbench = diagramMode === 'phrase-block';
  const busy = Boolean(linking || pendingLinkStart || relationshipDraft || editModal);

  const actions =
    editing && !busy && !inlineWorkbench ? adapter.getActions(doc, selection, editTier) : [];
  const title = editing ? adapter.describeTarget(doc, selection) : null;
  const showContextual = editing && !busy && !inlineWorkbench && actions.length > 0;

  return (
    <>
      {showContextual &&
        (editTier === 'basic' ? (
          <InlineSyntaxPopover
            title={title}
            actions={actions}
            onAction={onAction}
            onClose={() => select({})}
          />
        ) : (
          <SelectionActionSheet
            title={title}
            actions={actions}
            onAction={onAction}
            onClose={() => select({})}
          />
        ))}

      {editing && relationshipDraft && (
        <RelationshipQuickPicker
          onAdvanced={() => {
            openEditModal({
              type: 'relation',
              dependentId: relationshipDraft.dependentId,
              headId: relationshipDraft.headId,
            });
            cancelVisualLink();
          }}
        />
      )}

      {editModal?.type === 'relation' && (
        <RelationBuilderModal
          dependentId={editModal.dependentId}
          headId={editModal.headId}
          relationId={editModal.relationId}
          onClose={closeEditModal}
        />
      )}
      {editModal?.type === 'role' && (
        <RoleEditorModal nodeId={editModal.nodeId} onClose={closeEditModal} />
      )}
      {editModal?.type === 'block' && (
        <BlockEditorModal nodeId={editModal.nodeId} onClose={closeEditModal} />
      )}
      {editModal?.type === 'wordDetails' && (
        <AdvancedWordDetailsModal nodeId={editModal.nodeId} onClose={closeEditModal} />
      )}
      {editModal?.type === 'quickGloss' && (
        <QuickGlossModal nodeId={editModal.nodeId} onClose={closeEditModal} />
      )}
      {editModal?.type === 'note' && (
        <NoteModal anchor={editModal.anchor} onClose={closeEditModal} />
      )}
    </>
  );
}
