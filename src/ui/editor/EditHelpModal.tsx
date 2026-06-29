import { useEditorStore } from '@/state';
import { Modal } from '@/ui/components/common/Modal';
import { adapterFor } from './adapters';

/**
 * Mode-aware AND tier-aware "How to edit" help. It reads the active adapter's
 * help content for the current tier and lays out the same practical questions for
 * every mode: what it's best for, what this tier does, and how to create / move /
 * relabel / delete relationships — plus when to switch modes.
 */
export function EditHelpModal({ onClose }: { onClose: () => void }) {
  const diagramMode = useEditorStore((s) => s.diagramMode);
  const editTier = useEditorStore((s) => s.editTier);
  const help = adapterFor(diagramMode).getHelpContent(editTier);

  return (
    <Modal title={`How to edit · ${help.title}`} onClose={onClose} wide className="help-modal"
      footer={
        <div className="modal-buttons">
          <button className="btn primary" onClick={onClose}>
            Got it
          </button>
        </div>
      }
    >
      <p className="help-bestfor">{help.bestFor}</p>

      <h3 className="help-h">What this does</h3>
      <ul className="help-list">
        {help.whatItDoes.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>

      <dl className="help-dl">
        <dt>Create a relationship</dt>
        <dd>{help.createRelationship}</dd>
        <dt>Move / reparent</dt>
        <dd>{help.reparent}</dd>
        <dt>Change a label</dt>
        <dd>{help.changeLabel}</dd>
        <dt>Delete a relationship</dt>
        <dd>{help.deleteRelationship}</dd>
        <dt>When to switch</dt>
        <dd>{help.whenToSwitch}</dd>
      </dl>
    </Modal>
  );
}
