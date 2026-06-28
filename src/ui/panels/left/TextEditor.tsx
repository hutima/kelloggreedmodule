import { useEditorStore } from '@/state';
import type { Language } from '@/domain/schema';

/** Sentence text + language, and the action that tokenizes it (surface order). */
export function TextEditor() {
  const doc = useEditorStore((s) => s.doc);
  const setText = useEditorStore((s) => s.setText);
  const setLanguage = useEditorStore((s) => s.setLanguage);
  const tokenizeText = useEditorStore((s) => s.tokenizeText);

  return (
    <div>
      <label className="field">
        <span>Language</span>
        <select
          value={doc.language}
          onChange={(e) => setLanguage(e.target.value as Language)}
        >
          <option value="en">English</option>
          <option value="grc">Koine / Biblical Greek</option>
        </select>
      </label>

      <label className="field">
        <span>Sentence text</span>
        <textarea
          className={doc.language === 'grc' ? 'greek' : undefined}
          style={{ minHeight: 120, fontSize: 16 }}
          value={doc.text}
          placeholder={
            doc.language === 'grc' ? 'Ἐν ἀρχῇ ἦν ὁ λόγος.' : 'Type a sentence…'
          }
          onChange={(e) => setText(e.target.value)}
        />
      </label>

      <button className="mini accept" onClick={tokenizeText}>
        Tokenize →
      </button>
      <p className="hint" style={{ marginTop: 10 }}>
        Tokenizing splits the text into surface tokens. Token order records word
        order only — syntactic structure is built separately, so free word order
        and discontinuous constituents are fully supported.
      </p>
    </div>
  );
}
