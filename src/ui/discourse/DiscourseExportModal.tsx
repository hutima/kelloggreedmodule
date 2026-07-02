import { useState } from 'react';
import { useDiscourseStore } from '@/state';
import {
  diffDiscourseDocuments,
  discourseDocumentJson,
  discourseOutlineHtml,
  discourseOutlineMarkdown,
  discourseOutlineSvg,
  discoursePatchJson,
  discourseRelationsCsv,
  discourseRelationsMarkdown,
} from '@/domain/discourse';
import { downloadText, slugify, copyText, printHtmlDocument } from '@/io';

/**
 * Export options for the discourse analysis. The discourse view is HTML (text
 * blocks, not layout geometry), so the exports are the outline's faithful
 * forms: a print-ready HTML document (Save as PDF) and a vector SVG of the
 * outline, plus the full document / edit patch as JSON, the outline as
 * Markdown, and the relation table as Markdown/CSV.
 */
export function DiscourseExportModal({ onClose }: { onClose: () => void }) {
  const doc = useDiscourseStore((s) => s.doc);
  const baseDoc = useDiscourseStore((s) => s.baseDoc);
  const [includeText, setIncludeText] = useState(true);
  const [includeGlosses, setIncludeGlosses] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!doc) return null;
  const stem = slugify(doc.title || 'discourse');
  const hasEdits = !!baseDoc && baseDoc.id === doc.id;
  const relationCount = doc.relations.length;

  const outline = () => discourseOutlineMarkdown(doc, { includeText, includeGlosses });
  const renderOpts = { includeText, includeGlosses };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="discourseExportTitle"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 460 }}
      >
        <h2 className="modal-title" id="discourseExportTitle">
          Export discourse analysis
        </h2>
        <p className="hint">
          {doc.title} — {doc.units.filter((u) => u.tokenIds.length > 0).length} units,{' '}
          {relationCount} relation{relationCount === 1 ? '' : 's'}.
        </p>

        <h3 style={{ fontSize: 13, margin: '12px 0 4px' }}>Outline (Markdown)</h3>
        <label className="checkbox-row">
          <input type="checkbox" checked={includeText} onChange={(e) => setIncludeText(e.target.checked)} />
          <span>Include source text</span>
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={includeGlosses} onChange={(e) => setIncludeGlosses(e.target.checked)} />
          <span>Include English glosses</span>
        </label>
        <div className="row" style={{ margin: '6px 0 10px' }}>
          <button
            className="mini accept"
            onClick={() => downloadText(outline(), `${stem}-outline.md`, 'text/markdown')}
          >
            Download .md
          </button>
          <button
            className="mini"
            onClick={() => {
              void copyText(outline()).then((ok) => setCopied(ok));
            }}
          >
            {copied ? 'Copied ✓' : 'Copy to clipboard'}
          </button>
        </div>

        <h3 style={{ fontSize: 13, margin: '12px 0 4px' }}>Document (PDF / SVG)</h3>
        <div className="row" style={{ margin: '6px 0 10px' }}>
          <button
            className="mini accept"
            title="Open a print-ready outline — choose “Save as PDF” in the print dialog"
            onClick={() => printHtmlDocument(discourseOutlineHtml(doc, renderOpts))}
          >
            Save as PDF…
          </button>
          <button
            className="mini"
            title="Download the outline as a self-contained vector SVG"
            onClick={() =>
              downloadText(discourseOutlineSvg(doc, renderOpts), `${stem}-outline.svg`, 'image/svg+xml')
            }
          >
            Download .svg
          </button>
        </div>

        <h3 style={{ fontSize: 13, margin: '12px 0 4px' }}>Data (JSON)</h3>
        <div className="row" style={{ margin: '6px 0 10px' }}>
          <button
            className="mini"
            onClick={() => downloadText(discourseDocumentJson(doc), `${stem}.discourse.json`, 'application/json')}
          >
            Document
          </button>
          <button
            className="mini"
            disabled={!hasEdits}
            title={hasEdits ? 'Just your edits, as a compact diff against the generated base' : 'No base to diff against'}
            onClick={() => {
              if (!baseDoc) return;
              const patch = diffDiscourseDocuments(baseDoc, doc, new Date().toISOString());
              downloadText(discoursePatchJson(patch), `${stem}.discourse-patch.json`, 'application/json');
            }}
          >
            Edits (patch)
          </button>
        </div>

        <h3 style={{ fontSize: 13, margin: '12px 0 4px' }}>Relations</h3>
        <div className="row" style={{ margin: '6px 0 10px' }}>
          <button
            className="mini"
            disabled={!relationCount}
            onClick={() => downloadText(discourseRelationsMarkdown(doc), `${stem}-relations.md`, 'text/markdown')}
          >
            Table (.md)
          </button>
          <button
            className="mini"
            disabled={!relationCount}
            onClick={() => downloadText(discourseRelationsCsv(doc), `${stem}-relations.csv`, 'text/csv')}
          >
            Table (.csv)
          </button>
        </div>

        <p className="hint" style={{ marginTop: 10 }}>
          The discourse outline is a text analysis. <strong>Save as PDF</strong> opens
          a print-ready outline (choose “Save as PDF” in your browser’s print dialog);
          <strong> .svg</strong> is the same outline as a vector file. Markdown, JSON,
          and the relation table are its other faithful forms.
        </p>

        <div className="modal-actions">
          <button className="mini" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
