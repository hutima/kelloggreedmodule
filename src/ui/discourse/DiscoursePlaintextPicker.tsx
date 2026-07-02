import { useState } from 'react';
import { useDiscourseStore } from '@/state';

/**
 * DISCOURSE "NEW TEXT" LOADER — paste arbitrary prose and load it directly as a
 * discourse document (sentence units), the Discourse analogue of syntax mode's
 * "New" entry but far simpler: NO LLM prompt, NO syntax parse, NO `KrDocument`.
 * It writes ONLY to the discourse store; the syntax passage is untouched.
 *
 * Kept visually subordinate to the range loader — a textarea, an optional title,
 * and a Load button. Utility, not a new nave.
 */
export function DiscoursePlaintextPicker() {
  const loadPlainText = useDiscourseStore((s) => s.loadPlainText);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canLoad = text.trim().length > 0;

  const load = () => {
    setError(null);
    const ok = loadPlainText(text, title.trim() || undefined);
    if (!ok) setError('No sentences were found — paste some text and try again.');
  };

  return (
    <div className="gnt-picker discourse-plaintext">
      <p className="discourse-blurb">
        Paste any text — a paragraph, a translation, your own notes — and load it
        straight into Discourse mode as sentence units. It’s split into sentences
        and tokenized locally; no AI parse and no Greek/Hebrew tagging are added,
        and your open syntax passage isn’t touched.
      </p>
      <label className="field">
        <span>Title (optional)</span>
        <input
          type="text"
          value={title}
          placeholder="e.g. Sermon draft, Romans paraphrase…"
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="field">
        <span>Text</span>
        <textarea
          className="discourse-plaintext-input"
          rows={8}
          value={text}
          placeholder="Paste or type text here. Sentences (. ? !) become units; blank lines separate paragraphs."
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {error && <p className="discourse-error">{error}</p>}
      <div className="row">
        <button className="mini accept" disabled={!canLoad} onClick={load}>
          Load text
        </button>
      </div>
    </div>
  );
}
