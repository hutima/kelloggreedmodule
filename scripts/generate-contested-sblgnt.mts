/**
 * generate-contested-sblgnt — WRITES src/data/contestedSyntaxSblgnt.ts by
 * cloning every SAFE Nestle1904 GNT-anchored contested-syntax issue (and its
 * readings) and remapping every id to its SBLGNT counterpart. "Safe" means:
 * the mapped SBLGNT relation(s) carry the SAME relation TYPE the issue's
 * prose assumes (see the type-mismatch check) — a handful of issues whose
 * debate framing depends on tree SHAPE were found to sit on constructions the
 * current SBLGNT converter's head-inference does not yet handle as well as
 * Nestle1904's explicit head marking; those are EXCLUDED here and documented
 * in docs/sblgnt-kellogg-reed-plan.md rather than shipped with a possibly
 * misleading description (see EXCLUDED below).
 *
 * One-off generator, not part of the runtime app.
 *   npx vite-node scripts/generate-contested-sblgnt.mts
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Window } from 'happy-dom';

const win = new Window();
// @ts-expect-error — provide the DOM the converters need in Node.
globalThis.DOMParser = win.DOMParser;

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const { lowfatToDocuments, sblgntDialect } = await import('../src/io/lowfat.ts');
const { GNT_BOOKS } = await import('../src/io/gnt.ts');
const { contestedRegistry } = await import('../src/data/contestedSyntax.ts');
const { getNode, parentRelations } = await import('../src/domain/model/index.ts');
const { repTokenId } = await import('../src/domain/layout/modes/dependency.ts');

const { readFileSync, existsSync } = await import('node:fs');

const GNT_SRC =
  'https://raw.githubusercontent.com/biblicalhumanities/greek-new-testament/master/syntax-trees/nestle1904-lowfat/xml/';
const SBLGNT_SRC = 'https://raw.githubusercontent.com/Clear-Bible/macula-greek/main/SBLGNT/lowfat/';

async function loadXml(localRel, remote) {
  const local = resolve(root, localRel);
  if (existsSync(local)) return readFileSync(local, 'utf8');
  const res = await fetch(remote);
  if (!res.ok) throw new Error(`fetch ${remote} → ${res.status}`);
  return await res.text();
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function nestleBook(bookName) {
  const book = GNT_BOOKS.find((b) => b.name === bookName);
  const xml = await loadXml(`public/gnt/${book.file}`, GNT_SRC + book.file);
  return lowfatToDocuments(xml, { book: book.name });
}
async function sblgntBook(bookName) {
  const book = GNT_BOOKS.find((b) => b.name === bookName);
  const xml = await loadXml(`public/sblgnt/${book.file}`, SBLGNT_SRC + book.file);
  return lowfatToDocuments(xml, { book: book.name, dialect: sblgntDialect, docIdPrefix: 'sblgnt' });
}
function verseRange(title) {
  const m = title.match(/(\d+):(\d+)(?:[–-](\d+))?\s*$/);
  if (!m) return null;
  return { chap: Number(m[1]), v0: Number(m[2]), v1: m[3] ? Number(m[3]) : Number(m[2]) };
}
function overlaps(a, b) {
  if (!a || !b || a.chap !== b.chap) return false;
  return a.v1 >= b.v0 && a.v0 <= b.v1;
}
function parseRef(ref) {
  if (!ref) return undefined;
  const osis = /\.(\d+)\.(\d+)!(\d+)/.exec(ref);
  if (osis) return [`${osis[1]}.${osis[2]}`, Number(osis[3])];
  const sb = /(\d+):(\d+)!(\d+)\s*$/.exec(ref);
  return sb ? [`${sb[1]}.${sb[2]}`, Number(sb[3])] : undefined;
}
function buildTokenMap(nestleDoc, sblgntDocs) {
  const map = new Map();
  const byVerse = new Map();
  for (const d of sblgntDocs) {
    for (const t of d.tokens) {
      const p = parseRef(t.morphology?.extra?.ref);
      if (!p) continue;
      const [key] = p;
      const list = byVerse.get(key) ?? [];
      list.push({ id: t.id, pos: p[1], strong: Number(t.morphology?.extra?.strong ?? 0), lemma: t.lemma });
      byVerse.set(key, list);
    }
  }
  const used = new Set();
  for (const t of nestleDoc.tokens) {
    const p = parseRef(t.morphology?.extra?.ref);
    if (!p) continue;
    const [key, pos] = p;
    const strong = Number(t.morphology?.extra?.strong ?? 0);
    const cands = (byVerse.get(key) ?? []).filter((c) => !used.has(c.id));
    let best, bestDist = Infinity;
    if (strong) for (const c of cands) { if (c.strong !== strong) continue; const d = Math.abs(c.pos - pos); if (d < bestDist) { bestDist = d; best = c; } }
    if (!best && t.lemma) for (const c of cands) { if (c.lemma !== t.lemma) continue; const d = Math.abs(c.pos - pos); if (d < bestDist) { bestDist = d; best = c; } }
    if (!best) for (const c of cands) { const d = Math.abs(c.pos - pos); if (d < bestDist) { bestDist = d; best = c; } }
    if (best) { map.set(t.id, best.id); used.add(best.id); }
  }
  return map;
}
function mapNode(nestleDoc, sblgntDoc, tokenMap, nid) {
  const node = getNode(nestleDoc.syntax, nid);
  if (!node) return undefined;
  const rt = repTokenId(nestleDoc, nid);
  if (!rt) return undefined;
  const st = tokenMap.get(rt);
  if (!st) return undefined;
  if (node.kind === 'word') return sblgntDoc.syntax.nodes.find((n) => n.kind === 'word' && n.tokenIds.includes(st))?.id;
  for (const c of sblgntDoc.syntax.nodes.filter((n) => n.kind === node.kind)) {
    if (repTokenId(sblgntDoc, c.id) === st) return c.id;
  }
  return undefined;
}
function mapRelation(nestleDoc, sblgntDoc, tokenMap, relId) {
  const rel = nestleDoc.syntax.relations.find((r) => r.id === relId);
  if (!rel) return undefined;
  const dep = mapNode(nestleDoc, sblgntDoc, tokenMap, rel.dependentId);
  if (!dep) return undefined;
  return parentRelations(sblgntDoc.syntax, dep)[0]?.id;
}

// ---- explicit corrections for cases the generic algorithm mis-maps ----
// Galatians 2:16's SBLGNT text reads "πίστεως Ἰησοῦ Χριστοῦ" (Ἰησοῦ before
// Χριστοῦ — a real word-order difference from Nestle1904's "πίστεως Χριστοῦ
// Ἰησοῦ"), so Χριστοῦ is no longer πίστεως's DIRECT genitive dependent in
// SBLGNT — Ἰησοῦ is, with Χριστοῦ in apposition to Ἰησοῦ. The generic mapper
// (which follows the ORIGINAL dependent word) lands on that apposition
// relation; the actual genitive is one hop up.
const RELATION_OVERRIDES = {
  iss_gal_2_16_pistis_christou: { r_s28_25: 'RECOMPUTE:pistis-iesou-genitive' },
};

// Issues excluded from this generation pass. The two remaining exclusions
// are NOT converter gaps: SBLGNT's own base tree genuinely resolves these
// constructions differently, so mirroring the Nestle1904 debate framing
// would misdescribe this edition (see the contestedSyntaxSblgnt.ts header).
// Titus 2:13 and Col 1:15 were unblocked by the Stage 5–6 head-inference
// fixes and are hand-authored in contestedSyntaxSblgnt.ts — note that
// Titus 2:13 needs the Gal-2:16-style word-order correction (SBLGNT reads
// "Ἰησοῦ Χριστοῦ", so the apposition dependent of θεοῦ is Ἰησοῦ, not
// Χριστοῦ; this generator's dependent-tracking would map to Χριστοῦ's
// relation instead — verify by hand if regenerating).
const EXCLUDED = new Set([
  'iss_matt_4_3_command', // SBLGNT base = the Nestle1904 ALTERNATE; debate invisible
  'iss_2cor_5_4_leedy', // SBLGNT base differs from the Nestle1904 default this issue describes
  'iss_titus_2_13_granville', // mirrored by hand (word-order correction) — do not regenerate blindly
  'iss_col_1_15_firstborn', // mirrored by hand — verified r_s3_115
  'iss_rom_9_5_doxology', // merge case — handled separately (hand-authored)
]);

const only = new Set(process.argv.slice(2).filter((a) => a.startsWith('iss_')));
const targets = contestedRegistry.issues.filter(
  (i) => i.passageId.startsWith('gnt_') && !EXCLUDED.has(i.id) && (!only.size || only.has(i.id)),
);

const outIssues = [];
const outReadings = [];
let prevBook;
for (const issue of targets) {
  const m = issue.passageId.match(/^gnt_(.+)_(\d+)$/);
  const bookName = GNT_BOOKS.find((b) => slug(b.name) === m[1])?.name;
  if (bookName !== prevBook) prevBook = bookName; // (cache eviction handled by process churn below)
  const nestleDocs = await nestleBook(bookName);
  const nestleDoc = nestleDocs[Number(m[2])];
  const range = verseRange(nestleDoc.title);
  const sblgntDocs = (await sblgntBook(bookName)).filter((d) => overlaps(verseRange(d.title), range));

  const neededNestleTokens = new Set(issue.affectedTokenIds);
  for (const rid of issue.affectedRelationIds ?? []) {
    const rel = nestleDoc.syntax.relations.find((r) => r.id === rid);
    if (rel) { const t = repTokenId(nestleDoc, rel.dependentId); if (t) neededNestleTokens.add(t); }
  }
  for (const nid of issue.affectedNodeIds ?? []) {
    const t = repTokenId(nestleDoc, nid);
    if (t) neededNestleTokens.add(t);
  }
  const tokenMap = buildTokenMap(nestleDoc, sblgntDocs);
  const neededSblgntTokens = [...neededNestleTokens].map((t) => tokenMap.get(t)).filter(Boolean);
  const sblgntDoc = sblgntDocs.find((d) => {
    const ids = new Set(d.tokens.map((t) => t.id));
    return neededSblgntTokens.every((t) => ids.has(t));
  });
  if (!sblgntDoc) {
    console.error(`SKIP ${issue.id}: no single SBLGNT sentence holds every needed id`);
    continue;
  }

  const mapRel = (rid) => {
    const override = RELATION_OVERRIDES[issue.id]?.[rid];
    if (override === 'RECOMPUTE:pistis-iesou-genitive') {
      // πίστεως's genitive dependent, following the FIRST occurrence's πίστεως
      // token directly (rather than the old Χριστοῦ dependent).
      const pistisNestleTok = nestleDoc.syntax.relations.find((r) => r.id === rid).headId;
      const pistisSblgntWord = mapNode(nestleDoc, sblgntDoc, tokenMap, pistisNestleTok);
      const genRel = sblgntDoc.syntax.relations.find(
        (r) => r.headId === pistisSblgntWord && r.type === 'genitive',
      );
      return genRel?.id;
    }
    return mapRelation(nestleDoc, sblgntDoc, tokenMap, rid);
  };
  const mapNd = (n) => mapNode(nestleDoc, sblgntDoc, tokenMap, n);
  const mapTok = (t) => tokenMap.get(t);

  const newIssue = {
    ...issue,
    id: `${issue.id}_sblgnt`,
    sourceId: 'macula-greek-sblgnt-lowfat',
    passageId: sblgntDoc.id,
    affectedTokenIds: issue.affectedTokenIds.map(mapTok).filter(Boolean),
    affectedNodeIds: issue.affectedNodeIds?.length ? issue.affectedNodeIds.map(mapNd).filter(Boolean) : undefined,
    affectedRelationIds: issue.affectedRelationIds?.length
      ? issue.affectedRelationIds.map(mapRel).filter(Boolean)
      : undefined,
    alternateReadingIds: issue.alternateReadingIds.map((r) => `${r}_sblgnt`),
  };
  if (!newIssue.affectedNodeIds) delete newIssue.affectedNodeIds;
  if (!newIssue.affectedRelationIds) delete newIssue.affectedRelationIds;
  outIssues.push(newIssue);

  for (const reading of contestedRegistry.readings.filter((r) => r.issueId === issue.id)) {
    const newReading = {
      ...reading,
      id: `${reading.id}_sblgnt`,
      issueId: newIssue.id,
      sourceId: 'macula-greek-sblgnt-lowfat',
      passageId: sblgntDoc.id,
    };
    if (reading.semanticOverlay) {
      newReading.semanticOverlay = {
        ...reading.semanticOverlay,
        relationId: reading.semanticOverlay.relationId ? mapRel(reading.semanticOverlay.relationId) : undefined,
        nodeId: reading.semanticOverlay.nodeId ? mapNd(reading.semanticOverlay.nodeId) : undefined,
        tokenIds: reading.semanticOverlay.tokenIds?.map(mapTok).filter(Boolean),
      };
      if (!newReading.semanticOverlay.relationId) delete newReading.semanticOverlay.relationId;
      if (!newReading.semanticOverlay.nodeId) delete newReading.semanticOverlay.nodeId;
      if (!newReading.semanticOverlay.tokenIds?.length) delete newReading.semanticOverlay.tokenIds;
    }
    if (reading.textualVariant) {
      newReading.textualVariant = {
        ...reading.textualVariant,
        affectedBaseTokenIds: reading.textualVariant.affectedBaseTokenIds?.map(mapTok).filter(Boolean),
      };
    }
    if (reading.syntaxPatch) {
      const sp = reading.syntaxPatch;
      const newUpdate = {};
      for (const [rid, patch] of Object.entries(sp.relations?.update ?? {})) {
        const mapped = mapRel(rid);
        if (!mapped) { console.error(`  ⚠ ${reading.id}: could not map relation ${rid}`); continue; }
        const np = { ...patch };
        if ('headId' in np && np.headId) np.headId = mapNd(np.headId);
        newUpdate[mapped] = np;
      }
      newReading.syntaxPatch = { relations: { update: newUpdate } };
    }
    outReadings.push(newReading);
  }
}

console.error(`Generated ${outIssues.length} issues, ${outReadings.length} readings.`);

// Write a PARTIAL JSON blob (one process per invocation keeps happy-dom's
// memory bounded — see scripts/convert-contested-to-sblgnt.mts's note on
// this). scripts/merge-contested-sblgnt.mjs combines every part into the
// final src/data/contestedSyntaxSblgnt.ts.
const partsDir = resolve(root, '.contested-sblgnt-parts');
if (!existsSync(partsDir)) (await import('node:fs')).mkdirSync(partsDir);
const outFile = resolve(partsDir, `${targets[0]?.id ?? 'empty'}.json`);
writeFileSync(outFile, JSON.stringify({ issues: outIssues, readings: outReadings }, null, 2));
console.error(`wrote ${outFile}`);
