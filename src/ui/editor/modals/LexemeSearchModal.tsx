import { useEffect, useMemo, useState } from 'react';
import { useEditorStore } from '@/state';
import { getNode, searchLexemes, type LexemeEntry, type SearchQuery } from '@/domain/model';
import { Modal } from '@/ui/components/common/Modal';
import type { KrDocument, Language, Token } from '@/domain/schema';
import { GNT_BOOKS, loadGntBook } from '@/io/gnt';
import { OT_BOOKS, loadOtBook } from '@/io/ot';

/**
 * Add / fill a word for a textual variant, in two steps: (1) the WORD itself
 * (the surface — the actual inflected/conjugated form) and (2) an optional GLOSS.
 * The word is typed by hand precisely so CONJUGATED forms are possible — a lexeme
 * gloss alone only ever gives the dictionary form.
 *
 * Language is chosen up front:
 *   - Greek (NT) / Hebrew (OT): an OPTIONAL Strong's lookup searches a real corpus
 *     (Nestle1904 GNT / macula-hebrew OT, loaded on demand like the search picker,
 *     plus the open document) by Strong's number, lemma, or gloss. Picking an entry
 *     prefills the word (dictionary form, to inflect) and gloss, and attaches its
 *     lemma + Strong's number + part of speech — but the typed word wins.
 *   - English: just the word + optional gloss (no Strong's lexicon).
 *
 * The gloss comes along, so English-gloss mode keeps working for the new word.
 */

const MANUAL = { source: 'manual', confidence: 'high' } as const;
const DEFAULT_GRC_BOOK = 11; // Philippians — bundled for offline / first-run use
const DEFAULT_HBO_BOOK = 1; // Genesis

type Lang = 'grc' | 'hbo' | 'en';

export function LexemeSearchModal({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const doc = useEditorStore((s) => s.doc);
  const updateToken = useEditorStore((s) => s.updateToken);
  const node = getNode(doc.syntax, nodeId);
  const tokenId = node?.tokenIds[0];

  const [lang, setLang] = useState<Lang>(
    doc.language === 'hbo' ? 'hbo' : doc.language === 'en' ? 'en' : 'grc',
  );
  // Step 1 + 2: the word (surface) and its optional gloss.
  const [word, setWord] = useState('');
  const [gloss, setGloss] = useState('');
  // The looked-up lexeme backing the word (its lemma / Strong's / pos), if any.
  const [picked, setPicked] = useState<LexemeEntry | null>(null);

  // Greek/Hebrew Strong's lookup state.
  const [bookNum, setBookNum] = useState(doc.language === 'hbo' ? DEFAULT_HBO_BOOK : DEFAULT_GRC_BOOK);
  const [passages, setPassages] = useState<KrDocument[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');

  const greek = lang === 'grc';
  const english = lang === 'en';
  const books = lang === 'hbo' ? OT_BOOKS : GNT_BOOKS;

  // Load the chosen lookup book on demand (cached by the service worker), like the
  // search picker; the open document's words are searched too, so a lemma already
  // in the passage is found even offline. English has no lexicon to load.
  useEffect(() => {
    if (english) {
      setPassages(null);
      setError(null);
      setLoading(false);
      return;
    }
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
  }, [english, greek, bookNum]);

  const results = useMemo<LexemeEntry[]>(() => {
    const q: SearchQuery = { text: text.trim() };
    if (english || !q.text) return [];
    return searchLexemes([doc, ...(passages ?? [])], q);
  }, [english, text, passages, doc]);

  const changeLang = (next: Lang) => {
    if (next === lang) return;
    setLang(next);
    setWord('');
    setGloss('');
    setPicked(null);
    setText('');
    if (next === 'grc' || next === 'hbo') setBookNum(next === 'hbo' ? DEFAULT_HBO_BOOK : DEFAULT_GRC_BOOK);
  };

  // Pick a lexeme from the lookup: seed the word (dictionary form — the user then
  // inflects it) and the gloss when they're still empty, and remember its identity.
  const choose = (e: LexemeEntry) => {
    setPicked(e);
    setWord((w) => w.trim() || e.lemma);
    setGloss((g) => g.trim() || e.gloss || '');
  };

  const canAdd = Boolean(word.trim() && tokenId);
  const add = () => {
    const surface = word.trim();
    if (surface && tokenId) {
      const patch: Partial<Token> = {
        surface,
        gloss: gloss.trim() || undefined,
        language: lang as Language,
        provenance: MANUAL,
      };
      if (english) {
        patch.lemma = surface;
        patch.pos = undefined;
        patch.morphology = undefined; // no Strong's / Greek morphology on an English word
      } else {
        // The looked-up lexeme (if any) supplies the DICTIONARY lemma, Strong's, and
        // part of speech, while the typed surface stays the inflected form.
        patch.lemma = picked?.lemma || surface;
        patch.pos = picked?.pos;
        if (picked?.strong) {
          const prev = tokenOf(doc, tokenId)?.morphology;
          patch.morphology = { ...prev, extra: { ...prev?.extra, strong: picked.strong } };
        }
      }
      updateToken(tokenId, patch);
    }
    onClose();
  };

  const scriptClass = greek ? ' greek' : '';

  return (
    <Modal
      title="Add a word"
      onClose={onClose}
      className="lexeme-modal"
      footer={
        <div className="modal-buttons">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!canAdd} onClick={add}>
            Add word
          </button>
        </div>
      }
    >
      {!tokenId ? (
        <p className="hint">This element has no word slot to fill.</p>
      ) : (
        <>
          <div className="lex-source" role="group" aria-label="Word language">
            <button className={greek ? 'active' : ''} onClick={() => changeLang('grc')}>
              Greek (NT)
            </button>
            <button className={lang === 'hbo' ? 'active' : ''} onClick={() => changeLang('hbo')}>
              Hebrew (OT)
            </button>
            <button className={english ? 'active' : ''} onClick={() => changeLang('en')}>
              English
            </button>
          </div>

          {/* Step 1: the word (the actual inflected/conjugated surface form). */}
          <label className="qg-field">
            Word
            <input
              className={scriptClass.trim() || undefined}
              autoFocus
              value={word}
              placeholder={english ? 'the word…' : 'the inflected form…'}
              onChange={(e) => setWord(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && canAdd && add()}
            />
          </label>

          {/* Step 2: an optional gloss. */}
          <label className="qg-field">
            Gloss (optional)
            <input
              value={gloss}
              placeholder="English gloss…"
              onChange={(e) => setGloss(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && canAdd && add()}
            />
          </label>

          {!english && (
            <div className="lex-lookup">
              <div className="lex-source" role="group" aria-label="Lexicon book">
                <span className="lex-lookup-label">Look up a Strong’s lemma (optional)</span>
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
                className={`lex-search${scriptClass}`}
                value={text}
                placeholder="Strong’s number, lemma, or gloss…"
                onChange={(e) => setText(e.target.value)}
              />

              {picked && (
                <p className="lex-picked">
                  Using{' '}
                  <span className={scriptClass.trim() || undefined}>{picked.lemma}</span>
                  {picked.strong && ` · ${greek ? 'G' : 'H'}${picked.strong}`}
                  {picked.gloss && ` · ${picked.gloss}`}
                </p>
              )}

              {loading && <p className="hint">Loading {books.find((b) => b.num === bookNum)?.name}…</p>}
              {error && <p className="hint error">{error}</p>}
              {!loading && !error && text.trim() && results.length === 0 && (
                <p className="hint">No lexeme matches “{text.trim()}” in this book. Try another book.</p>
              )}

              <ul className="lex-results">
                {results.map((e) => (
                  <li key={e.key}>
                    <button className="lex-hit" onClick={() => choose(e)}>
                      <span className={`lex-lemma${scriptClass}`}>{e.lemma}</span>
                      {e.gloss && <span className="lex-gloss"> · {e.gloss}</span>}
                      {e.strong && <span className="lex-strong">{greek ? 'G' : 'H'}{e.strong}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="hint">
            Type the word (its inflected form), and optionally a gloss. On Greek/Hebrew you
            can look one up to attach its Strong’s lemma — then edit the word to the exact
            form you want. The gloss comes along, so English-gloss mode keeps working.
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
