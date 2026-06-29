import { Modal } from '@/ui/components/common/Modal';

/**
 * Warning shown before forcing the desktop/edit experience onto a small screen.
 * The preference is stored locally by the caller.
 */
export function ForcedDesktopModeModal({
  onConfirm,
  onClose,
}: {
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Force desktop mode?"
      onClose={onClose}
      footer={
        <div className="modal-buttons">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={onConfirm}>
            Use desktop mode
          </button>
        </div>
      }
    >
      <p>
        Desktop/edit mode is designed for larger screens. Some controls may be cramped or difficult
        to use on this device.
      </p>
    </Modal>
  );
}
