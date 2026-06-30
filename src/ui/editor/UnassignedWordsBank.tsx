import { useEditorStore } from '@/state';
import { unassignedTokens } from '@/domain/model';

/**
 * Edit-mode strip listing tokens the parser (or an import) left UNPLACED — words
 * with no syntax node, so they appear nowhere on the diagram and otherwise can't
 * be grabbed. Click a chip to place it on the line (a word node attached to the
 * clause you're working in, then selected) so it can be re-roled / relinked with
 * the normal tools.
 *
 * This is also the second half of the two-step delete: a word removed FROM the
 * diagram lands back here (its token kept), and the chip's × deletes the token for
 * good. So nothing is lost in one stroke — deletion fits the uncertainty of
 * editing. Every word in the sentence stays reachable even when auto-tagging missed it.
 */
export function UnassignedWordsBank() {
  const doc = useEditorStore((s) => s.doc);
  const placeToken = useEditorStore((s) => s.placeToken);
  const removeToken = useEditorStore((s) => s.removeToken);
  const unplaced = unassignedTokens(doc);
  if (!unplaced.length) return null;

  return (
    <div className="word-bank" role="group" aria-label="Unassigned words">
      <span className="word-bank-label" title="Words not yet on the diagram — click one to place it">
        Unassigned
      </span>
      <div className="word-bank-chips">
        {unplaced.map((t) => (
          <span key={t.id} className="word-bank-chip">
            <button
              type="button"
              className="word-bank-place"
              title="Place this word on the diagram"
              onClick={() => placeToken(t.id)}
            >
              {t.surface}
            </button>
            <button
              type="button"
              className="word-bank-del"
              title="Delete this word for good"
              aria-label={`Delete ${t.surface}`}
              onClick={() => removeToken(t.id)}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
