import { useState } from 'react';
import type { SermonAnchor } from '@/domain/schema';
import { useEditorStore } from '@/state';
import { HighlightToolbar } from './HighlightToolbar';
import { describeAnchor } from './highlights';

function selectionAnchor(selection: { nodeId?: string; relationId?: string }): SermonAnchor {
  if (selection.relationId) return { type: 'relation', relationId: selection.relationId };
  if (selection.nodeId) return { type: 'node', nodeId: selection.nodeId };
  return { type: 'passage' };
}

/**
 * Light mobile sermon prep: quick highlight + quick note for the current
 * selection, and a short list of recent notes. No persistent dense panel — this
 * is shown only when the user opens Sermon Prep on a phone.
 */
export function MobileSermonPrepSheet({ onClose }: { onClose: () => void }) {
  const doc = useEditorStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);
  const sermon = useEditorStore((s) => s.sermon);
  const addSermonNote = useEditorStore((s) => s.addSermonNote);
  const removeSermonNote = useEditorStore((s) => s.removeSermonNote);
  const anchor = selectionAnchor(selection);
  const greek = doc.language === 'grc';
  const [note, setNote] = useState('');

  const add = () => {
    if (!note.trim()) return;
    addSermonNote({ anchor, category: 'observation', body: note });
    setNote('');
  };

  return (
    <div className="mobile-sheet sermon" role="dialog" aria-label="Sermon prep">
      <div className="mobile-sheet-head">
        <span>Sermon prep</span>
        <button className="modal-x" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="mobile-sheet-body">
        <p className="sermon-anchor">
          On <span className={greek ? 'greek' : undefined}>{describeAnchor(doc, anchor)}</span>
        </p>
        <HighlightToolbar anchor={anchor} />
        <div className="sermon-quicknote">
          <textarea
            placeholder="Quick note…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button className="btn primary" onClick={add} disabled={!note.trim()}>
            Add note
          </button>
        </div>
        {sermon.notes.length > 0 && (
          <ul className="sermon-list notes">
            {sermon.notes.slice(-6).reverse().map((n) => (
              <li key={n.id}>
                <div className="note-meta">
                  <span className="note-cat">{n.category}</span>
                  <button className="link-btn danger" onClick={() => removeSermonNote(n.id)}>
                    ✕
                  </button>
                </div>
                {n.body && <p className="note-body">{n.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
