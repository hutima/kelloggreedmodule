import { useEffect, useMemo, useRef, useState } from 'react';
import { useDiscourseStore } from '@/state';
import {
  DISCOURSE_SOURCES,
  discourseBooksFor,
  loadDiscourseBook,
  bookRefShapeOf,
  estimateUnitCountOf,
  type DiscourseSourceId,
  type LoadedDiscourseBook,
} from '@/io';
import type { DiscourseGranularity } from '@/domain/schema';

/**
 * DISCOURSE RANGE SELECTOR — the dedicated loader shown in the left panel
 * whenever the Discourse visualization is active. It replaces the syntax
 * sentence/checkbox picker (which returns untouched when the user leaves
 * Discourse mode) and writes ONLY to the discourse store: loading a range
 * never overwrites the currently loaded syntax sentence/passage.
 */

/** Ranges above this many units get a "very large" warning (not a block). */
const LARGE_RANGE_UNITS = 150;

export function DiscourseRangeSelector() {
  const sourceId = useDiscourseStore((s) => s.sourceId);
  const bookNum = useDiscourseStore((s) => s.bookNum);
  const startRef = useDiscourseStore((s) => s.startRef);
  const endRef = useDiscourseStore((s) => s.endRef);
  const granularity = useDiscourseStore((s) => s.granularity);
  const status = useDiscourseStore((s) => s.status);
  const error = useDiscourseStore((s) => s.error);
  const loadedTitle = useDiscourseStore((s) => s.doc?.title ?? null);
  const setSourceId = useDiscourseStore((s) => s.setSourceId);
  const setBookNum = useDiscourseStore((s) => s.setBookNum);
  const setRange = useDiscourseStore((s) => s.setRange);
  const setGranularity = useDiscourseStore((s) => s.setGranularity);
  const loadRange = useDiscourseStore((s) => s.loadRange);

  const books = discourseBooksFor(sourceId);
  const book = books.find((b) => b.num === bookNum) ?? books[0]!;

  // The selected book's data (SW-cached) — syntax sentence docs OR an English
  // book — for the chapter/verse shape, the unit-count estimate, and to hand
  // straight to loadRange.
  const [loaded, setLoaded] = useState<LoadedDiscourseBook | null>(null);
  const [bookLoading, setBookLoading] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const loadSeq = useRef(0);
  useEffect(() => {
    const seq = ++loadSeq.current;
    setLoaded(null);
    setBookError(null);
    setBookLoading(true);
    loadDiscourseBook(sourceId, book.num)
      .then((data) => {
        if (seq !== loadSeq.current) return;
        setLoaded(data);
        setBookLoading(false);
      })
      .catch((e) => {
        if (seq !== loadSeq.current) return;
        setBookError((e as Error).message);
        setBookLoading(false);
      });
  }, [sourceId, book.num]);

  // Chapter/verse shape of the loaded book (max verse per chapter).
  const shape = useMemo(
    () => (loaded ? bookRefShapeOf(loaded) : new Map<number, number>()),
    [loaded],
  );
  const chapters = useMemo(() => [...shape.keys()].sort((a, b) => a - b), [shape]);

  const parse = (ref: string) => {
    const m = /^(\d+):(\d+)$/.exec(ref);
    return m ? { c: Number(m[1]), v: Number(m[2]) } : null;
  };
  const start = parse(startRef) ?? { c: chapters[0] ?? 1, v: 1 };
  const end = parse(endRef) ?? start;

  // Keep the range inside the book once its shape is known.
  useEffect(() => {
    if (!chapters.length) return;
    const clampCh = (c: number) => Math.min(Math.max(c, chapters[0]!), chapters[chapters.length - 1]!);
    const c0 = clampCh(start.c);
    const c1 = clampCh(end.c);
    const v0 = Math.min(start.v, shape.get(c0) ?? start.v);
    const v1 = Math.min(end.v, shape.get(c1) ?? end.v);
    const next0 = `${c0}:${v0}`;
    const next1 = `${c1}:${v1}`;
    if (next0 !== startRef || next1 !== endRef) setRange(next0, next1);
    // Only re-clamp when the book shape changes (not on every keystroke).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape]);

  const estimate = useMemo(
    () => (loaded ? estimateUnitCountOf(loaded, startRef, endRef, granularity) : null),
    [loaded, startRef, endRef, granularity],
  );

  const setStart = (c: number, v: number) => setRange(`${c}:${v}`, endRef);
  const setEnd = (c: number, v: number) => setRange(startRef, `${c}:${v}`);
  const wholeBook = () => {
    if (!chapters.length) return;
    const last = chapters[chapters.length - 1]!;
    setRange(`${chapters[0]}:1`, `${last}:${shape.get(last) ?? 1}`);
  };
  const wholeChapter = (c: number) => setRange(`${c}:1`, `${c}:${shape.get(c) ?? 1}`);

  const verseOptions = (c: number) =>
    Array.from({ length: shape.get(c) ?? 1 }, (_, i) => i + 1);

  const invalidRange =
    start.c > end.c || (start.c === end.c && start.v > end.v);

  return (
    <div className="gnt-picker discourse-range">
      <p className="discourse-blurb">
        Discourse mode is an interpretive outline and relationship layer over a
        larger passage. Pick a range — a section, chapters, or a whole book.
        Loading it won’t change your open syntax passage.
      </p>
      <label className="field">
        <span>Source</span>
        <select value={sourceId} onChange={(e) => setSourceId(e.target.value as DiscourseSourceId)}>
          {DISCOURSE_SOURCES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Book</span>
        <select value={book.num} onChange={(e) => setBookNum(Number(e.target.value))}>
          {books.map((b) => (
            <option key={b.num} value={b.num}>
              {b.name}
            </option>
          ))}
        </select>
      </label>

      {bookLoading && <p className="discourse-note">Loading {book.name}…</p>}
      {bookError && <p className="discourse-error">{bookError}</p>}

      {loaded && chapters.length > 0 && (
        <>
          <div className="discourse-refrow" role="group" aria-label="Start reference">
            <span className="discourse-reflabel">From</span>
            <select
              aria-label="Start chapter"
              value={start.c}
              onChange={(e) => {
                const c = Number(e.target.value);
                setStart(c, Math.min(start.v, shape.get(c) ?? 1));
              }}
            >
              {chapters.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <span aria-hidden="true">:</span>
            <select
              aria-label="Start verse"
              value={start.v}
              onChange={(e) => setStart(start.c, Number(e.target.value))}
            >
              {verseOptions(start.c).map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          <div className="discourse-refrow" role="group" aria-label="End reference">
            <span className="discourse-reflabel">To</span>
            <select
              aria-label="End chapter"
              value={end.c}
              onChange={(e) => {
                const c = Number(e.target.value);
                setEnd(c, Math.min(end.v, shape.get(c) ?? 1));
              }}
            >
              {chapters.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <span aria-hidden="true">:</span>
            <select
              aria-label="End verse"
              value={end.v}
              onChange={(e) => setEnd(end.c, Number(e.target.value))}
            >
              {verseOptions(end.c).map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>

          <div className="row discourse-shortcuts">
            <button className="mini" onClick={wholeBook} title="Select the whole book">
              Whole book
            </button>
            <label className="discourse-chapter-shortcut">
              <span className="sr-only">Chapter shortcut</span>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) wholeChapter(Number(e.target.value));
                }}
              >
                <option value="">Chapter…</option>
                {chapters.map((c) => (
                  <option key={c} value={c}>Chapter {c}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>Unit size</span>
            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value as DiscourseGranularity)}
            >
              <option value="sentence">Sentence (recommended)</option>
              <option value="verse">Verse</option>
            </select>
          </label>

          {estimate != null && (
            <p className="discourse-note">
              ≈ {estimate} unit{estimate === 1 ? '' : 's'}
              {estimate > LARGE_RANGE_UNITS && (
                <span className="discourse-warn">
                  {' '}
                  — a very large range. It will load, but consider working a section
                  at a time.
                </span>
              )}
            </p>
          )}
          {invalidRange && (
            <p className="discourse-error">The start reference is after the end reference.</p>
          )}

          <div className="row">
            <button
              className="mini accept"
              disabled={invalidRange || status === 'loading'}
              onClick={() => loaded && void loadRange({ loaded })}
            >
              {status === 'loading' ? 'Loading…' : 'Load range'}
            </button>
          </div>
        </>
      )}

      {status === 'error' && error && <p className="discourse-error">{error}</p>}
      {status === 'loaded' && loadedTitle && (
        <p className="discourse-note">
          Loaded: <strong>{loadedTitle}</strong>
        </p>
      )}
    </div>
  );
}
