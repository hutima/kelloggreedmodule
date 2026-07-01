import { useEffect, useMemo, useState } from 'react';
import type { KrDocument } from '@/domain/schema';
import type { DiagramMode, TreeOrientation } from '@/domain/layout';
import {
  documentNaturalSize,
  downloadDocumentPng,
  downloadDocumentSvg,
  downloadDocumentJson,
  printDocument,
} from '@/io';

/**
 * Export dialog. The diagram is vector, so SVG exports at any size; PNG lets the
 * reader pick exact pixel dimensions (aspect-locked to the diagram). JSON and
 * Print are offered as secondary actions. Export honours the active diagram
 * `mode` AND the on-screen language (the glossed `doc`), so what you see is what
 * you export. JSON falls back to `sourceDoc` (the un-glossed model) so a data
 * export still round-trips in the source language.
 */
export function ExportModal({
  doc,
  sourceDoc,
  verticalScale,
  treeOrientation,
  rtl,
  colorMode,
  mode,
  onClose,
}: {
  doc: KrDocument;
  sourceDoc?: KrDocument;
  verticalScale: number;
  treeOrientation?: TreeOrientation;
  /** Effective right-to-left flag (RTL doc, unless the flip toggle un-mirrors it). */
  rtl?: boolean;
  /** Tint words by grammatical category — the on-screen grammar-colour toggle. */
  colorMode?: boolean;
  mode: DiagramMode;
  onClose: () => void;
}) {
  const jsonDoc = sourceDoc ?? doc;
  // Carry the on-screen options so the export matches the canvas exactly.
  const opts = { verticalScale, treeOrientation, rtl, colorMode };
  const natural = useMemo(
    () => documentNaturalSize(doc, opts, mode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, verticalScale, treeOrientation, rtl, colorMode, mode],
  );
  const aspect = natural.height / natural.width;

  const [format, setFormat] = useState<'png' | 'svg'>('png');
  // Default PNG to 2× the natural size — a crisp, print-friendly raster.
  const [width, setWidth] = useState(() => natural.width * 2);
  const [busy, setBusy] = useState(false);
  const height = Math.round(width * aspect);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setW = (v: number) => setWidth(Math.max(16, Math.min(20000, Math.round(v || 0))));

  const doExport = async () => {
    if (format === 'svg') {
      downloadDocumentSvg(doc, opts, mode);
      onClose();
      return;
    }
    setBusy(true);
    try {
      await downloadDocumentPng(doc, width / natural.width, opts, mode);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal export-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Export diagram"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>Export diagram</h2>
          <button className="modal-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="export-formats" role="radiogroup" aria-label="Format">
          <button
            role="radio"
            aria-checked={format === 'png'}
            className={format === 'png' ? 'active' : ''}
            onClick={() => setFormat('png')}
          >
            PNG
            <small>raster image</small>
          </button>
          <button
            role="radio"
            aria-checked={format === 'svg'}
            className={format === 'svg' ? 'active' : ''}
            onClick={() => setFormat('svg')}
          >
            SVG
            <small>vector, any size</small>
          </button>
        </div>

        {format === 'png' ? (
          <div className="export-dims">
            <label>
              Width
              <input
                type="number"
                min={16}
                value={width}
                onChange={(e) => setW(Number(e.target.value))}
              />
              px
            </label>
            <span className="export-times">×</span>
            <label>
              Height
              <input
                type="number"
                min={16}
                value={height}
                onChange={(e) => setW(Number(e.target.value) / aspect)}
              />
              px
            </label>
            <div className="export-presets">
              {[1, 2, 4].map((m) => (
                <button key={m} onClick={() => setW(natural.width * m)}>
                  {m}×
                </button>
              ))}
            </div>
            <p className="export-hint">
              Natural size {natural.width} × {natural.height} px. Aspect ratio is locked.
            </p>
          </div>
        ) : (
          <p className="export-hint">
            Scalable vector — sharp at any zoom or print size. ({natural.width} × {natural.height}{' '}
            px natural.)
          </p>
        )}

        <div className="modal-actions">
          <div className="export-secondary">
            <button className="link-btn" onClick={() => downloadDocumentJson(jsonDoc)}>
              JSON
            </button>
            <button className="link-btn" onClick={() => printDocument(doc, opts, mode)}>
              Print…
            </button>
          </div>
          <div className="modal-buttons">
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" onClick={doExport} disabled={busy}>
              {busy ? 'Exporting…' : `Export ${format.toUpperCase()}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
