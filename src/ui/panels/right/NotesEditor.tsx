import { useEditorStore } from '@/state';

/** Document-level analyst notes. */
export function NotesEditor() {
  const notes = useEditorStore((s) => s.doc.notes);
  const setNotes = useEditorStore((s) => s.setNotes);
  return (
    <div>
      <p className="hint">
        Free-form notes about the analysis as a whole. Per-node and per-relation
        notes live in the inspector.
      </p>
      <textarea
        style={{ minHeight: 160 }}
        value={notes}
        placeholder="Observations, alternative readings, textual variants…"
        onChange={(e) => setNotes(e.target.value)}
      />
    </div>
  );
}
