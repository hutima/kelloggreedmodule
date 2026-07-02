/**
 * merge-contested-sblgnt — combine every JSON part written by
 * scripts/generate-contested-sblgnt.mts into the final
 * src/data/contestedSyntaxSblgnt.ts. One-off, not part of the runtime app.
 *
 *   node scripts/merge-contested-sblgnt.mjs
 */
import { readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const partsDir = resolve(root, '.contested-sblgnt-parts');

const files = readdirSync(partsDir).filter((f) => f.endsWith('.json'));
const issues = [];
const readings = [];
for (const f of files) {
  const part = JSON.parse(readFileSync(resolve(partsDir, f), 'utf8'));
  issues.push(...part.issues);
  readings.push(...part.readings);
}
console.log(`Merged ${files.length} parts → ${issues.length} issues, ${readings.length} readings.`);

const fmt = (v, indent = 2) => {
  const pad = ' '.repeat(indent);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    return `[\n${v.map((x) => pad + '  ' + fmt(x, indent + 2)).join(',\n')},\n${pad}]`;
  }
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (!keys.length) return '{}';
    return `{\n${keys.map((k) => `${pad}  ${JSON.stringify(k)}: ${fmt(v[k], indent + 2)}`).join(',\n')},\n${pad}}`;
  }
  return JSON.stringify(v);
};

const header = `import { ContestedRegistrySchema, type ContestedRegistry } from '@/domain/schema';

/**
 * SBLGNT-ANCHORED CONTESTED-SYNTAX ENTRIES.
 *
 * GENERATED (then hand-reviewed) from the curated Nestle1904 registry in
 * \`contestedSyntax.ts\` by \`scripts/generate-contested-sblgnt.mts\` +
 * \`scripts/merge-contested-sblgnt.mjs\`: every id remapped to its SBLGNT
 * Lowfat counterpart via Strong's-number + within-verse position matching
 * (mirrors \`alignParallel\`'s cross-edition alignment), with relation ids
 * re-resolved by following the mapped dependent word to its CURRENT parent
 * relation in the SBLGNT tree (never re-derived from scratch — this file only
 * relocates the SAME curated debate onto SBLGNT's ids). Prose (label,
 * summary, description, bibliography…) is copied verbatim from the
 * Nestle1904 entry, since it is the same scholarly debate.
 *
 * A few Nestle1904 issues are NOT mirrored here: their debate framing assumes
 * a tree SHAPE that the current SBLGNT converter's head-inference does not
 * yet reproduce for that specific construction (long adjective/apposition
 * chains without explicit Lowfat role markers — see "Bugs discovered" in
 * docs/sblgnt-kellogg-reed-plan.md). Shipping a possibly-misleading debate
 * description on top of a degraded base tree would violate the project's
 * "prefer honest over falsely precise" rule, so those stay Nestle1904-only
 * until the converter gap is fixed: iss_titus_2_13_granville,
 * iss_matt_4_3_command, iss_2cor_5_4_leedy, iss_col_1_15_firstborn. Romans
 * 9:5 (a cross-sentence merge issue) is hand-authored separately below,
 * verified against a real \`combinePassage\` run over the SBLGNT sentences.
 *
 * Regenerate: \`npx vite-node scripts/generate-contested-sblgnt.mts\` (per
 * issue id, to keep memory bounded) then \`node
 * scripts/merge-contested-sblgnt.mjs\`. Validate: \`npm run contested:check\`
 * (SBLGNT-aware).
 */

const RAW: { issues: unknown[]; readings: unknown[] } = `;

const footer = `;

export const contestedRegistrySblgnt: ContestedRegistry = ContestedRegistrySchema.parse(RAW);
`;

const body = `{\n  issues: ${fmt(issues, 2)},\n  readings: ${fmt(readings, 2)},\n}`;
writeFileSync(resolve(root, 'src/data/contestedSyntaxSblgnt.ts'), header + body + footer);
console.log('wrote src/data/contestedSyntaxSblgnt.ts');

rmSync(partsDir, { recursive: true, force: true });
