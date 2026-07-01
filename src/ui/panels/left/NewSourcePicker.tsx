import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '@/state';
import { detectLanguage, stripPunctuation, tokenize } from '@/domain/model';
import { buildLlmPrompt, importLlmDiagrams, importJson, copyText, downloadText, slugify } from '@/io';
import {
  isCombinedPassage,
  getAlternateReadings,
  userIssueId,
  alignedDiff,
  type VariantInput,
} from '@/domain/contested';
import { useViewport } from '@/ui/responsive';
import { Modal } from '@/ui/components/common/Modal';
import type { KrDocument, Language } from '@/domain/schema';

const LANG_LABEL: Record<Language, string> = {
  en: 'English',
  grc: 'Greek (Koine)',
  hbo: 'Hebrew (Biblical)',
};

interface ParsedDiagrams {
  ok: boolean;
  documents?: KrDocument[];
  /** Alternate readings per document (aligned with `documents`). */
  variantsByDoc?: VariantInput[][];
  error?: string;
}

/** Parse pasted/loaded text as the compact LLM format (one OR several sentences,
 *  possibly with alternate readings) or a full KrDocument — always a list of docs. */
function parseDiagrams(raw: string): ParsedDiagrams {
  const llm = importLlmDiagrams(raw);
  if (llm.ok) return llm;
  const full = importJson(raw);
  if (full.ok && full.document) return { ok: true, documents: [full.document] };
  // Surface the friendlier of the two messages (LLM-format parse first).
  return { ok: false, error: llm.error ?? full.error ?? 'Could not read that diagram.' };
}

/**
 * "New" source — a free-text typing window instead of a passage list. Type (or
 * paste) a sentence and Create a starter diagram: it is tokenized and run through
 * the inference engine so a rough, fully-editable parse is populated for you.
 *
 * For a fuller parse, Export builds a prompt + tokenized sentence to paste into an
 * LLM (Claude / ChatGPT); Import ingests the JSON the LLM returns and turns it
 * into a diagram. The ⓘ button explains the round-trip.
 */
export function NewSourcePicker() {
  const createFromText = useEditorStore((s) => s.createFromText);
  const loadDocument = useEditorStore((s) => s.loadDocument);
  const setGntContext = useEditorStore((s) => s.setGntContext);
  const setAppMode = useEditorStore((s) => s.setAppMode);
  const setLeftCollapsed = useEditorStore((s) => s.setLeftCollapsed);
  const customParses = useEditorStore((s) => s.customParses);
  const saveCurrentAsCustom = useEditorStore((s) => s.saveCurrentAsCustom);
  const openCustomParse = useEditorStore((s) => s.openCustomParse);
  const removeCustomParse = useEditorStore((s) => s.removeCustomParse);
  const isCustomDoc = useEditorStore((s) => s.corpus === 'custom' && s.baseDoc === null);
  const currentDoc = useEditorStore((s) => s.doc);
  const importAsVariants = useEditorStore((s) => s.importAsVariants);
  const saveWithVariants = useEditorStore((s) => s.saveWithVariants);
  // Re-derive the imported-reading count when the contested selection changes
  // (import / delete both update it), so the Save-with-readings button stays live.
  const contestedTick = useEditorStore((s) => s.contested.selectedContestedIssueId);
  const docId = currentDoc.id;
  const vp = useViewport();

  // A variant attaches to a SINGLE loaded source sentence; block it while a
  // combined (multi-sentence) passage is open, and when nothing real is loaded.
  const canAttachVariant = currentDoc.tokens.length > 0 && !isCombinedPassage(currentDoc);
  // How many imported readings the current passage carries (drives Save-with-readings).
  void contestedTick;
  const variantCount = getAlternateReadings(userIssueId(currentDoc.id)).length;

  const [saved, setSaved] = useState(false);
  useEffect(() => setSaved(false), [docId]); // a different doc hasn't been saved yet
  const saveCurrent = () => {
    saveCurrentAsCustom();
    setSaved(true);
  };

  const [text, setText] = useState('');
  const [promptText, setPromptText] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [ignorePunctuation, setIgnorePunctuation] = useState(false);
  const [askVariants, setAskVariants] = useState(false);
  const [outputAsFile, setOutputAsFile] = useState(false);
  const [matchWarning, setMatchWarning] = useState<string[] | null>(null);

  const ready = text.trim().length > 0;
  // Language is auto-detected from the script (Greek / Hebrew / English), so there
  // is no error-prone dropdown to keep in sync — the words decide.
  const language: Language = detectLanguage(text);

  /** On a narrow screen, free the room for the diagram once a doc is loaded. */
  const collapseIfNarrow = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches) {
      setLeftCollapsed(true);
    }
  };

  const create = () => {
    if (!ready) return;
    createFromText(text.trim(), language);
    if (vp.isDesktop) setAppMode('edit');
    collapseIfNarrow();
  };

  const exportForLlm = () => {
    if (!ready) return;
    // With "ignore punctuation" on, strip editorial punctuation before tokenizing
    // and ask the model to infer its own — useful for unpointed Greek/Hebrew.
    const source = ignorePunctuation ? stripPunctuation(text.trim()) : text.trim();
    const tokens = tokenize(source, language);
    setPromptText(
      buildLlmPrompt(source, tokens, language, {
        inferPunctuation: ignorePunctuation,
        variants: askVariants,
        outputFile: outputAsFile,
      }),
    );
  };

  /**
   * Load parsed diagram document(s). Normally the first opens as a new canvas (the
   * rest become a prev/next context), and each sentence's alternate readings are
   * attached to it. When `asVariants` is set, NOTHING opens: every imported parse
   * (and its own alternates) attaches to the CURRENT passage as a variant reading.
   */
  const acceptDocuments = (parsed: ParsedDiagrams, asVariants: boolean) => {
    const documents = parsed.documents ?? [];
    if (!documents.length) return;
    const variantsByDoc = parsed.variantsByDoc ?? [];

    if (asVariants && canAttachVariant) {
      // Each imported document becomes a variant reading of the current passage;
      // its own alternates come along too (labelled under it).
      const variants: VariantInput[] = [];
      documents.forEach((d, i) => {
        variants.push({ label: d.title || 'Imported reading', doc: d });
        for (const v of variantsByDoc[i] ?? []) variants.push(v);
      });
      importAsVariants(variants, { targetDoc: currentDoc });
      // Warn about any reading that couldn't be aligned to the base for diffing.
      const unmatched = variants
        .filter((v) => !alignedDiff(currentDoc, v.doc, v.diffWords).matched)
        .map((v) => v.label);
      if (unmatched.length) setMatchWarning(unmatched);
      if (vp.isDesktop) setAppMode('explore');
      collapseIfNarrow();
      return;
    }

    loadDocument(documents[0]!, { corpus: 'custom' });
    if (documents.length > 1) setGntContext(documents, 0);
    // Attach each sentence's alternate readings to that sentence's own diagram.
    const unmatched: string[] = [];
    documents.forEach((d, i) => {
      const vs = variantsByDoc[i] ?? [];
      if (vs.length) importAsVariants(vs, { targetDoc: d });
      for (const v of vs) if (!alignedDiff(d, v.doc, v.diffWords).matched) unmatched.push(v.label);
    });
    if (unmatched.length) setMatchWarning(unmatched);
    if (vp.isDesktop) setAppMode('edit');
    collapseIfNarrow();
  };

  return (
    <div className="gnt-picker new-picker">
      <label className="field">
        <span>
          Sentence{' '}
          {ready && (
            <span className="lang-detected" style={{ color: 'var(--muted, #667)', fontWeight: 400 }}>
              · {LANG_LABEL[language]} (auto-detected)
            </span>
          )}
        </span>
        <textarea
          className="new-text"
          rows={4}
          value={text}
          placeholder="Type or paste a sentence to diagram…"
          onChange={(e) => setText(e.target.value)}
        />
      </label>

      <div className="row">
        <button className="mini accept" disabled={!ready} onClick={create}>
          Create diagram
        </button>
        {isCustomDoc && variantCount === 0 && (
          <button className="mini" title="Save this diagram to your sentences" onClick={saveCurrent}>
            {saved ? 'Saved ✓' : 'Save'}
          </button>
        )}
        {variantCount > 0 && (
          <button
            className="mini"
            title="Save this sentence with all its imported readings to your sentences"
            onClick={() => {
              saveWithVariants();
              setSaved(true);
            }}
          >
            {saved ? 'Saved ✓' : `Save with readings (${variantCount})`}
          </button>
        )}
      </div>

      <label className="check-row" title="Strip punctuation and let the LLM infer the most likely sentence breaks and attachments">
        <input
          type="checkbox"
          checked={ignorePunctuation}
          onChange={(e) => setIgnorePunctuation(e.target.checked)}
        />
        <span>Ignore punctuation (LLM infers it)</span>
      </label>
      <label className="check-row" title="Ask the LLM to also return plausible alternate readings (ambiguous attachments, participles, punctuation) with a note on each">
        <input
          type="checkbox"
          checked={askVariants}
          onChange={(e) => setAskVariants(e.target.checked)}
        />
        <span>Include alternate readings (variants)</span>
      </label>
      <label className="check-row" title="Ask the LLM to return a downloadable .json file instead of pasting the JSON into the chat">
        <input
          type="checkbox"
          checked={outputAsFile}
          onChange={(e) => setOutputAsFile(e.target.checked)}
        />
        <span>Ask for a downloadable file (not chat text)</span>
      </label>

      <div className="row new-actions">
        <button className="mini" disabled={!ready} title="Build a prompt for an LLM" onClick={exportForLlm}>
          Export
        </button>
        <button className="mini" title="Paste or load an LLM / exported diagram" onClick={() => setImportOpen(true)}>
          Import
        </button>
        <button
          className="mini info-btn"
          aria-label="About LLM-assisted diagramming"
          title="About LLM-assisted diagramming"
          onClick={() => setInfoOpen(true)}
        >
          ⓘ
        </button>
      </div>

      <p style={{ fontSize: 12, color: 'var(--muted, #667)' }}>
        A general diagramming workspace: Create auto-tags a rough starter you edit by hand
        (auto-tagging is approximate — expect to correct it). For a fuller first pass, Export → an
        LLM → Import. The ⓘ explains how.
      </p>

      {customParses.length > 0 && (
        <div className="gnt-passages">
          <div className="gnt-actions">
            <span className="gnt-all">
              <span>My sentences: {customParses.length}</span>
            </span>
          </div>
          <ul className="gnt-list">
            {customParses.map((c) => (
              <li key={c.id}>
                <label className={`gnt-sentence${c.id === docId ? ' checked' : ''}`}>
                  <button
                    type="button"
                    className="link-btn custom-open"
                    title="Open this saved sentence"
                    onClick={() => openCustomParse(c.id)}
                  >
                    {c.title || c.preview || 'Untitled'}
                  </button>
                  <button
                    type="button"
                    className="mini reject custom-del"
                    title="Delete this saved sentence"
                    aria-label={`Delete ${c.title}`}
                    onClick={() => {
                      if (
                        typeof window === 'undefined' ||
                        window.confirm('Delete this saved sentence?')
                      ) {
                        removeCustomParse(c.id);
                      }
                    }}
                  >
                    ✕
                  </button>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {matchWarning && (
        <Modal
          title="Variant loaded without analysis"
          onClose={() => setMatchWarning(null)}
          footer={
            <button className="btn primary" onClick={() => setMatchWarning(null)}>
              Got it
            </button>
          }
        >
          <p>
            {matchWarning.length === 1 ? 'This reading' : 'These readings'} could not be matched to
            the base sentence, so {matchWarning.length === 1 ? 'it was' : 'they were'} loaded{' '}
            <strong>without difference analysis</strong>. You can still switch between the base and{' '}
            {matchWarning.length === 1 ? 'the reading' : 'each reading'} in the readings panel.
          </p>
          <ul>
            {matchWarning.map((label, i) => (
              <li key={i}>{label}</li>
            ))}
          </ul>
        </Modal>
      )}
      {promptText !== null && (
        <LlmExportModal text={promptText} title={text} onClose={() => setPromptText(null)} />
      )}
      {infoOpen && <LlmWorkflowModal onClose={() => setInfoOpen(false)} />}
      {importOpen && (
        <ImportDiagramModal
          canAttachVariant={canAttachVariant}
          attachTitle={currentDoc.title}
          onClose={() => setImportOpen(false)}
          onImport={(parsed, asVariants) => {
            acceptDocuments(parsed, asVariants);
            setImportOpen(false);
          }}
        />
      )}
    </div>
  );
}

/** Paste JSON (or load a .json file) and confirm to import a diagram (optionally
 *  as variant readings of the currently-open passage). */
function ImportDiagramModal({
  onClose,
  onImport,
  canAttachVariant,
  attachTitle,
}: {
  onClose: () => void;
  onImport: (parsed: ParsedDiagrams, asVariants: boolean) => void;
  canAttachVariant: boolean;
  attachTitle: string;
}) {
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [asVariants, setAsVariants] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const confirm = () => {
    const res = parseDiagrams(raw);
    if (!res.ok || !res.documents?.length) {
      setError(res.error ?? 'Could not read that diagram.');
      return;
    }
    onImport(res, asVariants && canAttachVariant);
  };

  const loadFile = async (file: File) => {
    setError(null);
    setRaw(await file.text());
  };

  return (
    <Modal
      title="Import a diagram"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Choose .json file…
          </button>
          <button className="btn primary" disabled={!raw.trim()} onClick={confirm}>
            Import
          </button>
        </>
      }
    >
      <p>
        Paste the JSON an LLM returned (the compact <code>scripture-diagrammer/diagram</code> format)
        or a full exported diagram — or load it from a file. Then press <strong>Import</strong>.
      </p>
      <textarea
        className="new-text"
        rows={14}
        value={raw}
        placeholder='{ "kind": "scripture-diagrammer/diagram", … }'
        onChange={(e) => {
          setRaw(e.target.value);
          setError(null);
        }}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
      />
      {error && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</p>}
      {canAttachVariant ? (
        <label className="check-row" title="Attach the imported parse(s) as variant readings of the currently-open passage, instead of opening a new diagram">
          <input type="checkbox" checked={asVariants} onChange={(e) => setAsVariants(e.target.checked)} />
          <span>
            Load as variant reading of “{attachTitle}” (instead of a new diagram)
          </span>
        </label>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--muted, #667)' }}>
          Open a single source sentence to attach this as a variant reading of it.
        </p>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void loadFile(f);
          e.target.value = '';
        }}
      />
    </Modal>
  );
}

/** Shows the generated LLM prompt with Copy / Download. */
function LlmExportModal({ text, title, onClose }: { text: string; title: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    setCopied(await copyText(text));
  };
  const download = () => downloadText(text, `${slugify(title || 'sentence')}-llm-prompt.txt`, 'text/plain');
  return (
    <Modal
      title="Export for an LLM"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={download}>
            Download .txt
          </button>
          <button className="btn primary" onClick={() => void copy()}>
            {copied ? 'Copied ✓' : 'Copy prompt'}
          </button>
        </>
      }
    >
      <p>
        Copy this prompt into Claude or ChatGPT. It returns a JSON diagram you can bring back with
        <strong> Import</strong>.
      </p>
      <textarea className="new-text" readOnly rows={14} value={text} style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }} />
    </Modal>
  );
}

/** Explains the LLM-assisted round-trip. */
function LlmWorkflowModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="LLM-assisted diagramming"
      onClose={onClose}
      wide
      className="help-modal"
      footer={
        <button className="btn primary" onClick={onClose}>
          Got it
        </button>
      }
    >
      <p>
        A large language model (such as Claude or ChatGPT) can parse a sentence into a syntax
        diagram for you. The round-trip is:
      </p>
      <ol>
        <li>Type your sentence and press <strong>Export</strong>.</li>
        <li>
          <strong>Copy</strong> the prompt and paste it into the LLM. The prompt already contains
          the sentence, the tokens to reference, the exact output format, and the allowed
          grammatical labels.
        </li>
        <li>
          The model replies with one JSON object (or an array of them, one per sentence, for a
          multi-sentence paste). Save it as a <code>.json</code> file (or paste it into one).
        </li>
        <li>
          Press <strong>Import</strong> and choose that file. The diagram loads as a new document,
          ready to refine by hand.
        </li>
      </ol>
      <p style={{ color: 'var(--muted, #667)' }}>
        Prefer to stay offline? <strong>Create diagram</strong> auto-tags a starter parse with the
        built-in inference engine — no model required — which you can then edit directly.
      </p>
      <p style={{ color: 'var(--muted, #667)', fontSize: 12 }}>
        Note: an LLM can make mistakes. Always check the imported diagram against the grammar
        yourself; nothing is sent anywhere automatically — you control the copy and paste.
      </p>
    </Modal>
  );
}
