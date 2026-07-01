import { useEffect, useMemo, useState } from 'react';
import { useEditorStore } from '@/state';
import { getNode } from '@/domain/model';
import { Modal } from '@/ui/components/common/Modal';
import type { KrDocument, Language, Token } from '@/domain/schema';
import { loadStrongs, searchStrongs, type StrongsEntry } from '@/io/strongs';

/**
 * Add / fill a word for a textual variant, in two steps: (1) the WORD (its actual
 * inflected/conjugated surface) and (2) — for Greek/Hebrew — a GLOSS that doubles
 * as a Strong's search.
 *
 *   - Greek (NT) / Hebrew (OT): one field is BOTH the gloss and a live search of
 *     the whole Strong's lexicon (by number, lemma, transliteration, or gloss).
 *     Picking a result attaches its lemma + Strong's number and seeds the word
 *     (dictionary form, to then inflect). If nothing is picked, whatever you typed
 *     is kept as a plain custom gloss — so a form the lexicon doesn't know still
 *     works.
 *   - English: just the word. An English word is its own gloss, so there's no gloss
 *     field.
 *
 * The word you type always wins as the surface (that's what allows conjugated
 * forms), and any gloss rides along so English-gloss mode keeps working.
 */

const MANUAL = { source: 'manual', confidence: 'high' } as const;

type Lang = 'grc' | 'hbo' | 'en';

export function LexemeSearchModal({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const doc = useEditorStore((s) => s.doc);
  const updateToken = useEditorStore((s) => s.updateToken);
  const node = getNode(doc.syntax, nodeId);
  const tokenId = node?.tokenIds[0];

  const [lang, setLang] = useState<Lang>(
    doc.language === 'hbo' ? 'hbo' : doc.language === 'en' ? 'en' : 'grc',
  );
  const [word, setWord] = useState('');
  // The combined gloss / Strong's-search field (Greek/Hebrew only).
  const [glossQuery, setGlossQuery] = useState('');
  const [picked, setPicked] = useState<StrongsEntry | null>(null);

  const [lexicon, setLexicon] = useState<StrongsEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const greek = lang === 'grc';
  const english = lang === 'en';
  const scriptClass = greek ? 'greek' : undefined;

  // Lazy-load the whole Strong's lexicon for the chosen language (cached). English
  // needs none.
  useEffect(() => {
    if (english) {
      setLexicon(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const entries = await loadStrongs(lang);
        if (!cancelled) setLexicon(entries);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lang, english]);

  const results = useMemo<StrongsEntry[]>(() => {
    if (english || !lexicon || !glossQuery.trim()) return [];
    return searchStrongs(lexicon, glossQuery);
  }, [english, lexicon, glossQuery]);

  const changeLang = (next: Lang) => {
    if (next === lang) return;
    setLang(next);
    setWord('');
    setGlossQuery('');
    setPicked(null);
  };

  // Pick a lexicon entry: attach it, seed the word (dictionary form — the user then
  // inflects it) when still empty, and set the gloss field to its short gloss.
  const choose = (e: StrongsEntry) => {
    setPicked(e);
    setWord((w) => w.trim() || e.lemma);
    setGlossQuery(e.gloss ?? '');
  };

  const clearPick = () => setPicked(null);

  const canAdd = Boolean(word.trim() && tokenId);
  const add = () => {
    const surface = word.trim();
    if (surface && tokenId) {
      const patch: Partial<Token> = { surface, language: lang as Language, provenance: MANUAL };
      if (english) {
        // An English word is its own gloss — no separate gloss, no lexicon.
        patch.lemma = surface;
        patch.gloss = undefined;
        patch.pos = undefined;
        patch.morphology = undefined;
      } else {
        const gloss = glossQuery.trim();
        patch.gloss = gloss || undefined; // a picked gloss, or a plain custom gloss
        if (picked) {
          patch.lemma = picked.lemma;
          const prev = tokenOf(doc, tokenId)?.morphology;
          patch.morphology = { ...prev, extra: { ...prev?.extra, strong: picked.strong } };
        } else {
          patch.lemma = surface; // no lexeme picked — keep the typed form as the lemma
        }
      }
      updateToken(tokenId, patch);
    }
    onClose();
  };

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
              className={scriptClass}
              autoFocus
              value={word}
              placeholder={english ? 'the word…' : 'the inflected form…'}
              onChange={(e) => setWord(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && canAdd && add()}
            />
          </label>

          {/* Step 2 (Greek/Hebrew only): the gloss, which also searches Strong's. */}
          {!english && (
            <>
              <label className="qg-field">
                Gloss / Strong’s
                <input
                  value={glossQuery}
                  placeholder="Gloss, or search Strong’s (number, lemma, gloss)…"
                  onChange={(e) => {
                    setGlossQuery(e.target.value);
                    if (picked) setPicked(null); // editing detaches; re-pick to re-attach
                  }}
                />
              </label>

              {picked && (
                <p className="lex-picked">
                  Using{' '}
                  <span className={scriptClass}>{picked.lemma}</span>
                  {` · ${greek ? 'G' : 'H'}${picked.strong}`}
                  <button type="button" className="lex-clear" onClick={clearPick} aria-label="Detach Strong's">
                    ✕
                  </button>
                </p>
              )}

              {loading && <p className="hint">Loading the {greek ? 'Greek' : 'Hebrew'} lexicon…</p>}
              {error && <p className="hint error">{error}</p>}
              {!loading && !error && !picked && glossQuery.trim() && results.length === 0 && (
                <p className="hint">
                  No Strong’s match — “{glossQuery.trim()}” will be saved as a custom gloss.
                </p>
              )}

              {!picked && (
                <ul className="lex-results">
                  {results.map((e) => (
                    <li key={e.strong}>
                      <button className="lex-hit" onClick={() => choose(e)}>
                        <span className={`lex-lemma${greek ? ' greek' : ''}`}>{e.lemma}</span>
                        {e.gloss && <span className="lex-gloss"> · {e.gloss}</span>}
                        <span className="lex-strong">{greek ? 'G' : 'H'}{e.strong}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <p className="hint">
            {english
              ? 'Type the English word (its own gloss). Select it afterward to set its role.'
              : 'Type the word (its inflected form). The gloss field searches the whole Strong’s lexicon — pick a match to attach its lemma, or just save your text as a custom gloss.'}
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
