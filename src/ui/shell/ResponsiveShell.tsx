import { useEffect, useRef } from 'react';
import { useEditorStore } from '@/state';
import { useViewport } from '@/ui/responsive';
import { TopBar } from '@/ui/components/TopBar';
import { DiagramCanvas } from '@/ui/components/DiagramCanvas';
import { LeftPanel } from '@/ui/panels/LeftPanel';
import { RightPanel } from '@/ui/panels/RightPanel';
import { EditorController } from '@/ui/editor/EditorController';
import { SermonPrepDrawer } from '@/ui/sermon/SermonPrepDrawer';
import { MobileSermonPrepSheet } from '@/ui/sermon/MobileSermonPrepSheet';

/**
 * Top-level responsive layout. ONE data model, three distinct experiences:
 *
 *  - Desktop/tablet: persistent left (sources) + center (diagram) + right drawer
 *    (reader info in Explore, sermon workspace in Sermon Prep). Edit overlays the
 *    center via the EditorController.
 *  - Mobile: full-bleed diagram, sources as a slide-over drawer, no persistent
 *    side/bottom panels; Sermon Prep is a light bottom sheet. Edit is hidden
 *    unless desktop mode is forced.
 */
export function ResponsiveShell() {
  const vp = useViewport();
  const appMode = useEditorStore((s) => s.appMode);
  const leftCollapsed = useEditorStore((s) => s.leftCollapsed);
  const setLeftCollapsed = useEditorStore((s) => s.setLeftCollapsed);
  const setDiagramMode = useEditorStore((s) => s.setDiagramMode);

  // On a phone, lead with the most finger-friendly syntax lens, and keep the
  // sources drawer closed so the diagram gets the screen. One-time per mount.
  const initedMobile = useRef(false);
  useEffect(() => {
    if (vp.isMobile && !initedMobile.current) {
      initedMobile.current = true;
      setDiagramMode('phrase-block');
      setLeftCollapsed(true);
    }
  }, [vp.isMobile, setDiagramMode, setLeftCollapsed]);

  if (vp.isMobile) {
    return (
      <div className="app mobile">
        <TopBar />
        <main className="mobile-main">
          <DiagramCanvas />
        </main>
        {!leftCollapsed && (
          <div className="left-drawer">
            <div className="drawer-backdrop" onClick={() => setLeftCollapsed(true)} />
            <LeftPanel />
          </div>
        )}
        {appMode === 'sermon' && (
          <MobileSermonPrepSheet onClose={() => useEditorStore.getState().setAppMode('explore')} />
        )}
        <EditorController />
      </div>
    );
  }

  // Tablet & desktop: three-column workspace; right side depends on the mode.
  return (
    <div className={`app ${vp.effective}`}>
      <TopBar />
      <div className="workspace">
        <LeftPanel />
        <main className="panel" style={{ borderRight: 'none', background: 'var(--bg)' }}>
          <DiagramCanvas />
        </main>
        {appMode === 'sermon' ? (
          <aside className="panel right sermon-aside">
            <div className="panel-head">
              <span className="panel-head-title">Sermon Prep</span>
            </div>
            <div className="panel-body">
              <SermonPrepDrawer />
            </div>
          </aside>
        ) : (
          <RightPanel />
        )}
      </div>
      <EditorController />
    </div>
  );
}
