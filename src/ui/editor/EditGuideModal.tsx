import { useMemo } from 'react';
import { useEditorStore } from '@/state';
import { Modal } from '@/ui/components/common/Modal';
import { layoutForMode } from '@/domain/layout';
import { layoutToSvg } from '@/domain/render';
import { adapterFor } from './adapters';
import { RELATIONSHIP_GUIDE, ROLE_DEMOS, buildDemoDoc, relationshipGloss } from './relationshipGuide';
import type { SyntacticRole } from '@/domain/schema';

/** Render the KR + Dependency mini-diagrams for every role that ships a demo. */
function useRoleDemoSvgs(): Partial<Record<SyntacticRole, { kr: string; tree: string }>> {
  return useMemo(() => {
    const out: Partial<Record<SyntacticRole, { kr: string; tree: string }>> = {};
    for (const [role, demo] of Object.entries(ROLE_DEMOS)) {
      if (!demo) continue;
      const doc = buildDemoDoc(demo);
      const opts = { padding: 6, background: false, standalone: true } as const;
      out[role as SyntacticRole] = {
        kr: layoutToSvg(layoutForMode('kellogg-reed', doc), opts),
        tree: layoutToSvg(layoutForMode('dependency', doc), opts),
      };
    }
    return out;
  }, []);
}

/**
 * The single editing guide, opened from the edit toolbar's Guide button. It pairs
 * a general walkthrough of Edit mode (what it is, views vs tiers, the workflow,
 * how edits are saved) with the mode- AND tier-specific "how to" for the lens
 * you're currently in — so one visible button covers both the orientation and
 * the concrete steps, instead of a separate help button tucked off-screen.
 */
export function EditGuideModal({ onClose }: { onClose: () => void }) {
  const diagramMode = useEditorStore((s) => s.diagramMode);
  const editTier = useEditorStore((s) => s.editTier);
  const help = adapterFor(diagramMode).getHelpContent(editTier);

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
        <li>Switch to the view that fits the change (Phrase / Block for clause structure, Dependency for word-to-word links, Morphology for parsing).</li>
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
          grammar. Study notes and highlights live alongside the parse and survive edits.
        </li>
      </ul>

      {/* The concrete steps for the lens + tier you're in right now. */}
      <h3 className="help-h">In this view · {help.title}</h3>
      <p className="help-bestfor">{help.bestFor}</p>
      <ul className="help-list">
        {help.whatItDoes.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      <dl className="help-dl">
        <dt>Create a relationship</dt>
        <dd>{help.createRelationship}</dd>
        <dt>Move / reparent</dt>
        <dd>{help.reparent}</dd>
        <dt>Change a label</dt>
        <dd>{help.changeLabel}</dd>
        <dt>Delete a relationship</dt>
        <dd>{help.deleteRelationship}</dd>
        <dt>When to switch</dt>
        <dd>{help.whenToSwitch}</dd>
      </dl>

      <RelationshipReference />
    </Modal>
  );
}

/**
 * The expandable deep-dive: every relationship (role) you can assign, with a
 * plain-language definition, a worked example, and how it is drawn in BOTH the
 * Kellogg-Reed diagram and the Dependency tree — so you can predict the effect of
 * an edit before you make it. Collapsed by default so it never crowds the quick
 * orientation above; open it when you want the full reference.
 */
function RelationshipReference() {
  const demoSvgs = useRoleDemoSvgs();
  return (
    <details className="rel-guide">
      <summary className="help-h">Relationship reference — every role, in detail</summary>
      <p className="help-bestfor">
        Each relationship links a <em>dependent</em> word to its <em>head</em>. Below: what the
        term means, an example, and how it shows up in the Kellogg-Reed diagram and the Dependency
        tree — with a little rendered picture of each. Highlighting reflects the dependent.
      </p>
      {RELATIONSHIP_GUIDE.map((family) => (
        <section key={family.title} className="rel-family">
          <h4 className="help-h">{family.title}</h4>
          <p className="rel-blurb">{family.blurb}</p>
          {family.roles.map((doc) => {
            const g = relationshipGloss(doc.role);
            const svgs = demoSvgs[doc.role];
            return (
              <div key={doc.role} className="rel-entry">
                <div className="rel-term">
                  <strong>{g.term}</strong>
                  {g.abbr ? <code className="rel-abbr">{g.abbr}</code> : null}
                </div>
                <p className="rel-detail">{g.detail}</p>
                <dl className="rel-facets">
                  <dt>Example</dt>
                  <dd>{renderEmphasis(doc.example)}</dd>
                  <dt>Kellogg-Reed</dt>
                  <dd>
                    {doc.kr}
                    {svgs ? <DemoFigure svg={svgs.kr} /> : null}
                  </dd>
                  <dt>Dependency tree</dt>
                  <dd>
                    {doc.tree}
                    {svgs ? <DemoFigure svg={svgs.tree} /> : null}
                  </dd>
                </dl>
              </div>
            );
          })}
        </section>
      ))}
    </details>
  );
}

/** A rendered mini-diagram (KR or dependency) inline in the reference. */
function DemoFigure({ svg }: { svg: string }) {
  return <div className="rel-demo" aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Render a string with **double-asterisk** spans as <strong> (used in examples). */
function renderEmphasis(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
