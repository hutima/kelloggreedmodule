import { useEffect, useMemo, useState } from 'react';
import { useEditorStore, useDiscourseStore } from '@/state';
import { glossDoc, docDirection } from '@/domain/model';
import { useViewport } from '@/ui/responsive';
import { ModeSwitcher } from '@/ui/shell/ModeSwitcher';
import { ForcedDesktopModeModal } from '@/ui/shell/ForcedDesktopModeModal';
import { ExportModal } from './ExportModal';
import { AboutModal } from './AboutModal';
import { GuideModal } from './GuideModal';
import { ImportExportModal } from './ImportExportModal';
import { ResetPassageModal, ResetAllModal } from './ResetModals';

/**
 * Responsive command bar: brand, the Explore/Edit/Sermon mode switcher, the
 * diagram Export action, and an overflow menu for data import/export, resets, the
 * force-desktop toggle, and help. The title input and full controls collapse on
 * small screens.
 */
export function TopBar() {
  const doc = useEditorStore((s) => s.doc);
  const verticalScale = useEditorStore((s) => s.verticalScale);
  const diagramMode = useEditorStore((s) => s.diagramMode);
  const treeOrientation = useEditorStore((s) => s.treeOrientation);
  const glossMode = useEditorStore((s) => s.glossMode);
  const colorMode = useEditorStore((s) => s.colorMode);
  const flipDiagram = useEditorStore((s) => s.flipDiagram);
  const status = useEditorStore((s) => s.status);

  // Match the canvas's effective direction so the export mirrors what's on screen:
  // an RTL doc lays out right-to-left unless the flip toggle un-mirrors it.
  const rtl = docDirection(doc) === 'rtl' && !flipDiagram;

  // Export what's actually on screen: when the English-gloss toggle is on, the
  // diagram shows glosses (via glossDoc), so the export must too. Morphology stays
  // in the source language, mirroring the canvas.
  const exportDoc = useMemo(
    () => (glossMode && diagramMode !== 'morphology' ? glossDoc(doc) : doc),
    [glossMode, diagramMode, doc],
  );
  const appMode = useEditorStore((s) => s.appMode);
  const setAppMode = useEditorStore((s) => s.setAppMode);
  const setTitle = useEditorStore((s) => s.setTitle);
  const setLeftCollapsed = useEditorStore((s) => s.setLeftCollapsed);
  const leftCollapsed = useEditorStore((s) => s.leftCollapsed);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  const vp = useViewport();
  // Editing is DESKTOP-ONLY — including Basic Edit. It is hidden on phones and
  // tablets unless the user explicitly forces desktop mode (which makes the
  // effective layout desktop). `isDesktop` is true exactly when the device is a
  // real desktop OR force-desktop is on, so it captures both cases.
  const canEdit = vp.isDesktop;

  const [exportOpen, setExportOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetAllOpen, setResetAllOpen] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Editing requires a desktop-class layout: if the user is in Edit mode on a
  // small screen without forcing desktop, fall back to Explore.
  useEffect(() => {
    if (appMode === 'edit' && !canEdit) setAppMode('explore');
  }, [appMode, canEdit, setAppMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      // Typing surfaces (the title input, note fields, …) keep the browser's
      // native text undo/redo; hijacking the combo there would revert diagram
      // edits while the user is trying to fix their typing. `closest` catches
      // targets nested inside a contentEditable region too.
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable ||
          t.closest('[contenteditable=""], [contenteditable="true"]'))
      ) {
        return;
      }
      e.preventDefault();
      // Discourse mode has its own document + history: the global shortcut
      // must undo the DISCOURSE edit stack there, never the syntax one.
      if (useEditorStore.getState().diagramMode === 'discourse') {
        const d = useDiscourseStore.getState();
        if (e.shiftKey) d.redo();
        else d.undo();
        return;
      }
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const close = () => setMenuOpen(false);

  return (
    <header className="topbar">
      <div className="brand">
        <svg width="22" height="22" viewBox="0 0 64 64" aria-hidden="true">
          <rect width="64" height="64" rx="10" fill="#b90e31" />
          <g stroke="#fff" strokeWidth="2.6" strokeLinecap="round">
            <line x1="10" y1="36" x2="54" y2="36" />
            <line x1="29" y1="26" x2="29" y2="46" />
            <line x1="42" y1="38" x2="50" y2="46" />
          </g>
        </svg>
        <span className="brand-name">Scripture Diagrammer</span>
      </div>

      <ModeSwitcher canEdit={canEdit} />

      <input
        className="title-input desktop-only"
        value={doc.title}
        aria-label="Document title"
        onChange={(e) => setTitle(e.target.value)}
      />

      <div className="spacer" />

      <div className="btn-group">
        {!vp.isDesktop && (
          <button
            className="btn"
            onClick={() => setLeftCollapsed(!leftCollapsed)}
            title="Passages & sources"
          >
            Sources
          </button>
        )}
        {diagramMode === 'discourse' ? (
          // The SVG/PNG diagram export renders syntax layout geometry, which
          // Discourse mode doesn't use. Discourse JSON/Markdown export lands
          // with the discourse export work; until then, say so honestly.
          <button
            className="btn"
            disabled
            title="Diagram export applies to the syntax visualizations. Discourse export (JSON / Markdown outline) is coming — switch to a syntax view to export its diagram."
          >
            Export diagram
          </button>
        ) : (
          <button className="btn primary" onClick={() => setExportOpen(true)} title="Export diagram">
            Export diagram
          </button>
        )}
        <div className="menu-wrap">
          <button className="btn" onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={menuOpen}>
            ⋯
          </button>
          {menuOpen && (
            <>
              <div className="menu-backdrop" onClick={close} />
              <div className="menu" role="menu">
                <button role="menuitem" onClick={() => { setDataOpen(true); close(); }}>
                  Import / Export data…
                </button>
                <button role="menuitem" onClick={() => { setResetOpen(true); close(); }}>
                  Reset this passage…
                </button>
                <button role="menuitem" onClick={() => { setResetAllOpen(true); close(); }}>
                  Reset all data…
                </button>
                {vp.device !== 'desktop' && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      if (vp.forceDesktop) vp.setForceDesktop(false);
                      else setForceOpen(true);
                      close();
                    }}
                  >
                    {vp.forceDesktop ? 'Use mobile layout' : 'Force desktop mode…'}
                  </button>
                )}
                <div className="menu-sep" />
                <button role="menuitem" onClick={() => { setAboutOpen(true); close(); }}>
                  About
                </button>
                <button role="menuitem" onClick={() => { setGuideOpen(true); close(); }}>
                  Guide
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="status desktop-only">
        {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? 'Save error' : ''}
      </div>

      {exportOpen && (
        <ExportModal doc={exportDoc} sourceDoc={doc} verticalScale={verticalScale} treeOrientation={treeOrientation} rtl={rtl} colorMode={colorMode} mode={diagramMode} onClose={() => setExportOpen(false)} />
      )}
      {dataOpen && <ImportExportModal onClose={() => setDataOpen(false)} />}
      {resetOpen && <ResetPassageModal onClose={() => setResetOpen(false)} />}
      {resetAllOpen && <ResetAllModal onClose={() => setResetAllOpen(false)} />}
      {forceOpen && (
        <ForcedDesktopModeModal
          onConfirm={() => { vp.setForceDesktop(true); setForceOpen(false); }}
          onClose={() => setForceOpen(false)}
        />
      )}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
      {guideOpen && <GuideModal onClose={() => setGuideOpen(false)} />}
    </header>
  );
}
