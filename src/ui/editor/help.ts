import type { DiagramMode } from '@/domain/layout';
import type { EditHelpContent, EditTier } from './types';

/**
 * Mode-aware, tier-aware "How to edit" content. Practical and concrete: every
 * entry answers the same questions (create a relationship, reparent, change a
 * label, delete, when to switch) so the help reads the same way in every mode
 * but says the right thing for THIS mode and tier.
 */

// Partial: a visualization without its own help (e.g. the Dependency Tree, which
// shares the arc Dependency view's editing) falls back in `helpFor`.
type HelpTable = Partial<Record<DiagramMode, Record<EditTier, EditHelpContent>>>;

const HELP: HelpTable = {
  'kellogg-reed': {
    basic: {
      title: 'Kellogg-Reed · Basic Edit',
      bestFor:
        'Formal sentence-diagram review and presentation — the polished "grammar on the board" view.',
      whatItDoes: [
        'Tap a word or a line to select it; a compact toolbar appears.',
        'Use the quick chips to relabel a relationship in one tap.',
        'Reattach a relationship by choosing Reattach, then clicking the new word.',
        'Add study notes and highlights right from the toolbar.',
      ],
      createRelationship:
        'Select a word, choose Reattach (head), then click the word it should attach to, and pick a label.',
      reparent:
        'Select the line or word, choose Reattach head, then click the new governing word.',
      changeLabel: 'Select the relationship line and tap one of the quick relationship chips.',
      deleteRelationship: 'Select the line and choose Delete relationship.',
      whenToSwitch:
        'Layout changes here are visual only. Switch to Advanced for exact roles or parsing; use Phrase/Block to restructure for study.',
    },
    advanced: {
      title: 'Kellogg-Reed · Advanced Edit',
      bestFor: 'Precise correction of roles, relationships, parsing, and visual placement.',
      whatItDoes: [
        'Full relationship builder and role list.',
        'Word details: lemma, gloss, part of speech, and morphology.',
        'Reset visual placement (layout hints) without touching the syntax.',
        'Delete nodes and relations.',
      ],
      createRelationship: 'Open "Attach to another word…" and pick the head and the exact role.',
      reparent: 'Use the relationship builder or "Reattach head" to choose the new head precisely.',
      changeLabel: 'Open "Change relationship type…" and search the full role list.',
      deleteRelationship: 'Select the relation and choose Delete relation.',
      whenToSwitch:
        'Layout edits stay visual and never change syntax. Return to Basic for quick review and presentation.',
    },
  },
  'phrase-block': {
    basic: {
      title: 'Phrase / Block · Basic Edit',
      bestFor:
        'The recommended study editor — phrasing and clause structure, Biblearc-style.',
      whatItDoes: [
        'Workflow: Add clause → place words from the Unassigned bank → set each word\'s Function → pick which clause it\'s In → set its level → relate clauses to each other.',
        'A word\'s Function dropdown lists every clause part — including Verb — and the In-clause dropdown puts it in the right clause.',
        'Promote / Demote / Move under… set the level (also Shift+Tab / Tab).',
        'Remove from diagram sends a word back to the Unassigned bank; its × there deletes it for good.',
      ],
      createRelationship:
        'Place the word, choose its Function (Subject, Verb, Object, a modifier…), then pick the clause it belongs to under In clause. For a modifier, use Move under to attach it to the word it modifies.',
      reparent: 'Drag a row onto another to nest it under that block, or use Promote / Demote to change the outline level, In clause to move it to another clause, or Move under to pick any new parent.',
      changeLabel: 'Select the row and choose from the Function dropdown (words) or Clause type dropdown (clauses).',
      deleteRelationship:
        'Two-step delete: Remove from diagram (or Delete key) puts a word back in the Unassigned bank; delete it there with × to remove it completely. Deleting a clause sends its words back to the bank.',
      whenToSwitch:
        'Editing is available here and in Kellogg-Reed; both write to the same structure, so Explore and Study update too. Use Advanced for a less common relationship or exact parsing.',
    },
    advanced: {
      title: 'Phrase / Block · Advanced Edit',
      bestFor: 'Precise clause typing, full role lists, and explicit move-under targets.',
      whatItDoes: [
        'Full clause-type and syntactic-role lists.',
        'Move under any node from a complete list.',
        'Promote / demote and mark implied / elided.',
        'Open full Word Details when needed.',
      ],
      createRelationship: 'Open the block editor and choose a move-under target with an explicit role.',
      reparent: 'Use the block editor\'s Move-under list or Promote / Demote buttons.',
      changeLabel: 'Pick a clause type or role from the full list in the block editor.',
      deleteRelationship: 'Detach or delete the block from the block editor.',
      whenToSwitch: 'Return to Basic for fast, study-friendly restructuring.',
    },
  },
  dependency: {
    basic: {
      title: 'Dependency · Basic Edit',
      bestFor: 'The cleanest way to link words directly — head and dependent.',
      whatItDoes: [
        'Arrows show dependency: the dependent points to the word it depends on.',
        'Pick the Link tool, click the dependent word, then click its head.',
        'A preview arc and quick relationship chips appear before you save.',
        'Existing arcs can be selected, relabeled, reattached, or deleted.',
      ],
      createRelationship:
        'To show that "home" modifies "run," pick Link, click "home," click "run," then choose Modifier.',
      reparent: 'Select the arc and choose Reattach head (or dependent), then click the new word.',
      changeLabel: 'Select the arc and tap a quick relationship chip.',
      deleteRelationship: 'Select the arc and choose Delete arc.',
      whenToSwitch:
        'Use Advanced for exact labels and manual endpoint selection. Use Phrase/Block for clause structure.',
    },
    advanced: {
      title: 'Dependency · Advanced Edit',
      bestFor: 'Exact relationship labels and manual endpoint selection.',
      whatItDoes: [
        'Full relationship builder with complete node lists.',
        'Search the entire role list.',
        'Reverse a relation\'s direction.',
        'Open full Word Details.',
      ],
      createRelationship: 'Open the relationship builder, pick dependent and head from the lists, then the role.',
      reparent: 'Reattach an endpoint from the builder or with Reattach head / dependent.',
      changeLabel: 'Open "Change relationship type…" and search the full list.',
      deleteRelationship: 'Select the relation and choose Delete relation.',
      whenToSwitch: 'Return to Basic for fast visual linking.',
    },
  },
  morphology: {
    basic: {
      title: 'Morphology / Word Details · Basic Edit',
      bestFor: 'Word-level study — glosses, notes, and quick function marking.',
      whatItDoes: [
        'Tap a word card to edit its gloss or add a study note.',
        'Highlight a word, or mark a simple function (Subject, Verb, Object, Modifier).',
        'No parsing grid here — Basic stays light.',
        'Jump to Dependency or Phrase/Block to edit sentence structure.',
      ],
      createRelationship:
        'Relationships are not built here. Use "Edit structure in Dependency" or Phrase/Block.',
      reparent: 'Switch to Phrase/Block to move a phrase, or Dependency to relink a word.',
      changeLabel: 'Tap a simple function chip (Subject, Verb, Object, Modifier).',
      deleteRelationship: 'Relationships are edited in Dependency or Phrase/Block, not here.',
      whenToSwitch:
        'This mode is for parsing and word study. Use Phrase/Block or Dependency for structure.',
    },
    advanced: {
      title: 'Morphology / Word Details · Advanced Edit',
      bestFor: 'Full Greek/Hebrew parsing and lexical correction.',
      whatItDoes: [
        'Lexical (surface, lemma, gloss), part of speech.',
        'Nominal parsing (case, gender, number) and verbal parsing (person, number, tense, voice, mood).',
        'Degree, implied/elided, and parsing notes.',
        'Reset manual parsing back to the inferred values where available.',
      ],
      createRelationship: 'Use Dependency or Phrase/Block; this mode does not build relationships.',
      reparent: 'Switch to Phrase/Block or Dependency for structural edits.',
      changeLabel: 'Set the part of speech and morphology precisely in Word Details.',
      deleteRelationship: 'Edit relationships in Dependency or Phrase/Block.',
      whenToSwitch: 'Return to Basic for quick study notes; use Dependency/Phrase/Block for structure.',
    },
  },
};

export function helpFor(mode: DiagramMode, tier: EditTier): EditHelpContent {
  return (HELP[mode] ?? HELP.dependency ?? HELP['kellogg-reed'])![tier];
}
