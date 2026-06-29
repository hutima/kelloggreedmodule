import { useMemo, useState } from 'react';
import type { SermonAnchor, SermonNote, SermonNoteCategory } from '@/domain/schema';
import { useEditorStore } from '@/state';
import { getNode, getRelation, nodeText } from '@/domain/model';
import { Modal } from '@/ui/components/common/Modal';

const CATEGORIES: { id: SermonNoteCategory; label: string }[] = [
  { id: 'observation', label: 'Observation' },
  { id: 'translation', label: 'Translation' },
  { id: 'syntax', label: 'Syntax' },
  { id: 'theology', label: 'Theology' },
  { id: 'illustration', label: 'Illustration' },
  { id: 'application', label: 'Application' },
  { id: 'question', label: 'Question' },
  { id: 'crossReference', label: 'Cross reference' },
  { id: 'commentary', label: 'Commentary' },
];

function sameAnchor(a: SermonAnchor, b: SermonAnchor): boolean {
  return (
    a.type === b.type &&
    (a.nodeId ?? '') === (b.nodeId ?? '') &&
    (a.relationId ?? '') === (b.relationId ?? '') &&
    (a.verseRef ?? '') === (b.verseRef ?? '') &&
    (a.tokenIds ?? []).join(',') === (b.tokenIds ?? []).join(',')
  );
}

/** Add, edit, and remove sermon-prep notes attached to the current selection. */
export function NoteModal({ anchor, onClose }: { anchor: SermonAnchor; onClose: () => void }) {
  const doc = useEditorStore((s) => s.doc);
  const sermon = useEditorStore((s) => s.sermon);
  const addSermonNote = useEditorStore((s) => s.addSermonNote);
  const updateSermonNote = useEditorStore((s) => s.updateSermonNote);
  const removeSermonNote = useEditorStore((s) => s.removeSermonNote);

  const existing = useMemo(
    () => sermon.notes.filter((n) => sameAnchor(n.anchor, anchor)),
    [sermon.notes, anchor],
  );

  const [editing, setEditing] = useState<SermonNote | null>(null);
  const [category, setCategory] = useState<SermonNoteCategory>('observation');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const anchorLabel = (() => {
    if (anchor.nodeId) {
      const n = getNode(doc.syntax, anchor.nodeId);
      return n ? nodeText(doc, n) || n.label || n.kind : 'word';
    }
    if (anchor.relationId) {
      const r = getRelation(doc.syntax, anchor.relationId);
      return r ? `relation (${r.type})` : 'relation';
    }
    if (anchor.verseRef) return anchor.verseRef;
    return 'passage';
  })();

  const startEdit = (n: SermonNote) => {
    setEditing(n);
    setCategory(n.category);
    setTitle(n.title ?? '');
    setBody(n.body);
  };
  const reset = () => {
    setEditing(null);
    setCategory('observation');
    setTitle('');
    setBody('');
  };
  const save = () => {
    if (!body.trim() && !title.trim()) return;
    if (editing) updateSermonNote(editing.id, { category, title, body });
    else addSermonNote({ anchor, category, title, body });
    reset();
  };

  return (
    <Modal
      title="Notes"
      onClose={onClose}
      footer={
        <div className="modal-buttons">
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn primary" onClick={save} disabled={!body.trim() && !title.trim()}>
            {editing ? 'Update note' : 'Add note'}
          </button>
        </div>
      }
    >
      <p className="rb-target">
        On <span className={doc.language === 'grc' ? 'greek' : undefined}>{anchorLabel}</span>
      </p>

      {existing.length > 0 && (
        <ul className="note-list">
          {existing.map((n) => (
            <li key={n.id} className={editing?.id === n.id ? 'editing' : ''}>
              <div className="note-meta">
                <span className="note-cat">{n.category}</span>
                {n.title && <strong>{n.title}</strong>}
              </div>
              {n.body && <p className="note-body">{n.body}</p>}
              <div className="note-row-actions">
                <button className="link-btn" onClick={() => startEdit(n)}>
                  Edit
                </button>
                <button className="link-btn danger" onClick={() => removeSermonNote(n.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="rb-chips">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            className={`chip${category === c.id ? ' active' : ''}`}
            onClick={() => setCategory(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <input
        className="note-title"
        placeholder="Title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="note-body-input"
        placeholder="Write your note…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {editing && (
        <button className="link-btn" onClick={reset}>
          Cancel edit / start a new note
        </button>
      )}
    </Modal>
  );
}
