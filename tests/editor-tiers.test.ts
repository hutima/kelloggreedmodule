import { describe, it, expect } from 'vitest';
import {
  adapterFor,
  dependencyAdapter,
  phraseBlockAdapter,
  morphologyAdapter,
  kelloggReedAdapter,
} from '@/ui/editor/adapters';
import { intentScope, type EditIntent } from '@/ui/editor/types';
import { helpFor } from '@/ui/editor/help';
import { createDocument } from '@/domain/model';
import type { DiagramMode } from '@/domain/layout';
import type { KrDocument } from '@/domain/schema';

/**
 * Tier-aware adapter contract. Basic Edit must be visual-first and chip-based;
 * Advanced Edit keeps the full modal-rich set. Every diagram mode supplies its
 * own Basic and Advanced behavior plus mode/tier help.
 */
function makeDoc(): KrDocument {
  const doc = createDocument({ language: 'grc', title: 'Test' }, () => '2024-01-01T00:00:00.000Z');
  const rootId = doc.syntax.rootId;
  return {
    ...doc,
    tokens: [
      { id: 't1', index: 0, surface: 'ὁ' },
      { id: 't2', index: 1, surface: 'λόγος' },
      { id: 't3', index: 2, surface: 'ἦν' },
    ],
    syntax: {
      rootId,
      nodes: [
        { id: rootId, kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'art', kind: 'word', role: 'determiner', tokenIds: ['t1'] },
        { id: 'subj', kind: 'word', role: 'subject', tokenIds: ['t2'] },
        { id: 'verb', kind: 'word', role: 'predicate', tokenIds: ['t3'] },
      ],
      relations: [
        { id: 'r_art', type: 'determiner', headId: 'subj', dependentId: 'art' },
        { id: 'r_subj', type: 'subject', headId: rootId, dependentId: 'subj' },
        { id: 'r_verb', type: 'predicate', headId: rootId, dependentId: 'verb' },
      ],
    },
    layoutHints: { subj: { offsetX: 4 } },
  };
}

const ALL: DiagramMode[] = ['kellogg-reed', 'phrase-block', 'dependency', 'morphology'];
const kinds = (intents: { intent: EditIntent }[]) => intents.map((a) => a.intent.kind);

describe('tier-aware adapters — contract', () => {
  it('every adapter exposes basic + advanced + help + compat wrapper', () => {
    for (const mode of ALL) {
      const a = adapterFor(mode);
      const sel = { nodeId: 'subj' };
      expect(typeof a.getBasicActions).toBe('function');
      expect(typeof a.getAdvancedActions).toBe('function');
      // The compat wrapper routes by tier.
      expect(a.getActions(makeDoc(), sel, 'basic')).toEqual(a.getBasicActions(makeDoc(), sel));
      expect(a.getActions(makeDoc(), sel, 'advanced')).toEqual(a.getAdvancedActions(makeDoc(), sel));
      // Help differs by tier.
      expect(a.getHelpContent('basic').title).not.toBe(a.getHelpContent('advanced').title);
    }
  });

  it('compat getActions defaults to Advanced when no tier is passed', () => {
    const doc = makeDoc();
    expect(kelloggReedAdapter.getActions(doc, { nodeId: 'subj' })).toEqual(
      kelloggReedAdapter.getAdvancedActions(doc, { nodeId: 'subj' }),
    );
  });

  it('Basic actions lead with plain-English chips, Advanced does not require them', () => {
    const doc = makeDoc();
    const basic = dependencyAdapter.getBasicActions(doc, { nodeId: 'subj' });
    expect(basic.some((a) => a.chip)).toBe(true);
    // Advanced opens modals / full lists, not one-tap chips.
    const adv = dependencyAdapter.getAdvancedActions(doc, { nodeId: 'subj' });
    expect(adv.some((a) => a.chip)).toBe(false);
  });
});

describe('Kellogg-Reed tiers', () => {
  it('Basic relation actions allow relabel chips, reattach, and delete (no modal)', () => {
    const doc = makeDoc();
    const actions = kelloggReedAdapter.getBasicActions(doc, { relationId: 'r_subj' });
    expect(actions.some((a) => a.chip && a.intent.kind === 'changeRelationType')).toBe(true);
    expect(kinds(actions)).toContain('startRelink');
    expect(kinds(actions)).toContain('removeRelation');
    // Basic must NOT open the full relation builder.
    expect(kinds(actions)).not.toContain('openRelationBuilder');
  });

  it('Advanced exposes the full relation builder + layout reset', () => {
    const doc = makeDoc();
    const rel = kelloggReedAdapter.getAdvancedActions(doc, { relationId: 'r_subj' });
    expect(kinds(rel)).toContain('openRelationBuilder');
    const node = kelloggReedAdapter.getAdvancedActions(doc, { nodeId: 'subj' });
    expect(kinds(node)).toContain('resetLayout'); // hint exists on `subj`
  });
});

describe('Phrase/Block tiers', () => {
  it('Basic supports row-based promote/demote/move-under and plain chips (no big modal)', () => {
    const doc = makeDoc();
    const actions = phraseBlockAdapter.getBasicActions(doc, { nodeId: 'art' });
    const ks = kinds(actions);
    expect(ks).toContain('promoteNode');
    expect(ks).toContain('demoteNode');
    expect(ks).toContain('setEditTool'); // "Move under…" enters the move tool
    expect(actions.some((a) => a.chip)).toBe(true);
    expect(ks).not.toContain('openBlockEditor');
  });

  it('Advanced keeps the full BlockEditor', () => {
    const doc = makeDoc();
    const primary = phraseBlockAdapter.getPrimaryAction(doc, { nodeId: 'art' }, 'advanced');
    expect(primary?.intent.kind).toBe('openBlockEditor');
  });
});

describe('Dependency tiers', () => {
  it('Basic leads with visual "Attach to…" and offers quick chips', () => {
    const doc = makeDoc();
    const primary = dependencyAdapter.getPrimaryAction(doc, { nodeId: 'subj' }, 'basic');
    expect(primary?.intent.kind).toBe('startVisualLink');
  });

  it('Advanced leads with the manual relation builder', () => {
    const doc = makeDoc();
    const primary = dependencyAdapter.getPrimaryAction(doc, { nodeId: 'subj' }, 'advanced');
    expect(primary?.intent.kind).toBe('openRelationBuilder');
  });
});

describe('Morphology tiers', () => {
  it('Basic offers quick gloss, simple function chips, and structure-mode switches — no full grid', () => {
    const doc = makeDoc();
    const actions = morphologyAdapter.getBasicActions(doc, { nodeId: 'subj' });
    const ks = kinds(actions);
    expect(ks).toContain('openQuickGloss');
    expect(ks).toContain('switchDiagramMode');
    expect(actions.some((a) => a.chip && a.intent.kind === 'setRole')).toBe(true);
    // Basic must not jump straight to the full word-details (Advanced) as primary.
    expect(actions[0]!.intent.kind).not.toBe('openAdvancedWordDetails');
  });

  it('Advanced leads with full Word Details', () => {
    const doc = makeDoc();
    const primary = morphologyAdapter.getPrimaryAction(doc, { nodeId: 'subj' }, 'advanced');
    expect(primary?.intent.kind).toBe('openAdvancedWordDetails');
  });
});

describe('help content', () => {
  it('gives distinct, practical guidance for every mode and tier', () => {
    for (const mode of ALL) {
      for (const tier of ['basic', 'advanced'] as const) {
        const h = helpFor(mode, tier);
        expect(h.title.length).toBeGreaterThan(0);
        expect(h.bestFor.length).toBeGreaterThan(0);
        expect(h.whatItDoes.length).toBeGreaterThan(0);
        expect(h.createRelationship.length).toBeGreaterThan(0);
        expect(h.whenToSwitch.length).toBeGreaterThan(0);
      }
    }
    // Morphology help must point users to structure modes.
    expect(helpFor('morphology', 'basic').whenToSwitch.toLowerCase()).toMatch(/dependency|phrase/);
  });
});

describe('intent scope', () => {
  it('classifies tool, modal, layout, sermon, and syntax intents', () => {
    expect(intentScope({ kind: 'setEditTool', tool: 'link' })).toBe('tool');
    expect(intentScope({ kind: 'switchDiagramMode', mode: 'dependency' })).toBe('tool');
    expect(intentScope({ kind: 'openQuickGloss', nodeId: 'x' })).toBe('modal');
    expect(intentScope({ kind: 'resetLayout', nodeId: 'x' })).toBe('layout');
    expect(intentScope({ kind: 'toggleHighlight', anchor: { type: 'node', nodeId: 'x' }, category: 'emphasis' })).toBe('sermon');
    expect(intentScope({ kind: 'promoteNode', nodeId: 'x' })).toBe('syntax');
  });
});
