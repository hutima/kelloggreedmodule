import { useEditorStore } from '@/state';
import { AlternateReadingPanel } from './AlternateReadingPanel';

/**
 * Mobile bottom sheet — one reading at a time, a clear Base/alternate choice, and
 * a return to the base. No side-by-side comparison on a phone (it would be
 * cramped); the selected reading previews in the single diagram above.
 */
export function MobileAlternateReadingSheet() {
  const open = useEditorStore((s) => s.contested.showAlternateParsePanel);
  const close = useEditorStore((s) => s.closeContestedPanel);
  if (!open) return null;
  return (
    <div className="mobile-sheet contested-sheet" role="dialog" aria-label="Alternate reading">
      <div className="mobile-sheet-head">
        <span>Alternate reading</span>
        <button className="modal-x" onClick={close} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="mobile-sheet-body">
        <AlternateReadingPanel variant="mobile" />
      </div>
    </div>
  );
}
