import { useEditorStore } from '@/state';
import { AlternateReadingPanel } from './AlternateReadingPanel';

/**
 * Desktop drawer — explains the issue and offers preview, optional side-by-side
 * comparison, and (for a structural alternate) adopting it as a custom parse.
 * Opening the drawer never splits the screen by itself; the user chooses
 * "Compare side-by-side".
 */
export function DesktopAlternateReadingDrawer() {
  const open = useEditorStore((s) => s.contested.showAlternateParsePanel);
  const close = useEditorStore((s) => s.closeContestedPanel);
  if (!open) return null;
  return (
    <aside className="contested-drawer" role="dialog" aria-label="Alternate parses">
      <div className="panel-head">
        <span className="panel-head-title">Alternate parses</span>
        <button className="modal-x" onClick={close} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="panel-body">
        <AlternateReadingPanel variant="desktop" />
      </div>
    </aside>
  );
}
