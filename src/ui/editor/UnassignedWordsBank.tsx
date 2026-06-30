import { useEditorStore } from '@/state';
import { unassignedTokens } from '@/domain/model';

/**
 * Edit-mode strip listing tokens the parser (or an import) left UNPLACED — words
 * with no syntax node, so they appear nowhere on the diagram and otherwise can't
 * be grabbed. Click a chip to place it on the line (a word node attached to the
 * root, then selected) so it can be re-roled / relinked with the normal tools.
 *
 * This is the safety net for weak auto-tagging: every word in the sentence is
 * always reachable, even when the engine couldn't classify it.
 */
export function UnassignedWordsBank() {
  const doc = useEditorStore((s) => s.doc);
  const placeToken = useEditorStore((s) => s.placeToken);
  const unplaced = unassignedTokens(doc);
  if (!unplaced.length) return null;

  return (
    <div className="word-bank" role="group" aria-label="Unassigned words">
      <span className="word-bank-label" title="Words not yet on the diagram — click one to place it">
        Unassigned
      </span>
      <div className="word-bank-chips">
        {unplaced.map((t) => (
          <button
            key={t.id}
            type="button"
            className="word-bank-chip"
            title="Place this word on the diagram"
            onClick={() => placeToken(t.id)}
          >
            {t.surface}
          </button>
        ))}
      </div>
    </div>
  );
}
