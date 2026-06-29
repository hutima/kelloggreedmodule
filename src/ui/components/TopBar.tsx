import { useEffect, useState } from 'react';
import { useEditorStore } from '@/state';
import { ExportModal } from './ExportModal';
import { AboutModal } from './AboutModal';
import { GuideModal } from './GuideModal';

export function TopBar() {
  const doc = useEditorStore((s) => s.doc);
  const verticalScale = useEditorStore((s) => s.verticalScale);
  const diagramMode = useEditorStore((s) => s.diagramMode);
  const status = useEditorStore((s) => s.status);
  const setTitle = useEditorStore((s) => s.setTitle);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  const [exportOpen, setExportOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  // Keyboard shortcuts for undo/redo (the toolbar buttons were retired in favour
  // of a single Export action; undo/redo stay available from the keyboard).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  return (
    <header className="topbar">
      <div className="brand">
        <svg width="22" height="22" viewBox="0 0 64 64" aria-hidden="true">
          <rect width="64" height="64" rx="10" fill="#2f6f9f" />
          <g stroke="#fff" strokeWidth="2.6" strokeLinecap="round">
            <line x1="10" y1="36" x2="54" y2="36" />
            <line x1="29" y1="26" x2="29" y2="46" />
            <line x1="42" y1="38" x2="50" y2="46" />
          </g>
        </svg>
        <span>Kellogg-Reed</span>
      </div>

      <input
        className="title-input"
        value={doc.title}
        aria-label="Document title"
        onChange={(e) => setTitle(e.target.value)}
      />

      <div className="spacer" />

      <div className="btn-group">
        <button className="btn" onClick={() => setAboutOpen(true)} title="About & contact">
          About
        </button>
        <button className="btn" onClick={() => setGuideOpen(true)} title="How to use">
          Guide
        </button>
        <button className="btn primary" onClick={() => setExportOpen(true)} title="Export diagram">
          Export
        </button>
      </div>

      <div className="status">
        {status === 'saving'
          ? 'Saving…'
          : status === 'saved'
            ? 'Saved'
            : status === 'error'
              ? 'Save error'
              : ''}
      </div>

      {exportOpen && (
        <ExportModal
          doc={doc}
          verticalScale={verticalScale}
          mode={diagramMode}
          onClose={() => setExportOpen(false)}
        />
      )}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
      {guideOpen && <GuideModal onClose={() => setGuideOpen(false)} />}
    </header>
  );
}
