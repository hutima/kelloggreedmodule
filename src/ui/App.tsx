import { useEffect } from 'react';
import { useEditorStore } from '@/state';
import { ResponsiveShell } from './shell/ResponsiveShell';
import { UpdateModal } from './components/UpdateModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DiagnosticsBanner } from './components/DiagnosticsBanner';

/**
 * Application shell. The responsive layout (mobile / tablet / desktop) and the
 * three user-facing modes (Explore / Edit / Sermon Prep) are decided by
 * {@link ResponsiveShell}; everything edits or displays ONE shared document
 * model. This component only mounts the shell plus the global overlays.
 */
export function App() {
  // Restore the last viewed passage after a reload (e.g. an iOS pinch-zoom that
  // blanked the page), so a refresh lands back where the user was.
  const restoreLastSession = useEditorStore((s) => s.restoreLastSession);
  useEffect(() => {
    void restoreLastSession();
  }, [restoreLastSession]);

  return (
    <ErrorBoundary>
      <ResponsiveShell />
      {/* Mounted for the mandatory "Update available" overlay; the manual
          updates/cache utility was retired with the top-bar ⟳ button. */}
      <UpdateModal open={false} onClose={() => undefined} />
      {/* Shows the on-device error log after a reload (pinch white-screen
          diagnostic); renders nothing when the log is empty. */}
      <DiagnosticsBanner />
    </ErrorBoundary>
  );
}
