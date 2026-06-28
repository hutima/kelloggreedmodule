import { useState } from 'react';
import { useEditorStore } from '@/state';
import { buildParsePrompt } from '@/domain/prompt';
import { copyText } from '@/io';
import type { Language } from '@/domain/schema';

/** Sentence text + language, and the action that tokenizes it (surface order). */
export function TextEditor() {
  const doc = useEditorStore((s) => s.doc);
  const setText = useEditorStore((s) => s.setText);
  const setLanguage = useEditorStore((s) => s.setLanguage);
  const tokenizeText = useEditorStore((s) => s.tokenizeText);
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    const ok = await copyText(buildParsePrompt({ text: doc.text, language: doc.language }));
    setCopied(ok);
    setTimeout(() => setCopied(false), 2000);
  };

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

      <div className="row" style={{ alignItems: 'center' }}>
        <button className="mini accept" onClick={tokenizeText}>
          Tokenize →
        </button>
        <button className="mini" onClick={copyPrompt} title="Copy a ready-to-use LLM prompt that parses and tags this sentence into importable JSON">
          {copied ? '✓ Copied' : 'Copy parse prompt'}
        </button>
      </div>

      <p className="hint" style={{ marginTop: 10 }}>
        Tokenizing splits the text into surface tokens. Token order records word
        order only — syntactic structure is built separately, so free word order
        and discontinuous constituents are fully supported.
      </p>
      <p className="hint" style={{ marginTop: 6 }}>
        <strong>Copy parse prompt</strong> puts a prompt on your clipboard for any
        chat model. Run it, then paste the JSON it returns into the <em>JSON</em>{' '}
        tab and click Apply.
      </p>
    </div>
  );
}
