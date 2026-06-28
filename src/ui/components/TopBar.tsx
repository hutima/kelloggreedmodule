import { useEffect, useRef, useState } from 'react';
import { useEditorStore, selectCanRedo, selectCanUndo, type AppMode } from '@/state';
import { sampleEntries, cloneSample } from '@/fixtures';
import {
  listDocuments,
  getDocument,
  type DocumentSummary,
} from '@/persistence';
import {
  downloadDocumentJson,
  downloadDocumentSvg,
  downloadDocumentPng,
  importJson,
  printDocument,
} from '@/io';
import type { Language } from '@/domain/schema';

const MODES: { id: AppMode; label: string; hint: string }[] = [
  { id: 'parsed', label: 'Parsed', hint: 'Paste a full parse (JSON / Parse tab).' },
  { id: 'assisted', label: 'Assisted', hint: 'Infer structure from partial input.' },
  { id: 'manual', label: 'Manual', hint: 'Build a diagram from scratch.' },
];

export function TopBar({
  onToggleLeft,
  onToggleRight,
  onOpenUpdates,
}: {
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onOpenUpdates: () => void;
}) {
  const doc = useEditorStore((s) => s.doc);
  const verticalScale = useEditorStore((s) => s.verticalScale);
  const mode = useEditorStore((s) => s.mode);
  const status = useEditorStore((s) => s.status);
  const setMode = useEditorStore((s) => s.setMode);
  const setTitle = useEditorStore((s) => s.setTitle);
  const newDocument = useEditorStore((s) => s.newDocument);
  const loadDocument = useEditorStore((s) => s.loadDocument);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore(selectCanUndo);
  const canRedo = useEditorStore(selectCanRedo);

  const fileRef = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<DocumentSummary[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  // On phones the command buttons collapse behind a menu toggle so they don't
  // consume most of the screen; on wider screens the group is always shown.
  const [menuOpen, setMenuOpen] = useState(false);

  // Refresh the recent list whenever the doc id or save status changes.
  useEffect(() => {
    listDocuments().then(setRecent).catch(() => setRecent([]));
  }, [doc.id, status]);

  // Keyboard shortcuts for undo/redo.
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

  const onImportFile = async (file: File) => {
    const text = await file.text();
    const result = importJson(text);
    if (result.ok && result.document) {
      loadDocument(result.document);
      setImportError(null);
    } else {
      setImportError(result.error ?? 'Import failed');
    }
  };

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

      <div className="modeswitch" role="tablist" title={MODES.find((m) => m.id === mode)?.hint}>
        {MODES.map((m) => (
          <button
            key={m.id}
            className={mode === m.id ? 'active' : ''}
            title={m.hint}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="spacer" />

      <button
        className="btn menu-toggle"
        aria-expanded={menuOpen}
        title="Commands"
        onClick={() => setMenuOpen((v) => !v)}
      >
        ☰
      </button>

      <div className={`btn-group${menuOpen ? ' open' : ''}`}>
        <button className="btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)">
          ↶
        </button>
        <button className="btn" onClick={redo} disabled={!canRedo} title="Redo (Shift+Ctrl/Cmd+Z)">
          ↷
        </button>

        <select
          className="btn"
          value=""
          aria-label="New document"
          onChange={(e) => {
            if (e.target.value) newDocument(e.target.value as Language);
            e.currentTarget.value = '';
          }}
        >
          <option value="">＋ New</option>
          <option value="en">English document</option>
          <option value="grc">Greek document</option>
        </select>

        <select
          className="btn"
          value=""
          aria-label="Load sample"
          onChange={(e) => {
            const d = cloneSample(e.target.value);
            if (d) loadDocument(d);
            e.currentTarget.value = '';
          }}
        >
          <option value="">Samples</option>
          {sampleEntries.map((s) => (
            <option key={s.id} value={s.id}>
              {s.language === 'grc' ? '🇬🇷 ' : ''}
              {s.title}
            </option>
          ))}
        </select>

        <select
          className="btn"
          value=""
          aria-label="Recent documents"
          onChange={(e) => {
            const found = recent.find((r) => r.id === e.target.value);
            if (found) {
              void getDocument(found.id).then((d) => d && loadDocument(d));
            }
            e.currentTarget.value = '';
          }}
        >
          <option value="">Recent</option>
          {recent.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>

        <button className="btn" onClick={() => fileRef.current?.click()}>
          Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImportFile(f);
            e.currentTarget.value = '';
          }}
        />

        <select
          className="btn"
          value=""
          aria-label="Export"
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'json') downloadDocumentJson(doc);
            else if (v === 'svg') downloadDocumentSvg(doc, { verticalScale });
            else if (v === 'png') void downloadDocumentPng(doc, 2, { verticalScale });
            else if (v === 'print') printDocument(doc, { verticalScale });
            e.currentTarget.value = '';
          }}
        >
          <option value="">Export</option>
          <option value="json">JSON</option>
          <option value="svg">SVG</option>
          <option value="png">PNG</option>
          <option value="print">Print…</option>
        </select>

        <button className="btn" onClick={onOpenUpdates} title="App updates & cache">
          ⟳
        </button>
        <button className="btn" onClick={onToggleLeft} title="Toggle left panel">
          ⟨
        </button>
        <button className="btn" onClick={onToggleRight} title="Toggle right panel">
          ⟩
        </button>
      </div>

      <div className="status">
        {importError ? (
          <span style={{ color: '#ffb4ad' }}>{importError}</span>
        ) : status === 'saving' ? (
          'Saving…'
        ) : status === 'saved' ? (
          'Saved'
        ) : status === 'error' ? (
          'Save error'
        ) : (
          ''
        )}
      </div>
    </header>
  );
}
