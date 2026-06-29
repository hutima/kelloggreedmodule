import { Modal } from '@/ui/components/common/Modal';

/**
 * A general, written walkthrough of desktop Edit mode — the orientation that the
 * per-mode "How to edit" help doesn't give. It explains what editing is, how the
 * visualizations and the Basic/Advanced tiers relate, the workflow for a typical
 * edit, and how edits are saved and undone. Opened from the edit toolbar's Guide
 * button; the mode-specific "How to edit" stays available for the active lens.
 */
export function EditGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="Editing guide"
      onClose={onClose}
      wide
      className="help-modal"
      footer={
        <div className="modal-buttons">
          <button className="btn primary" onClick={onClose}>
            Got it
          </button>
        </div>
      }
    >
      <p className="help-bestfor">
        Edit mode lets you correct and reshape the parse — change a word&apos;s role, move a
        phrase under a different head, fix parsing, or restructure a passage for preaching. The
        gold-standard parse is never overwritten: your changes are saved as a personal layer on
        top of it and can be reset at any time.
      </p>

      <h3 className="help-h">The big picture</h3>
      <ul className="help-list">
        <li>
          <strong>One model, several views.</strong> Kellogg-Reed, Phrase / Block, Dependency, and
          Morphology are four lenses over the <em>same</em> sentence — an edit in one shows up in
          all of them. Pick the lens that makes your edit easiest.
        </li>
        <li>
          <strong>Two tiers.</strong> The <strong>Basic / Advanced</strong> toggle sets how much
          control you get. Basic is visual and fast — plain-English chips, tap-to-link, and
          promote / demote. Advanced opens the full role lists, the relationship builder, and
          word-by-word morphology.
        </li>
        <li>
          <strong>Tools.</strong> In Basic, the toolbar shows the tools for the current view —
          always <strong>Select</strong>, plus <strong>Link</strong>, <strong>Move</strong>, or{' '}
          <strong>Group</strong> where the view supports them.
        </li>
      </ul>

      <h3 className="help-h">A typical edit</h3>
      <ol className="help-list">
        <li>Switch to the view that fits the change (Phrase / Block for sermon structure, Dependency for word-to-word links, Morphology for parsing).</li>
        <li>Make sure you&apos;re on the right tier — Basic for quick changes, Advanced for exact roles.</li>
        <li>Tap a word, line, or row to select it; a contextual toolbar or popover appears.</li>
        <li>Use a chip to relabel, or a tool (Link / Move under) to re-attach it to a new head.</li>
        <li>In Kellogg-Reed, use <strong>Clean up</strong> to re-flow the diagram if pieces overlap after moving things.</li>
      </ol>

      <h3 className="help-h">Saving, undo, and reset</h3>
      <ul className="help-list">
        <li>Every change autosaves as you go — there is no save button.</li>
        <li>
          <strong>Undo / Redo</strong> (the ↶ ↷ buttons) step through your edits in this session.
        </li>
        <li>
          Your edits are stored as a diff against the gold-standard parse, so resetting removes
          only your changes and restores the original.
        </li>
        <li>
          Layout nudges (where a piece is drawn) are visual only — they never change the
          grammar. Sermon notes and highlights live alongside the parse and survive edits.
        </li>
      </ul>

      <p className="help-bestfor">
        Need the specifics for the view you&apos;re in? Use <strong>How to edit</strong> in the
        toolbar — it&apos;s tailored to the current visualization and tier.
      </p>
    </Modal>
  );
}
