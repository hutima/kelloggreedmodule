/**
 * convert-contested-to-sblgnt — ONE-OFF conversion helper (not part of the
 * runtime app). For every curated contested-syntax issue anchored to a
 * Nestle1904 GNT passage (`gnt_…`), find its SBLGNT counterpart sentence and
 * remap every affected token/node/relation id — and every alternate
 * reading's overlay ids — from the Nestle1904 tree to the SBLGNT tree.
 *
 * Output is printed as ready-to-splice TypeScript object literals (see
 * src/data/contestedSyntax.ts), NOT written automatically — every conversion
 * is reviewed by hand before it lands in the registry, and `npm run
 * contested:check` (SBLGNT-aware) is the final gate.
 *
 * Mapping strategy:
 *   - TOKEN: match by Strong's number within the same verse, nearest
 *     within-verse position breaking ties (mirrors `alignParallel`'s method
 *     for aligning two Greek editions instead of Greek→English).
 *   - NODE: a word node maps via its single token; a phrase/clause node maps
 *     via its REPRESENTATIVE token (`repTokenId` — the node's head verb, or
 *     its first token) — find the SBLGNT node of the SAME kind whose own
 *     representative token is the mapped token.
 *   - RELATION: every id referenced by a contested issue is the relation
 *     CURRENTLY governing some dependent (an `affectedRelationIds` entry, or
 *     an update target) — so mapping is "the SBLGNT relation whose dependent
 *     maps to the same dependent", i.e. `parentRelations(sblgntDoc, mappedDependentNodeId)[0]`.
 *
 *   npx vite-node scripts/convert-contested-to-sblgnt.mts
 *   npx vite-node scripts/convert-contested-to-sblgnt.mts -- iss_phil_1_1_syn
 */
import { readFileSync, existsSync } from 'node:fs';
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
const { getNode, parentRelations, childRelations } = await import('../src/domain/model/index.ts');
const { repTokenId } = await import('../src/domain/layout/modes/dependency.ts');

type KrDocument = Awaited<ReturnType<typeof lowfatToDocuments>>[number];

const GNT_SRC =
  'https://raw.githubusercontent.com/biblicalhumanities/greek-new-testament/master/syntax-trees/nestle1904-lowfat/xml/';
const SBLGNT_SRC = 'https://raw.githubusercontent.com/Clear-Bible/macula-greek/main/SBLGNT/lowfat/';

async function loadXml(localRel: string, remote: string): Promise<string> {
  const local = resolve(root, localRel);
  if (existsSync(local)) return readFileSync(local, 'utf8');
  const res = await fetch(remote);
  if (!res.ok) throw new Error(`fetch ${remote} → ${res.status}`);
  return await res.text();
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const nestleBookCache = new Map<string, KrDocument[]>();
const sblgntBookCache = new Map<string, KrDocument[]>();

async function nestleBook(bookName: string): Promise<KrDocument[]> {
  if (!nestleBookCache.has(bookName)) {
    const book = GNT_BOOKS.find((b) => b.name === bookName)!;
    const xml = await loadXml(`public/gnt/${book.file}`, GNT_SRC + book.file);
    nestleBookCache.set(bookName, lowfatToDocuments(xml, { book: book.name }));
  }
  return nestleBookCache.get(bookName)!;
}

async function sblgntBook(bookName: string): Promise<KrDocument[]> {
  if (!sblgntBookCache.has(bookName)) {
    const book = GNT_BOOKS.find((b) => b.name === bookName)!;
    const xml = await loadXml(`public/sblgnt/${book.file}`, SBLGNT_SRC + book.file);
    sblgntBookCache.set(
      bookName,
      lowfatToDocuments(xml, { book: book.name, dialect: sblgntDialect, docIdPrefix: 'sblgnt' }),
    );
  }
  return sblgntBookCache.get(bookName)!;
}

/** Verse-range overlap test, mirrors io/sources.ts. */
function verseRange(title: string): { chap: number; v0: number; v1: number } | null {
  const m = title.match(/(\d+):(\d+)(?:[–-](\d+))?\s*$/);
  if (!m) return null;
  return { chap: Number(m[1]), v0: Number(m[2]), v1: m[3] ? Number(m[3]) : Number(m[2]) };
}
function overlaps(a: ReturnType<typeof verseRange>, b: ReturnType<typeof verseRange>): boolean {
  if (!a || !b || a.chap !== b.chap) return false;
  return a.v1 >= b.v0 && a.v0 <= b.v1;
}

/** The SBLGNT sentence(s) overlapping a Nestle1904 sentence's verse range. */
async function sblgntCounterparts(bookName: string, nestleDoc: KrDocument): Promise<KrDocument[]> {
  const range = verseRange(nestleDoc.title);
  const sblgnt = await sblgntBook(bookName);
  return sblgnt.filter((d) => overlaps(verseRange(d.title), range));
}

/** "chapter.verse" + within-verse position from a token's alignment ref
 *  (Nestle1904 osisId "Phil.1.1!3" or SBLGNT ref "PHP 1:1!3"). */
function parseRef(ref: string | undefined): [string, number] | undefined {
  if (!ref) return undefined;
  const osis = /\.(\d+)\.(\d+)!(\d+)/.exec(ref);
  if (osis) return [`${osis[1]}.${osis[2]}`, Number(osis[3])];
  const sb = /(\d+):(\d+)!(\d+)\s*$/.exec(ref);
  return sb ? [`${sb[1]}.${sb[2]}`, Number(sb[3])] : undefined;
}

/** Nestle1904 token id → SBLGNT token id, matched by Strong's + nearest
 *  position within the same verse (falls back to lemma when Strong's is 0). */
function buildTokenMap(nestleDoc: KrDocument, sblgntDocs: KrDocument[]): Map<string, string> {
  const map = new Map<string, string>();
  const byVerse = new Map<string, { id: string; pos: number; strong: number; lemma?: string }[]>();
  for (const d of sblgntDocs) {
    for (const t of d.tokens) {
      const parsed = parseRef(t.morphology?.extra?.ref);
      if (!parsed) continue;
      const [key, pos] = parsed;
      const strong = Number(t.morphology?.extra?.strong ?? 0);
      const list = byVerse.get(key) ?? [];
      list.push({ id: t.id, pos, strong, lemma: t.lemma });
      byVerse.set(key, list);
    }
  }
  const used = new Set<string>();
  for (const t of nestleDoc.tokens) {
    const parsed = parseRef(t.morphology?.extra?.ref);
    if (!parsed) continue;
    const [key, pos] = parsed;
    const strong = Number(t.morphology?.extra?.strong ?? 0);
    const candidates = (byVerse.get(key) ?? []).filter((c) => !used.has(c.id));
    let best: (typeof candidates)[number] | undefined;
    let bestDist = Infinity;
    if (strong) {
      for (const c of candidates) {
        if (c.strong !== strong) continue;
        const d = Math.abs(c.pos - pos);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
    }
    if (!best && t.lemma) {
      for (const c of candidates) {
        if (c.lemma !== t.lemma) continue;
        const d = Math.abs(c.pos - pos);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
    }
    if (!best) {
      for (const c of candidates) {
        const d = Math.abs(c.pos - pos);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
    }
    if (best) {
      map.set(t.id, best.id);
      used.add(best.id);
    }
  }
  return map;
}

/** Map a Nestle1904 node id to its SBLGNT counterpart via representative token. */
function mapNode(
  nestleDoc: KrDocument,
  sblgntDoc: KrDocument,
  tokenMap: Map<string, string>,
  nestleNodeId: string,
): string | undefined {
  const node = getNode(nestleDoc.syntax, nestleNodeId);
  if (!node) return undefined;
  const repTok = repTokenId(nestleDoc, nestleNodeId);
  if (!repTok) return undefined;
  const sblgntTok = tokenMap.get(repTok);
  if (!sblgntTok) return undefined;
  if (node.kind === 'word') {
    return sblgntDoc.syntax.nodes.find((n) => n.kind === 'word' && n.tokenIds.includes(sblgntTok))?.id;
  }
  // clause/phrase: find the node of the SAME kind whose rep token matches.
  const candidates = sblgntDoc.syntax.nodes.filter((n) => n.kind === node.kind);
  for (const c of candidates) {
    if (repTokenId(sblgntDoc, c.id) === sblgntTok) return c.id;
  }
  return undefined;
}

/** Map a Nestle1904 relation id: find the mapped node it points INTO (the
 *  dependent), then take that node's CURRENT parent relation in SBLGNT. */
function mapRelation(
  nestleDoc: KrDocument,
  sblgntDoc: KrDocument,
  tokenMap: Map<string, string>,
  nestleRelId: string,
): string | undefined {
  const rel = nestleDoc.syntax.relations.find((r) => r.id === nestleRelId);
  if (!rel) return undefined;
  const mappedDep = mapNode(nestleDoc, sblgntDoc, tokenMap, rel.dependentId);
  if (!mappedDep) return undefined;
  return parentRelations(sblgntDoc.syntax, mappedDep)[0]?.id;
}

// ---- drive over the registry -------------------------------------------------

const only = process.argv.slice(2).filter((a) => a.startsWith('iss_'));
const targets = contestedRegistry.issues.filter(
  (i) => i.passageId.startsWith('gnt_') && (!only.length || only.includes(i.id)),
);

let prevBook: string | undefined;
for (const issue of targets) {
  // Full-book DOMs are memory-heavy (happy-dom); evict the previous book's
  // cache when moving to a new one so this one-off script doesn't OOM.
  const bookGuess = issue.passageId.match(/^gnt_(.+)_\d+$/)?.[1];
  if (bookGuess && bookGuess !== prevBook) {
    nestleBookCache.clear();
    sblgntBookCache.clear();
    prevBook = bookGuess;
  }
  if (issue.mergePassageIds?.length) {
    console.log(`\n// ── ${issue.id}: MERGE ISSUE (mergePassageIds) — convert by hand ──`);
    continue;
  }
  const m = issue.passageId.match(/^gnt_(.+)_(\d+)$/);
  if (!m) {
    console.log(`\n// ── ${issue.id}: unparseable passageId ${issue.passageId} — skip ──`);
    continue;
  }
  const [, bslug, idxS] = m;
  const bookName = GNT_BOOKS.find((b) => slug(b.name) === bslug)?.name;
  if (!bookName) {
    console.log(`\n// ── ${issue.id}: unknown book slug ${bslug} — skip ──`);
    continue;
  }
  const nestleDocs = await nestleBook(bookName);
  const nestleDoc = nestleDocs[Number(idxS)];
  if (!nestleDoc) {
    console.log(`\n// ── ${issue.id}: sentence index ${idxS} not found — skip ──`);
    continue;
  }
  const sblgntDocs = await sblgntCounterparts(bookName, nestleDoc);
  if (sblgntDocs.length === 0) {
    console.log(`\n// ── ${issue.id}: no SBLGNT sentence overlaps ${nestleDoc.title} — convert by hand ──`);
    continue;
  }
  // The Nestle1904 and SBLGNT trees don't always split sentences the same way
  // (SBLGNT sometimes splits a Nestle1904 sentence in two). Build the token map
  // across every overlapping SBLGNT sentence, then see which SINGLE one holds
  // all the ids this issue actually needs.
  const tokenMap = buildTokenMap(nestleDoc, sblgntDocs);
  const neededNestleTokens = new Set<string>(issue.affectedTokenIds);
  for (const rid of issue.affectedRelationIds ?? []) {
    const rel = nestleDoc.syntax.relations.find((r) => r.id === rid);
    if (rel) {
      const t = repTokenId(nestleDoc, rel.dependentId);
      if (t) neededNestleTokens.add(t);
    }
  }
  for (const nid of issue.affectedNodeIds ?? []) {
    const t = repTokenId(nestleDoc, nid);
    if (t) neededNestleTokens.add(t);
  }
  const neededSblgntTokens = [...neededNestleTokens].map((t) => tokenMap.get(t)).filter(Boolean) as string[];
  const holder = sblgntDocs.find((d) => {
    const ids = new Set(d.tokens.map((t) => t.id));
    return neededSblgntTokens.every((t) => ids.has(t));
  });
  if (!holder) {
    console.log(
      `\n// ── ${issue.id}: needed ids span multiple SBLGNT sentences (genuine cross-boundary case) — convert by hand ──`,
    );
    console.log(`//   nestle: ${nestleDoc.id} "${nestleDoc.title}"`);
    for (const d of sblgntDocs) console.log(`//   sblgnt: ${d.id} "${d.title}"`);
    continue;
  }
  const sblgntDoc = holder;

  const mapTok = (t: string) => {
    const v = tokenMap.get(t);
    if (!v) console.log(`//   ⚠ ${issue.id}: no SBLGNT match for token ${t}`);
    return v;
  };
  const mapNd = (n: string) => {
    const v = mapNode(nestleDoc, sblgntDoc, tokenMap, n);
    if (!v) console.log(`//   ⚠ ${issue.id}: no SBLGNT match for node ${n}`);
    return v;
  };
  const mapRel = (r: string) => {
    const v = mapRelation(nestleDoc, sblgntDoc, tokenMap, r);
    if (!v) console.log(`//   ⚠ ${issue.id}: no SBLGNT match for relation ${r}`);
    return v;
  };

  console.log(`\n// ── ${issue.id} → ${sblgntDoc.id} (${sblgntDoc.title}) ──`);
  // SANITY CHECK: the Nestle1904 issue's framing assumes a specific relation
  // TYPE (e.g. "genitive", "directObject"). If the SBLGNT converter produced a
  // DIFFERENT type for the mapped relation, the debate framing may not hold —
  // flag it loudly instead of silently shipping a mismatched description.
  for (const rid of issue.affectedRelationIds ?? []) {
    const nestleRel = nestleDoc.syntax.relations.find((r) => r.id === rid);
    const mapped = mapRelation(nestleDoc, sblgntDoc, tokenMap, rid);
    const sblgntRel = mapped ? sblgntDoc.syntax.relations.find((r) => r.id === mapped) : undefined;
    if (nestleRel && sblgntRel && nestleRel.type !== sblgntRel.type) {
      console.log(
        `//   ⚠⚠ TYPE MISMATCH: nestle ${rid} is '${nestleRel.type}' but SBLGNT ${mapped} is '${sblgntRel.type}' — verify the debate framing still holds!`,
      );
    }
  }
  console.log(`sourceId: 'macula-greek-sblgnt-lowfat',`);
  console.log(`passageId: '${sblgntDoc.id}',`);
  console.log(`affectedTokenIds: [${issue.affectedTokenIds.map((t) => `'${mapTok(t)}'`).join(', ')}],`);
  if (issue.affectedNodeIds?.length) {
    console.log(`affectedNodeIds: [${issue.affectedNodeIds.map((n) => `'${mapNd(n)}'`).join(', ')}],`);
  }
  if (issue.affectedRelationIds?.length) {
    console.log(
      `affectedRelationIds: [${issue.affectedRelationIds.map((r) => `'${mapRel(r)}'`).join(', ')}],`,
    );
  }

  const readings = contestedRegistry.readings.filter((r) => r.issueId === issue.id);
  for (const reading of readings) {
    console.log(`  // reading ${reading.id}:`);
    console.log(`  sourceId: 'macula-greek-sblgnt-lowfat',`);
    console.log(`  passageId: '${sblgntDoc.id}',`);
    if (reading.semanticOverlay) {
      const so = reading.semanticOverlay;
      console.log(`  semanticOverlay: {`);
      if (so.relationId) console.log(`    relationId: '${mapRel(so.relationId)}',`);
      if (so.nodeId) console.log(`    nodeId: '${mapNd(so.nodeId)}',`);
      if (so.tokenIds?.length)
        console.log(`    tokenIds: [${so.tokenIds.map((t) => `'${mapTok(t)}'`).join(', ')}],`);
      console.log(`  },`);
    }
    if (reading.textualVariant?.affectedBaseTokenIds?.length) {
      console.log(
        `  textualVariant.affectedBaseTokenIds: [${reading.textualVariant.affectedBaseTokenIds
          .map((t) => `'${mapTok(t)}'`)
          .join(', ')}],`,
      );
    }
    if (reading.syntaxPatch) {
      const sp = reading.syntaxPatch;
      const hasUpsertOrRemove =
        (sp.nodes?.upsert?.length ?? 0) > 0 ||
        (sp.nodes?.remove?.length ?? 0) > 0 ||
        (sp.relations?.upsert?.length ?? 0) > 0 ||
        (sp.relations?.remove?.length ?? 0) > 0;
      if (hasUpsertOrRemove) {
        console.log(`  // ⚠ syntaxPatch has upsert/remove ops — CONVERT BY HAND (structure may differ):`);
        console.log(`  ${JSON.stringify(sp)}`);
        continue;
      }
      console.log(`  syntaxPatch: {`);
      if (sp.relations?.update && Object.keys(sp.relations.update).length) {
        console.log(`    relations: { update: {`);
        for (const [rid, patch] of Object.entries(sp.relations.update)) {
          const mapped = mapRel(rid);
          const parts: string[] = [];
          if ('headId' in patch && patch.headId) parts.push(`headId: '${mapNd(patch.headId)}'`);
          if ('type' in patch && patch.type) parts.push(`type: '${patch.type}'`);
          if ('label' in patch && patch.label) parts.push(`label: '${patch.label}'`);
          console.log(`      '${mapped}': { ${parts.join(', ')} },`);
        }
        console.log(`    } },`);
      }
      if (sp.nodes?.update && Object.keys(sp.nodes.update).length) {
        console.log(`    nodes: { update: {`);
        for (const [nid, patch] of Object.entries(sp.nodes.update)) {
          console.log(`      '${mapNd(nid)}': ${JSON.stringify(patch)},`);
        }
        console.log(`    } },`);
      }
      console.log(`  },`);
    }
  }
}
