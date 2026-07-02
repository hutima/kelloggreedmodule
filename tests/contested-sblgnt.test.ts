import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lowfatToDocuments, sblgntDialect } from '@/io/lowfat';
import { layoutForMode } from '@/domain/layout';
import { contestedRegistry } from '@/data/contestedSyntax';
import { contestedRegistrySblgnt } from '@/data/contestedSyntaxSblgnt';
import {
  allContestedIssues,
  allAlternateReadings,
  getIssuesForPassage,
  applyAlternateReadingPreview,
} from '@/domain/contested';

/**
 * The SBLGNT-anchored contested-syntax registry (src/data/contestedSyntaxSblgnt.ts)
 * mirrors curated Nestle1904 debates onto SBLGNT's own ids (see
 * scripts/generate-contested-sblgnt.mts). Full id/overlay validation against
 * every network passage is `npm run contested:check`; this offline test covers
 * structural integrity and the one bundled (Philippians) passage.
 */

describe('SBLGNT contested registry — structural integrity', () => {
  it('every reading references a real SBLGNT issue and the same passage', () => {
    const issueById = new Map(contestedRegistrySblgnt.issues.map((i) => [i.id, i] as const));
    for (const r of contestedRegistrySblgnt.readings) {
      const issue = issueById.get(r.issueId);
      expect(issue, `reading ${r.id} → issue ${r.issueId}`).toBeTruthy();
      expect(r.passageId).toBe(issue!.passageId);
    }
  });

  it('every SBLGNT issue is stamped with the SBLGNT sourceId and an sblgnt_ passage id', () => {
    for (const issue of contestedRegistrySblgnt.issues) {
      expect(issue.sourceId).toBe('macula-greek-sblgnt-lowfat');
      expect(issue.passageId.startsWith('sblgnt_')).toBe(true);
      for (const mid of issue.mergePassageIds ?? []) expect(mid.startsWith('sblgnt_')).toBe(true);
    }
    for (const reading of contestedRegistrySblgnt.readings) {
      expect(reading.sourceId).toBe('macula-greek-sblgnt-lowfat');
    }
  });

  it('never reuses a Nestle1904-registry id (every SBLGNT id is edition-suffixed)', () => {
    const nestleIds = new Set([
      ...contestedRegistry.issues.map((i) => i.id),
      ...contestedRegistry.readings.map((r) => r.id),
    ]);
    for (const issue of contestedRegistrySblgnt.issues) expect(nestleIds.has(issue.id)).toBe(false);
    for (const reading of contestedRegistrySblgnt.readings) expect(nestleIds.has(reading.id)).toBe(false);
  });

  it('mirrors a debate for every Nestle1904 issue except the documented converter-limited ones', () => {
    const EXCLUDED = new Set([
      'iss_titus_2_13_granville',
      'iss_matt_4_3_command',
      'iss_2cor_5_4_leedy',
      'iss_col_1_15_firstborn',
      'iss_john_1_14_predicate', // sample doc, not a GNT loader passage
      'iss_1john_1_1_relative_chain', // sample doc
      'iss_gen_1_1_construct', // Hebrew — WLC unchanged by the Greek rebase
    ]);
    const sblgntIssueIds = new Set(contestedRegistrySblgnt.issues.map((i) => i.id));
    for (const issue of contestedRegistry.issues) {
      if (EXCLUDED.has(issue.id)) continue;
      expect(sblgntIssueIds.has(`${issue.id}_sblgnt`), `missing SBLGNT mirror of ${issue.id}`).toBe(true);
    }
  });

  it('registers into the combined accessors alongside the Nestle1904 registry', () => {
    const all = allContestedIssues();
    expect(all.some((i) => i.id === 'iss_phil_1_1_syn')).toBe(true);
    expect(all.some((i) => i.id === 'iss_phil_1_1_syn_sblgnt')).toBe(true);
    const allReadings = allAlternateReadings();
    expect(allReadings.some((r) => r.id === 'alt_phil_1_1_to_saints_sblgnt')).toBe(true);
  });
});

describe('SBLGNT contested registry — bundled Philippians 1:1', () => {
  const doc = () => {
    const xml = readFileSync(resolve(process.cwd(), 'public/sblgnt/11-philippians.xml'), 'utf8');
    return lowfatToDocuments(xml, {
      book: 'Philippians',
      dialect: sblgntDialect,
      docIdPrefix: 'sblgnt',
    }).find((d) => d.id === 'sblgnt_philippians_0')!;
  };

  it('the σύν-phrase attachment issue shows on the SBLGNT passage', () => {
    const issues = getIssuesForPassage(doc());
    expect(issues.some((i) => i.id === 'iss_phil_1_1_syn_sblgnt')).toBe(true);
  });

  it('the alternate reading previews and lays out in every structural mode', () => {
    const d = doc();
    const issue = contestedRegistrySblgnt.issues.find((i) => i.id === 'iss_phil_1_1_syn_sblgnt')!;
    const reading = contestedRegistrySblgnt.readings.find(
      (r) => r.id === issue.alternateReadingIds[0],
    )!;
    for (const t of issue.affectedTokenIds) expect(d.tokens.some((tok) => tok.id === t)).toBe(true);
    const preview = applyAlternateReadingPreview(d, reading);
    for (const mode of ['kellogg-reed', 'phrase-block', 'dependency', 'morphology'] as const) {
      expect(() => layoutForMode(mode, preview, preview.layoutHints)).not.toThrow();
    }
  });
});
