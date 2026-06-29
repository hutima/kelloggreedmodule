import { useState } from 'react';
import type { SermonAnchor } from '@/domain/schema';
import { useEditorStore } from '@/state';
import { HighlightToolbar } from './HighlightToolbar';
import { describeAnchor, highlightColor } from './highlights';

/** Anchor for the current selection (falls back to the whole passage). */
function selectionAnchor(selection: { nodeId?: string; relationId?: string }): SermonAnchor {
  if (selection.relationId) return { type: 'relation', relationId: selection.relationId };
  if (selection.nodeId) return { type: 'node', nodeId: selection.nodeId };
  return { type: 'passage' };
}

/**
 * Desktop sermon-prep workspace: notes/highlights for the current selection, the
 * big idea + outline, and rolled-up lists of every highlight, note, and
 * observation in the passage. Sermon prep is kept separate from Edit mode — it
 * answers "what do I need to notice and preach?", not "what is the syntax?".
 */
export function SermonPrepDrawer() {
  const doc = useEditorStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);
  const sermon = useEditorStore((s) => s.sermon);
  const select = useEditorStore((s) => s.select);
  const addSermonNote = useEditorStore((s) => s.addSermonNote);
  const removeSermonNote = useEditorStore((s) => s.removeSermonNote);
  const removeHighlight = useEditorStore((s) => s.removeHighlight);
  const addObservation = useEditorStore((s) => s.addObservation);
  const removeObservation = useEditorStore((s) => s.removeObservation);
  const setBigIdea = useEditorStore((s) => s.setBigIdea);
  const addOutlineSection = useEditorStore((s) => s.addOutlineSection);
  const updateOutlineSection = useEditorStore((s) => s.updateOutlineSection);
  const removeOutlineSection = useEditorStore((s) => s.removeOutlineSection);

  const anchor = selectionAnchor(selection);
  const greek = doc.language === 'grc';
  const [quickNote, setQuickNote] = useState('');
  const [obs, setObs] = useState('');

  const addQuick = () => {
    if (!quickNote.trim()) return;
    addSermonNote({ anchor, category: 'observation', body: quickNote });
    setQuickNote('');
  };
  const addObs = () => {
    if (!obs.trim()) return;
    addObservation(obs);
    setObs('');
  };

  return (
    <div className="sermon-drawer">
      <section className="sermon-section">
        <h3>This selection</h3>
        <p className="sermon-anchor">
          <span className={greek ? 'greek' : undefined}>{describeAnchor(doc, anchor)}</span>
          {(selection.nodeId || selection.relationId) && (
            <button className="link-btn sermon-clear" onClick={() => select({})}>
              Clear selection
            </button>
          )}
        </p>
        <HighlightToolbar anchor={anchor} />
        <div className="sermon-quicknote">
          <textarea
            placeholder="Quick note on this selection…"
            value={quickNote}
            onChange={(e) => setQuickNote(e.target.value)}
          />
          <button className="btn primary" onClick={addQuick} disabled={!quickNote.trim()}>
            Add note
          </button>
        </div>
      </section>

      <section className="sermon-section">
        <h3>Big idea & outline</h3>
        <textarea
          className="sermon-bigidea"
          placeholder="The one main idea of this passage…"
          value={sermon.outline?.bigIdea ?? ''}
          onChange={(e) => setBigIdea(e.target.value)}
        />
        {(sermon.outline?.sections ?? []).map((sec, i) => (
          <div key={sec.id} className="outline-section">
            <div className="outline-head">
              <input
                placeholder={`Point ${i + 1}`}
                value={sec.title}
                onChange={(e) => updateOutlineSection(sec.id, { title: e.target.value })}
              />
              <button className="link-btn danger" onClick={() => removeOutlineSection(sec.id)}>
                ✕
              </button>
            </div>
            <textarea
              placeholder="Notes for this point…"
              value={sec.body}
              onChange={(e) => updateOutlineSection(sec.id, { body: e.target.value })}
            />
          </div>
        ))}
        <button className="btn" onClick={addOutlineSection}>
          + Add outline point
        </button>
      </section>

      <section className="sermon-section">
        <h3>Highlights ({sermon.highlights.length})</h3>
        {sermon.highlights.length === 0 && <p className="empty">No highlights yet.</p>}
        <ul className="sermon-list">
          {sermon.highlights.map((h) => (
            <li key={h.id}>
              <span className="hl-swatch" style={{ background: highlightColor(h.category) }} />
              <button
                className="link-btn"
                onClick={() => h.anchor.nodeId && select({ nodeId: h.anchor.nodeId })}
              >
                <span className={greek ? 'greek' : undefined}>{describeAnchor(doc, h.anchor)}</span>
                <small> · {h.category}</small>
              </button>
              <button className="link-btn danger" onClick={() => removeHighlight(h.id)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="sermon-section">
        <h3>Notes ({sermon.notes.length})</h3>
        {sermon.notes.length === 0 && <p className="empty">No notes yet.</p>}
        <ul className="sermon-list notes">
          {sermon.notes.map((n) => (
            <li key={n.id}>
              <div className="note-meta">
                <span className="note-cat">{n.category}</span>
                <button
                  className="link-btn"
                  onClick={() => n.anchor.nodeId && select({ nodeId: n.anchor.nodeId })}
                >
                  <span className={greek ? 'greek' : undefined}>{describeAnchor(doc, n.anchor)}</span>
                </button>
                <button className="link-btn danger" onClick={() => removeSermonNote(n.id)}>
                  ✕
                </button>
              </div>
              {n.title && <strong>{n.title}</strong>}
              {n.body && <p className="note-body">{n.body}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section className="sermon-section">
        <h3>Observations ({sermon.observations.length})</h3>
        <ul className="sermon-list">
          {sermon.observations.map((o) => (
            <li key={o.id}>
              <span className="note-body">{o.body}</span>
              <button className="link-btn danger" onClick={() => removeObservation(o.id)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="sermon-quicknote">
          <textarea
            placeholder="An observation about the text…"
            value={obs}
            onChange={(e) => setObs(e.target.value)}
          />
          <button className="btn" onClick={addObs} disabled={!obs.trim()}>
            Add observation
          </button>
        </div>
      </section>
    </div>
  );
}
