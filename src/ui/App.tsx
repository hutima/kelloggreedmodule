import { useEffect } from 'react';
import { useEditorStore } from '@/state';
import { TopBar } from './components/TopBar';
import { DiagramCanvas } from './components/DiagramCanvas';
import { LeftPanel } from './panels/LeftPanel';
import { RightPanel } from './panels/RightPanel';
import { UpdateModal } from './components/UpdateModal';

/**
 * Application shell: a three-panel workspace (sources · diagram · inspector)
 * beneath a command bar. Each side panel (and the source strip) collapses in
 * place via its own caret, so the top bar stays clean — just the Export action.
 */
export function App() {
  // Restore the last viewed passage after a reload (e.g. an iOS pinch-zoom that
  // blanked the page), so a refresh lands back where the user was.
  const restoreLastSession = useEditorStore((s) => s.restoreLastSession);
  useEffect(() => {
    void restoreLastSession();
  }, [restoreLastSession]);

  return (
    <div className="app">
      <TopBar />
      <div className="workspace">
        <LeftPanel />
        <main className="panel" style={{ borderRight: 'none', background: 'var(--bg)' }}>
          <DiagramCanvas />
        </main>
        <RightPanel />
      </div>
      {/* Mounted for the mandatory "Update available" overlay; the manual
          updates/cache utility was retired with the top-bar ⟳ button. */}
      <UpdateModal open={false} onClose={() => undefined} />
    </div>
  );
}
