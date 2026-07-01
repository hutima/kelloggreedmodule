import { useEffect, useMemo, useState } from 'react';
import { useEditorStore } from '@/state';
import { getNode, searchLexemes, type LexemeEntry, type SearchQuery } from '@/domain/model';
import { Modal } from '@/ui/components/common/Modal';
import type { KrDocument, Language, Token } from '@/domain/schema';
import { GNT_BOOKS, loadGntBook } from '@/io/gnt';
import { OT_BOOKS, loadOtBook } from '@/io/ot';

/**
 * Assign a Greek / Hebrew Strong's LEMMA to a word by searching a corpus for it
 * (by Strong's number, lemma, or English gloss). This is what fills a BLANK word
 * added for a textual variant: pick a lexeme and its lemma + gloss + Strong's +
 * part of speech drop onto the word. The surface starts as the dictionary form;
 * the user then edits it to the inflected variant reading, and (because the gloss
 * comes along) the English-gloss toggle keeps working for the new word.
 *
 * The lexicon is a real book (Nestle1904 GNT / macula-hebrew OT), loaded on demand
 * exactly like the search picker, plus the open document's own words — so common
 * lexemes are found offline (Philippians is bundled) and a wider net is one book
 * pick away.
 */

const MANUAL = { source: 'manual', confidence: 'high' } as const;
const DEFAULT_GRC_BOOK = 11; // Philippians — bundled for offline / first-run use
const DEFAULT_HBO_BOOK = 1; // Genesis

export function LexemeSearchModal({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const doc = useEditorStore((s) => s.doc);
  const updateToken = useEditorStore((s) => s.updateToken);
  const node = getNode(doc.syntax, nodeId);
  const tokenId = node?.tokenIds[0];

  const [lang, setLang] = useState<'grc' | 'hbo'>(doc.language === 'hbo' ? 'hbo' : 'grc');
  const [bookNum, setBookNum] = useState(doc.language === 'hbo' ? DEFAULT_HBO_BOOK : DEFAULT_GRC_BOOK);
  const [passages, setPassages] = useState<KrDocument[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');

  const books = lang === 'hbo' ? OT_BOOKS : GNT_BOOKS;
  const greek = lang === 'grc';

  // Load the chosen book's passages on demand (cached by the service worker),
  // exactly like the search picker. The open document's own words are always
  // searched too, so a lemma already in the passage is found even offline.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPassages(null);
    (async () => {
      try {
        const docs = greek
          ? await loadGntBook(GNT_BOOKS.find((b) => b.num === bookNum)!)
          : await loadOtBook(OT_BOOKS.find((b) => b.num === bookNum)!);
        if (!cancelled) setPassages(docs);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [greek, bookNum]);

  const results = useMemo<LexemeEntry[]>(() => {
    const q: SearchQuery = { text: text.trim() };
    if (!q.text) return [];
    return searchLexemes([doc, ...(passages ?? [])], q);
  }, [text, passages, doc]);

  const changeLang = (next: 'grc' | 'hbo') => {
    if (next === lang) return;
    setLang(next);
    setBookNum(next === 'hbo' ? DEFAULT_HBO_BOOK : DEFAULT_GRC_BOOK);
  };

  const assign = (e: LexemeEntry) => {
    if (tokenId) {
      const patch: Partial<Token> = {
        surface: e.lemma, // start at the dictionary form; edit to the inflected variant
        lemma: e.lemma,
        gloss: e.gloss,
        pos: e.pos,
        language: lang as Language,
        provenance: MANUAL,
      };
      // Carry the Strong's number so the word gets the same one-tap lemma search
      // (and lexeme identity) as the gold-standard words.
      if (e.strong) {
        const prev = tokenOf(doc, tokenId)?.morphology;
        patch.morphology = { ...prev, extra: { ...prev?.extra, strong: e.strong } };
      }
      updateToken(tokenId, patch);
    }
    onClose();
  };

  return (
    <Modal
      title="Add a word — search Strong’s, lemma, or gloss"
      onClose={onClose}
      className="lexeme-modal"
      footer={
        <div className="modal-buttons">
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      }
    >
      {!tokenId ? (
        <p className="hint">This element has no word slot to fill.</p>
      ) : (
        <>
          <div className="lex-source" role="group" aria-label="Lexicon language">
            <button className={greek ? 'active' : ''} onClick={() => changeLang('grc')}>
              Greek (NT)
            </button>
            <button className={!greek ? 'active' : ''} onClick={() => changeLang('hbo')}>
              Hebrew (OT)
            </button>
            <select
              aria-label="Lexicon book"
              value={bookNum}
              onChange={(e) => setBookNum(Number(e.target.value))}
              title="The book whose words are searched (a wider lexicon is one pick away)"
            >
              {books.map((b) => (
                <option key={b.num} value={b.num}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <input
            className={`lex-search${greek ? ' greek' : ''}`}
            autoFocus
            value={text}
            placeholder="Strong’s number, lemma, or gloss…"
            onChange={(e) => setText(e.target.value)}
          />

          {loading && <p className="hint">Loading {books.find((b) => b.num === bookNum)?.name}…</p>}
          {error && <p className="hint error">{error}</p>}

          {!loading && !error && text.trim() && results.length === 0 && (
            <p className="hint">No lexeme matches “{text.trim()}” in this book. Try another book.</p>
          )}

          <ul className="lex-results">
            {results.map((e) => (
              <li key={e.key}>
                <button className="lex-hit" onClick={() => assign(e)}>
                  <span className={`lex-lemma${greek ? ' greek' : ''}`}>{e.lemma}</span>
                  {e.gloss && <span className="lex-gloss"> · {e.gloss}</span>}
                  {e.strong && <span className="lex-strong">{greek ? 'G' : 'H'}{e.strong}</span>}
                </button>
              </li>
            ))}
          </ul>

          <p className="hint">
            Picks the lexeme’s dictionary form; edit the word’s surface to your inflected
            variant afterward. The gloss comes along, so English-gloss mode still works.
          </p>
        </>
      )}
    </Modal>
  );
}

/** The token behind an id, if any (for merging onto its existing morphology). */
function tokenOf(doc: KrDocument, id: string): Token | undefined {
  return doc.tokens.find((t) => t.id === id);
}
