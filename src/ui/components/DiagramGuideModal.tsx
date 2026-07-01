import { Fragment, useEffect, type ReactNode } from 'react';
import { DIAGRAM_MODES } from '@/domain/layout';
import { TONE_COLORS } from '@/domain/render';

/**
 * A read-only "how to read the diagram" reference: what each visualization shows,
 * and — the part people actually ask about — the Kellogg-Reed line conventions
 * (the vertical divider, the object tick, the predicate back-slant, modifier
 * slants, PP stems, dotted subordinate stems, the coordination bar, the
 * apposition "=", the infinitive double-tick, and greyed implied words). Each
 * mark is drawn with a tiny SVG in the same visual language as the real diagram,
 * so the legend and the canvas read the same.
 *
 * Presentation only — it never touches the document or the layout.
 */

/** A small glyph illustrating one Kellogg-Reed mark (72×46 viewBox). */
interface Mark {
  name: string;
  meaning: string;
  draw: ReactNode;
}

const INK = '#2a2f3a';
const MUTED = '#8a90a0';
const line = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  extra: Record<string, string | number> = {},
) => <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK} strokeWidth={1.6} {...extra} />;

const MARKS: Mark[] = [
  {
    name: 'Subject | predicate',
    meaning:
      'The main line carries the subject, the verb, and its complements. A full vertical bar crossing the line splits the subject from the predicate.',
    draw: (
      <>
        {line(6, 24, 66, 24)}
        {line(34, 10, 34, 38)}
      </>
    ),
  },
  {
    name: 'Direct / indirect object',
    meaning: 'A short vertical tick that stands ON the baseline (it does not cross it) marks an object of the verb.',
    draw: (
      <>
        {line(6, 24, 66, 24)}
        {line(46, 24, 46, 9)}
      </>
    ),
  },
  {
    name: 'Predicate noun / adjective',
    meaning:
      'A line that slants BACK toward the verb carries a predicate nominative or adjective — the complement of a linking verb (“is”, “became”).',
    draw: (
      <>
        {line(6, 24, 66, 24)}
        {line(48, 24, 36, 10)}
      </>
    ),
  },
  {
    name: 'Modifier',
    meaning: 'An adjective, adverb, article, or genitive rides a solid slant hanging beneath the word it modifies.',
    draw: (
      <>
        {line(20, 16, 60, 16)}
        {line(34, 16, 46, 40)}
      </>
    ),
  },
  {
    name: 'Prepositional phrase',
    meaning: 'The preposition rides a stem down from its head word; its object sits on its own little baseline below.',
    draw: (
      <>
        {line(18, 14, 50, 14)}
        {line(30, 14, 42, 38)}
        {line(34, 38, 62, 38)}
      </>
    ),
  },
  {
    name: 'Subordinate / relative clause',
    meaning: 'A DOTTED stem drops from the governing word to a fully laid-out sub-clause; the connector (that, who, because…) rides the stem.',
    draw: (
      <>
        {line(16, 14, 48, 14)}
        {line(32, 14, 32, 38, { strokeDasharray: '2 3' })}
        {line(20, 38, 58, 38)}
      </>
    ),
  },
  {
    name: 'Coordination',
    meaning: 'Coordinated items (joined by and / or / nor) sit on parallel arms bridged by a DASHED bar that carries the conjunction.',
    draw: (
      <>
        {line(16, 14, 46, 14)}
        {line(16, 34, 46, 34)}
        {line(31, 14, 31, 34, { strokeDasharray: '3 3' })}
      </>
    ),
  },
  {
    name: 'Apposition',
    meaning: 'An “=” lying flat ON the line — two short strokes PARALLEL to the baseline — joins an appositive that RENAMES the word before it (“Paul, an apostle”).',
    draw: (
      <>
        {line(6, 24, 66, 24)}
        {line(34, 20, 46, 20)}
        {line(34, 28, 46, 28)}
      </>
    ),
  },
  {
    name: 'Infinitive',
    meaning: 'A DOUBLE vertical crossing the baseline marks an infinitive (“to know”, “to live”).',
    draw: (
      <>
        {line(6, 24, 66, 24)}
        {line(34, 12, 34, 36)}
        {line(39, 12, 39, 36)}
      </>
    ),
  },
  {
    name: 'Implied / elided word',
    meaning: 'A word the language leaves unspoken — a pro-drop subject, an omitted copula — is drawn greyed in italics, e.g. (ἐστίν).',
    draw: (
      <>
        {line(6, 24, 66, 24, { stroke: MUTED })}
        <text x={36} y={20} textAnchor="middle" fontSize={12} fontStyle="italic" fill={MUTED}>
          (is)
        </text>
      </>
    ),
  },
];

/**
 * The grammatical categories the Morphology Clause view (and the optional colour
 * overlay) tint, in reading order — keyed to the renderer's TONE_COLORS so the
 * legend never drifts from the diagram. A finite verb / participle colours by
 * part of speech; everything else by case (see `tokenTone`).
 */
const TONE_LEGEND: { key: keyof typeof TONE_COLORS; label: string; meaning: string }[] = [
  { key: 'verb', label: 'Finite verb', meaning: 'the conjugated verb of a clause' },
  { key: 'participle', label: 'Participle', meaning: 'a verbal adjective (“-ing / -ed” form)' },
  { key: 'nominative', label: 'Nominative', meaning: 'subject or predicate nominative' },
  { key: 'accusative', label: 'Accusative', meaning: 'direct object' },
  { key: 'genitive', label: 'Genitive', meaning: 'possessive / “of”' },
  { key: 'dative', label: 'Dative', meaning: 'indirect object / “to, for”' },
  { key: 'vocative', label: 'Vocative', meaning: 'direct address' },
];

/** One-liners on how to READ each visualization (beyond the selector tooltip). */
const MODE_NOTES: Record<string, string> = {
  'kellogg-reed': 'The classic function diagram: a main line for subject + verb + complements, with modifiers slanting beneath.',
  'phrase-block': 'The clause hierarchy as indented, tappable blocks — the finger-friendly, sermon-prep lens (and the one you edit in).',
  dependency: 'Each word linked to its head by a labelled arc — who governs whom, drawn flat.',
  'dependency-tree': 'The same head→dependent links as a top-down tree (Perseus style).',
  constituency: 'A phrase-structure tree (S → NP VP) with the grammatical category on each branch.',
  morphology: 'The Greek/Hebrew forms with their parsing and agreement, kept in the source language.',
};

export function DiagramGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal diagram-guide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="diagramGuideTitle"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 560, maxHeight: '82vh', overflowY: 'auto' }}
      >
        <h2 className="modal-title" id="diagramGuideTitle">
          How to read the diagram
        </h2>
        <p className="hint">
          Every view is a different lens over the <strong>same</strong> underlying sentence structure — switching views
          never changes the parse. English glosses and the source language are the same diagram with the words swapped.
        </p>

        <h3 style={{ margin: '14px 0 6px', fontSize: 14 }}>Views</h3>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5 }}>
          {DIAGRAM_MODES.map((m) => (
            <li key={m.id} style={{ marginBottom: 4 }}>
              <strong>{m.label}</strong> — {MODE_NOTES[m.id] ?? m.description}
            </li>
          ))}
        </ul>

        <h3 style={{ margin: '16px 0 6px', fontSize: 14 }}>Colour code (morphology)</h3>
        <p className="hint" style={{ margin: '0 0 8px' }}>
          Words are tinted by grammatical category — finite verb / participle by form, otherwise by case — in every view
          that shows the words. The colour is always paired with the word itself, so it is never the only cue.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '6px 12px', fontSize: 13 }}>
          {TONE_LEGEND.map((t) => (
            <div key={t.key} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span
                aria-hidden="true"
                style={{ flex: 'none', width: 12, height: 12, borderRadius: 3, background: TONE_COLORS[t.key], transform: 'translateY(1px)' }}
              />
              <span>
                <strong style={{ color: TONE_COLORS[t.key] }}>{t.label}</strong>
                <span style={{ color: 'var(--ink-soft, #667)' }}> — {t.meaning}</span>
              </span>
            </div>
          ))}
        </div>

        <h3 style={{ margin: '16px 0 6px', fontSize: 14 }}>Kellogg-Reed marks</h3>
        <div
          style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 12px', alignItems: 'center', fontSize: 13 }}
        >
          {MARKS.map((mk) => (
            <Fragment key={mk.name}>
              <svg
                width={72}
                height={46}
                viewBox="0 0 72 46"
                style={{ background: 'var(--paper, #fbfaf7)', borderRadius: 4, border: '1px solid var(--line, #e6e3dc)' }}
                aria-hidden="true"
              >
                {mk.draw}
              </svg>
              <div>
                <div style={{ fontWeight: 600 }}>{mk.name}</div>
                <div style={{ color: 'var(--ink-soft, #667)', lineHeight: 1.4 }}>{mk.meaning}</div>
              </div>
            </Fragment>
          ))}
        </div>

        <p className="hint" style={{ marginTop: 14 }}>
          Small italics on a line are the connector between two parts. Layout nudges (drag, collapse) change only the
          picture, never the parse.
        </p>

        <div style={{ textAlign: 'right', marginTop: 14 }}>
          <button className="mini" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
