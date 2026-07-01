import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lowfatToDocuments } from '@/io/lowfat';
import { sampleDocuments } from '@/fixtures';
import { layoutForMode } from '@/domain/layout';
import {
  contestedRegistry,
} from '@/data/contestedSyntax';
import {
  getIssuesForPassage,
  getIssueById,
  getAlternateReadings,
  getReadingById,
  getAffectedIds,
  hasContestedData,
  isMergeIssue,
  applyAlternateReadingPreview,
  canAdoptAlternateReading,
  adoptAlternateReading,
  diffBaseAndAlternate,
  buildUserVariants,
  mergeUserVariants,
  isCombinedPassage,
  setUserContested,
  alignedDiff,
} from '@/domain/contested';
import { combinePassage } from '@/io';
import type { KrDocument } from '@/domain/schema';

/**
 * The contested-syntax registry must stay anchored to the REAL base parse data.
 * Offline passages (the bundled fixtures + bundled Philippians) are fully
 * checked here; network passages (Titus / Romans / Genesis / 1 Timothy) are
 * structurally checked here and id-checked by `npm run contested:check`.
 */

let philippians: KrDocument[] | null = null;
function loadOffline(passageId: string): KrDocument | undefined {
  if (passageId.startsWith('doc_sample')) return sampleDocuments.find((d) => d.id === passageId);
  if (passageId.startsWith('gnt_philippians_')) {
    if (!philippians) {
      const xml = readFileSync(resolve(process.cwd(), 'public/gnt/11-philippians.xml'), 'utf8');
      philippians = lowfatToDocuments(xml, { book: 'Philippians' });
    }
    return philippians.find((d) => d.id === passageId);
  }
  return undefined; // network-only passage — checked by the registry-check script
}

describe('contested registry — structural integrity', () => {
  it('every reading references a real issue and the same passage', () => {
    const issueById = new Map(contestedRegistry.issues.map((i) => [i.id, i] as const));
    for (const r of contestedRegistry.readings) {
      const issue = issueById.get(r.issueId);
      expect(issue, `reading ${r.id} → issue ${r.issueId}`).toBeTruthy();
      expect(r.passageId).toBe(issue!.passageId);
    }
  });

  it('every alternateReadingId resolves to a reading', () => {
    for (const issue of contestedRegistry.issues) {
      for (const id of issue.alternateReadingIds) {
        expect(getReadingById(id), `issue ${issue.id} → reading ${id}`).toBeTruthy();
      }
    }
  });

  it('covers both languages and several source types', () => {
    const types = new Set(contestedRegistry.issues.map((i) => i.sourceType));
    expect(types.has('syntax-only')).toBe(true);
    expect(types.has('semantic-only')).toBe(true);
    expect(types.has('textual-variant')).toBe(true);
    // A passage-inclusion issue is present (Luke 23:34's forgiveness saying).
    expect(types.has('passage-inclusion')).toBe(true);
    // A Hebrew (WLC) passage is present.
    expect(contestedRegistry.issues.some((i) => i.passageId.startsWith('wlc_'))).toBe(true);
  });
});

describe('contested registry — major NT textual variants', () => {
  const IDS = [
    'iss_mark_1_41_variant',
    'iss_john_1_18_variant',
    'iss_acts_20_28_variant',
    'iss_rom_5_1_variant',
    'iss_luke_23_34_inclusion',
    'iss_1cor_13_3_variant',
    'iss_matt_5_22_variant',
    'iss_jude_5_variant',
    'iss_2pet_3_10_variant',
    'iss_john_3_13_variant',
    'iss_rom_8_28_variant',
    'iss_mark_16_9_inclusion',
    'iss_john_7_53_inclusion',
    'iss_luke_22_43_inclusion',
    'iss_1john_5_7_comma',
  ];

  it('registers all curated textual variants', () => {
    for (const id of IDS) expect(getIssueById(id), id).toBeTruthy();
    // A solid library of the most-impactful variants (15+ and counting).
    expect(IDS.length).toBeGreaterThanOrEqual(15);
  });

  it('each variant reading carries a differing wording and never mutates the base', () => {
    for (const id of IDS) {
      const readings = getAlternateReadings(id);
      expect(readings.length, id).toBeGreaterThan(0);
      for (const r of readings) {
        // A textual/inclusion reading depends on a different wording — flagged
        // explicitly, anchored to a real base token, and NOT an adoptable edit.
        expect(r.textualVariant?.differsFromBase, r.id).toBe(true);
        expect(r.textualVariant?.affectedBaseTokenIds?.length, r.id).toBeGreaterThan(0);
        expect(canAdoptAlternateReading(r), r.id).toBe(false);
      }
    }
  });

  it('honours the ACTUAL Nestle1904 base: Romans 5:1 is the subjunctive, indicative is the variant', () => {
    const issue = getIssueById('iss_rom_5_1_variant')!;
    expect(issue.defaultReading.label).toMatch(/subjunctive|ἔχωμεν/);
    const alt = getAlternateReadings(issue.id)[0]!;
    expect(alt.textualVariant?.variantTokens?.[0]?.surface).toBe('ἔχομεν');
  });

  it('John 1:18 anchors to θεός and offers the υἱός reading', () => {
    const issue = getIssueById('iss_john_1_18_variant')!;
    expect(issue.affectedTokenIds).toEqual(['t_430010180060010']);
    const alt = getAlternateReadings(issue.id)[0]!;
    expect(alt.textualVariant?.variantTokens?.[0]?.surface).toBe('υἱός');
  });
});

describe('contested registry — cross-sentence-boundary (merge) issues', () => {
  const rom = getIssueById('iss_rom_9_5_doxology')!;

  it('Romans 9:5 spans two base sentences and is a merge issue', () => {
    expect(rom.mergePassageIds).toEqual(['gnt_romans_228', 'gnt_romans_229']);
    expect(isMergeIssue(rom)).toBe(true);
    // A single-sentence issue is not a merge issue.
    expect(isMergeIssue(getIssueById('iss_1john_1_1_relative_chain')!)).toBe(false);
  });

  it('the badge/panel attach to EVERY spanned sentence, not just the first', () => {
    for (const id of rom.mergePassageIds!) {
      const fakeDoc = { id } as unknown as KrDocument;
      expect(getIssuesForPassage(fakeDoc).map((i) => i.id)).toContain(rom.id);
      expect(hasContestedData(fakeDoc)).toBe(true);
    }
  });

  it('its overlay is authored against the combined (s0_/s1_/disc_) ids', () => {
    const reading = getReadingById('alt_rom_9_5_to_christ')!;
    expect(reading.sourceType).toBe('syntax-only');
    const update = reading.syntaxPatch?.relations?.update ?? {};
    expect(Object.keys(update)).toContain('disc_r1');
    expect(update.disc_r1!.headId).toBe('s0_w_450090050080010');
    expect(update.disc_r1!.type).toBe('apposition');
  });
});

describe('contested registry — ids exist in the real base passages (offline)', () => {
  for (const issue of contestedRegistry.issues) {
    it(`${issue.id} (${issue.verseRef})`, () => {
      let doc: KrDocument | undefined;
      if (issue.mergePassageIds?.length) {
        // A cross-boundary issue is authored against the COMBINED document.
        const parts = issue.mergePassageIds.map(loadOffline);
        if (parts.some((p) => !p)) return; // some spanned sentence is network-only
        doc = combinePassage(parts as KrDocument[]);
      } else {
        doc = loadOffline(issue.passageId);
      }
      if (!doc) return; // network passage — skipped offline
      const tokens = new Set(doc.tokens.map((t) => t.id));
      const nodes = new Set(doc.syntax.nodes.map((n) => n.id));
      const rels = new Set(doc.syntax.relations.map((r) => r.id));
      for (const t of issue.affectedTokenIds) expect(tokens.has(t), `token ${t}`).toBe(true);
      for (const n of issue.affectedNodeIds ?? []) expect(nodes.has(n), `node ${n}`).toBe(true);
      for (const r of issue.affectedRelationIds ?? []) expect(rels.has(r), `relation ${r}`).toBe(true);

      for (const reading of getAlternateReadings(issue.id)) {
        // overlay applies and every mode lays out without throwing
        const preview = applyAlternateReadingPreview(doc, reading);
        for (const mode of ['kellogg-reed', 'phrase-block', 'dependency', 'morphology'] as const) {
          expect(() => layoutForMode(mode, preview, preview.layoutHints)).not.toThrow();
        }
      }
    });
  }
});

describe('contested helpers — preview / adopt / diff', () => {
  const oneJohn = sampleDocuments.find((d) => d.id === 'doc_sample_1john_1_1')!;
  const syntaxReading = getReadingById('alt_1john_1_1_chain')!;
  const semanticReading = getReadingById('alt_phil_3_9_objective')!;
  const textualReading = getReadingById('alt_1tim_3_16_theos')!;

  it('getIssuesForPassage / hasContestedData match by document id', () => {
    expect(hasContestedData(oneJohn)).toBe(true);
    expect(getIssuesForPassage(oneJohn).map((i) => i.id)).toContain('iss_1john_1_1_relative_chain');
    expect(getIssueById('iss_1john_1_1_relative_chain')).toBeTruthy();
  });

  it('getAffectedIds returns the declared ids', () => {
    const issue = getIssueById('iss_1john_1_1_relative_chain')!;
    const a = getAffectedIds(issue);
    expect(a.tokenIds).toEqual(issue.affectedTokenIds);
    expect(a.nodeIds).toEqual(issue.affectedNodeIds ?? []);
  });

  it('a syntax alternate changes the tree on preview; the base is untouched', () => {
    const preview = applyAlternateReadingPreview(oneJohn, syntaxReading);
    expect(preview).not.toBe(oneJohn);
    const r2 = preview.syntax.relations.find((r) => r.id === 'r2')!;
    expect(r2.headId).toBe('n_rc1');
    expect(r2.type).toBe('conjunct');
    // base unchanged
    expect(oneJohn.syntax.relations.find((r) => r.id === 'r2')!.headId).toBe('n_root');
  });

  it('a semantic-only / textual alternate returns the base unchanged', () => {
    expect(applyAlternateReadingPreview(oneJohn, semanticReading)).toBe(oneJohn);
    expect(applyAlternateReadingPreview(oneJohn, textualReading)).toBe(oneJohn);
  });

  it('only a structural alternate can be adopted', () => {
    expect(canAdoptAlternateReading(syntaxReading)).toBe(true);
    expect(canAdoptAlternateReading(semanticReading)).toBe(false);
    expect(canAdoptAlternateReading(textualReading)).toBe(false);
    expect(adoptAlternateReading(oneJohn, syntaxReading, '2024-01-01T00:00:00.000Z')).not.toBeNull();
    expect(adoptAlternateReading(oneJohn, semanticReading, '2024-01-01T00:00:00.000Z')).toBeNull();
  });

  it('diffBaseAndAlternate marks the changed relations / flags', () => {
    const preview = applyAlternateReadingPreview(oneJohn, syntaxReading);
    const d = diffBaseAndAlternate(oneJohn, preview, syntaxReading);
    expect(d.changedRelationIds).toEqual(expect.arrayContaining(['r2', 'r3']));
    expect(d.semanticOnly).toBe(false);
    expect(d.textualVariant).toBe(false);

    const sem = diffBaseAndAlternate(oneJohn, oneJohn, semanticReading);
    expect(sem.semanticOnly).toBe(true);
    expect(sem.changedRelationIds).toContain('r_s43_36');

    const tex = diffBaseAndAlternate(oneJohn, oneJohn, textualReading);
    expect(tex.textualVariant).toBe(true);
  });
});

describe('user / LLM-imported variant readings', () => {
  const fox = () => sampleDocuments.find((d) => d.id === 'doc_sample_fox')!;

  it('builds a grouping issue + full-doc readings, previewed verbatim', () => {
    const base = fox();
    const variantDoc = { ...fox(), id: 'doc_v1', title: 'Alt' };
    const { issue, readings } = buildUserVariants(base.id, base.title, [
      { label: 'Adverb with verb', impact: 'Reads “quickly” with the verb.', doc: variantDoc },
    ]);
    expect(issue.passageId).toBe(base.id);
    expect(issue.alternateReadingIds).toEqual([readings[0]!.id]);
    expect(readings[0]!.origin).toBe('user');
    expect(readings[0]!.fullDoc?.id).toBe('doc_v1');
    // Preview returns the full variant doc verbatim (not a patched base).
    expect(applyAlternateReadingPreview(base, readings[0]!).id).toBe('doc_v1');
    // A full-doc variant is not a structural patch, so it can't be "adopted".
    expect(canAdoptAlternateReading(readings[0]!)).toBe(false);
  });

  it('merges added variants into the existing set (stable issue, appended readings)', () => {
    const base = fox();
    const a = buildUserVariants(base.id, base.title, [{ label: 'A', doc: { ...fox(), id: 'a' } }]);
    const b = buildUserVariants(base.id, base.title, [{ label: 'B', doc: { ...fox(), id: 'b' } }]);
    const merged = mergeUserVariants(a, b);
    expect(merged.readings).toHaveLength(2);
    expect(merged.issue.id).toBe(a.issue.id);
    expect(merged.issue.alternateReadingIds).toEqual(merged.readings.map((r) => r.id));
    setUserContested([], []); // leave the module overlay clean for other tests
  });

  it('flags a combined multi-sentence passage (variants attach to a single sentence only)', () => {
    const single = fox();
    const combined = combinePassage([fox(), sampleDocuments.find((d) => d.id === 'doc_sample_word_flesh')!]);
    expect(isCombinedPassage(single)).toBe(false);
    expect(isCombinedPassage(combined)).toBe(true);
  });
});

describe('variant difference tagging (surface alignment)', () => {
  // Romans 9:5-style ambiguity: does "God" (θεὸς) attach up to the participle
  // ("Christ, who is God over all") or head its own doxology ("God be blessed")?
  // The two parses share the SAME words but attach "God" differently — the aligner
  // must flag exactly that word even though the ids don't match.
  const mk = (idp: string, godHead: 'n_christ' | 'n_blessed'): KrDocument => ({
    schemaVersion: 1, id: `doc_${idp}`, title: 'Rom 9:5', language: 'grc',
    text: 'Χριστὸς ὁ ὢν θεὸς εὐλογητός', notes: '',
    createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z', layoutHints: {},
    tokens: [
      { id: `${idp}t0`, index: 0, surface: 'Χριστὸς', pos: 'propernoun', language: 'grc' },
      { id: `${idp}t1`, index: 1, surface: 'ὢν', pos: 'participle', language: 'grc' },
      { id: `${idp}t2`, index: 2, surface: 'θεὸς', pos: 'noun', language: 'grc' },
      { id: `${idp}t3`, index: 3, surface: 'εὐλογητός', pos: 'adjective', language: 'grc' },
    ],
    syntax: {
      rootId: 'c0',
      nodes: [
        { id: 'c0', kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'n_christ', kind: 'word', role: 'subject', tokenIds: [`${idp}t0`] },
        { id: 'n_ptc', kind: 'word', role: 'adjectival', tokenIds: [`${idp}t1`] },
        { id: 'n_god', kind: 'word', role: godHead === 'n_christ' ? 'predicateNominative' : 'subject', tokenIds: [`${idp}t2`] },
        { id: 'n_blessed', kind: 'word', role: 'predicateAdjective', tokenIds: [`${idp}t3`] },
      ],
      relations: [
        { id: 'r1', type: 'subject', headId: 'c0', dependentId: 'n_christ' },
        { id: 'r2', type: 'adjectival', headId: 'n_christ', dependentId: 'n_ptc' },
        // the contested attachment: God predicated of Christ, OR its own subject
        { id: 'r3', type: godHead === 'n_christ' ? 'predicateNominative' : 'subject', headId: godHead, dependentId: 'n_god' },
        { id: 'r4', type: 'predicateAdjective', headId: 'c0', dependentId: 'n_blessed' },
      ],
    },
  });

  it('aligns identical words and flags only the one that attaches differently', () => {
    const base = mk('b', 'n_christ');
    const variant = mk('v', 'n_blessed');
    const { diff, matched } = alignedDiff(base, variant);
    expect(matched).toBe(true);
    // "God" changed in BOTH frames (base + variant ids), the others did not.
    expect(diff.changedTokenIds).toContain('bt2');
    expect(diff.changedTokenIds).toContain('vt2');
    expect(diff.changedTokenIds).not.toContain('bt0'); // Χριστὸς unchanged
    expect(diff.summary.join(' ')).toMatch(/θεὸς/);
  });

  it('honours LLM-supplied diff words (precedence over auto-detection)', () => {
    const base = mk('b', 'n_christ');
    const variant = mk('v', 'n_christ'); // structurally identical…
    const { diff } = alignedDiff(base, variant, ['εὐλογητός']); // …but LLM says THIS word differs
    expect(diff.changedTokenIds).toContain('bt3');
    expect(diff.changedTokenIds).toContain('vt3');
    expect(diff.changedTokenIds).not.toContain('bt2');
  });

  it('reports not-matched when the words do not overlap', () => {
    const base = mk('b', 'n_christ');
    const other = sampleDocuments.find((d) => d.id === 'doc_sample_fox')!; // a totally different sentence
    const { matched, diff } = alignedDiff(base, other);
    expect(matched).toBe(false);
    expect(diff.summary.join(' ')).toMatch(/could not align/i);
  });
});
