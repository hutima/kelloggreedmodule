import { useState } from 'react';
import { useDiscourseStore } from '@/state';
import {
  diffDiscourseDocuments,
  discourseDocumentJson,
  discourseOutlineMarkdown,
  discoursePatchJson,
  discourseRelationsCsv,
  discourseRelationsMarkdown,
} from '@/domain/discourse';
import { downloadText, slugify, copyText } from '@/io';

/**
 * Export options for the discourse analysis. The discourse view is HTML (text
 * blocks, not layout geometry), so the exports are TEXT forms: the full
 * document as JSON, the compact edit patch as JSON, the outline as Markdown,
 * and the relation table as Markdown/CSV. SVG/PNG diagram export stays with
 * the syntax visualizations and is honestly not offered here.
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
          SVG/PNG diagram export applies to the syntax visualizations (they render
          layout geometry). The discourse outline is a text analysis — these text
          exports are its faithful forms. Printing the app view also works.
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
