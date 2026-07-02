import type {
  DiscourseDocument,
  DiscourseMarker,
  DiscourseSuggestion,
  DiscourseToken,
  DiscourseUnit,
} from '@/domain/schema';

/**
 * SUGGESTION HEURISTICS — non-authoritative discourse hints.
 *
 * Ground rules (enforced here, restated in the UI):
 *   - a suggestion NEVER alters the discourse structure by itself;
 *   - the language is always "possible / candidate", never "detected";
 *   - confidence is low or medium — nothing the machine says here is high;
 *   - false positives must be harmless: ignoring a suggestion costs nothing.
 *
 * Everything is deterministic (ids derive from unit/lemma keys), so rebuilding
 * the base regenerates the same suggestions and `acceptedSuggestionIds` in a
 * stored patch stay meaningful.
 */

const CONTENT_POS = new Set(['noun', 'propernoun', 'verb', 'adjective']);

/** Lemmas too common to be interesting as repetition evidence. */
const STOP_LEMMAS = new Set(['εἰμί', 'λέγω', 'ἔχω', 'γίνομαι', 'ποιέω', 'θεός', 'κύριος'].map((s) => s.normalize('NFC')));

const nfc = (s: string) => s.normalize('NFC');
const keySlug = (s: string) => nfc(s).toLowerCase().replace(/[^a-zα-ωάέήίόύώϊϋΐΰᾳῃῳ0-9]+/gi, '');

/** Leaf (text-bearing) units in reading order. */
function leafUnits(doc: DiscourseDocument): DiscourseUnit[] {
  return doc.units.filter((u) => u.tokenIds.length > 0);
}

function inferredLow(reason: string) {
  return { source: 'inferred' as const, confidence: 'low' as const, reason };
}

/** Whether a marker sits among the first few tokens of its unit (unit-initial). */
function isUnitInitial(marker: DiscourseMarker, unit: DiscourseUnit): boolean {
  const idx = unit.tokenIds.indexOf(marker.tokenId);
  return idx >= 0 && idx < 3;
}

/**
 * Relation-shaped hints from unit-initial markers: a unit opening with γάρ MAY
 * ground the previous unit; οὖν/διό/ἄρα MAY draw an inference from it; ἀλλά
 * MAY contrast with it. Direction convention: `unitIds[0]` is the proposed
 * relation SOURCE (the marked unit), `unitIds[1]` the target (its predecessor).
 */
function markerRelationHints(doc: DiscourseDocument, leaves: DiscourseUnit[]): DiscourseSuggestion[] {
  const out: DiscourseSuggestion[] = [];
  const markersByUnit = new Map<string, DiscourseMarker[]>();
  for (const m of doc.markers) {
    if (!m.scopeUnitId) continue;
    (markersByUnit.get(m.scopeUnitId) ?? markersByUnit.set(m.scopeUnitId, []).get(m.scopeUnitId)!).push(m);
  }
  for (let i = 1; i < leaves.length; i++) {
    const unit = leaves[i]!;
    const prev = leaves[i - 1]!;
    for (const m of markersByUnit.get(unit.id) ?? []) {
      if (!isUnitInitial(m, unit) || !m.lemma) continue;
      const lemma = nfc(m.lemma);
      if (lemma === 'γάρ') {
        out.push({
          id: `ds_ground_${unit.id}`,
          type: 'possibleGround',
          unitIds: [unit.id, prev.id],
          markerIds: [m.id],
          label: 'γάρ',
          explanation: `This unit opens with γάρ — a possible ground/explanation for the previous unit. Particles are clues, not conclusions.`,
          confidence: m.provenance.confidence === 'medium' ? 'medium' : 'low',
          provenance: inferredLow('Unit-initial γάρ.'),
        });
      } else if (lemma === 'οὖν' || lemma === 'διό' || lemma === 'ἄρα') {
        out.push({
          id: `ds_infer_${unit.id}`,
          type: 'possibleInference',
          unitIds: [unit.id, prev.id],
          markerIds: [m.id],
          label: lemma,
          explanation: `This unit opens with ${lemma} — a possible inference/result drawn from the previous unit.`,
          confidence: 'medium',
          provenance: inferredLow(`Unit-initial ${lemma}.`),
        });
      } else if (lemma === 'ἀλλά' || lemma === 'πλήν') {
        out.push({
          id: `ds_contrast_${unit.id}`,
          type: 'possibleContrast',
          unitIds: [unit.id, prev.id],
          markerIds: [m.id],
          label: lemma,
          explanation: `This unit opens with ${lemma} — a possible contrast with the previous unit.`,
          confidence: 'medium',
          provenance: inferredLow(`Unit-initial ${lemma}.`),
        });
      }
    }
  }
  return out;
}

/** μέν … δέ within a short window of units: a possible balanced pair. */
function menDeHints(doc: DiscourseDocument, leaves: DiscourseUnit[]): DiscourseSuggestion[] {
  const out: DiscourseSuggestion[] = [];
  const hasLemma = (u: DiscourseUnit, lemma: string, tokens: Map<string, DiscourseToken>) =>
    u.tokenIds.some((tid) => nfc(tokens.get(tid)?.lemma ?? '') === lemma);
  const tokens = new Map(doc.tokens.map((t) => [t.id, t]));
  for (let i = 0; i < leaves.length; i++) {
    const a = leaves[i]!;
    if (!hasLemma(a, 'μέν', tokens)) continue;
    for (let j = i + 1; j <= Math.min(i + 2, leaves.length - 1); j++) {
      const b = leaves[j]!;
      if (!hasLemma(b, 'δέ', tokens)) continue;
      const aMarkers = doc.markers.filter((m) => m.scopeUnitId === a.id && nfc(m.lemma ?? '') === 'μέν');
      const bMarkers = doc.markers.filter((m) => m.scopeUnitId === b.id && nfc(m.lemma ?? '') === 'δέ');
      out.push({
        id: `ds_mende_${a.id}`,
        type: 'possibleParallel',
        unitIds: [a.id, b.id],
        markerIds: [...aMarkers, ...bMarkers].map((m) => m.id),
        label: 'μέν … δέ',
        explanation: 'A μέν here answers a δέ nearby — a possible paired contrast or balanced development.',
        confidence: 'low',
        provenance: inferredLow('μέν/δέ pair within adjacent units.'),
      });
      break;
    }
  }
  return out;
}

/** οὐ(κ/χ) … ἀλλά inside one unit: a possible negated-contrast pair. */
function oukAllaHints(doc: DiscourseDocument, leaves: DiscourseUnit[]): DiscourseSuggestion[] {
  const out: DiscourseSuggestion[] = [];
  const tokens = new Map(doc.tokens.map((t) => [t.id, t]));
  for (const u of leaves) {
    const lemmas = u.tokenIds.map((tid) => nfc(tokens.get(tid)?.lemma ?? ''));
    const negIdx = lemmas.findIndex((l) => l === 'οὐ' || l === 'μή');
    if (negIdx < 0) continue;
    const allaIdx = lemmas.indexOf('ἀλλά', negIdx + 1);
    if (allaIdx < 0) continue;
    out.push({
      id: `ds_oukalla_${u.id}`,
      type: 'possibleContrast',
      unitIds: [u.id],
      tokenIds: [u.tokenIds[negIdx]!, u.tokenIds[allaIdx]!],
      label: 'οὐ … ἀλλά',
      explanation: 'This unit carries a "not … but" (οὐ/μή … ἀλλά) shape — a possible negated contrast worth marking.',
      confidence: 'low',
      provenance: inferredLow('οὐ/μή followed by ἀλλά in one unit.'),
    });
  }
  return out;
}

/** Content lemmas recurring across several units — repetition evidence. */
function repeatedLemmaHints(doc: DiscourseDocument, leaves: DiscourseUnit[]): DiscourseSuggestion[] {
  const tokens = new Map(doc.tokens.map((t) => [t.id, t]));
  const unitsByLemma = new Map<string, string[]>();
  for (const u of leaves) {
    const seen = new Set<string>();
    for (const tid of u.tokenIds) {
      const t = tokens.get(tid);
      if (!t?.lemma || !t.pos || !CONTENT_POS.has(t.pos)) continue;
      const lemma = nfc(t.lemma);
      if (lemma.length < 4 || STOP_LEMMAS.has(lemma) || seen.has(lemma)) continue;
      seen.add(lemma);
      (unitsByLemma.get(lemma) ?? unitsByLemma.set(lemma, []).get(lemma)!).push(u.id);
    }
  }
  return [...unitsByLemma.entries()]
    .filter(([, unitIds]) => unitIds.length >= 3)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 8)
    .map(([lemma, unitIds]) => ({
      id: `ds_replemma_${keySlug(lemma)}`,
      type: 'repeatedLemma' as const,
      unitIds,
      label: lemma,
      explanation: `The lemma ${lemma} recurs in ${unitIds.length} units — repetition can signal a theme, a series, or an inclusio.`,
      confidence: 'low' as const,
      provenance: inferredLow(`Repeated content lemma ${lemma}.`),
    }));
}

/** Shared content lemmas in the first and last unit: a candidate inclusio. */
function inclusioHint(doc: DiscourseDocument, leaves: DiscourseUnit[]): DiscourseSuggestion[] {
  if (leaves.length < 4) return [];
  const tokens = new Map(doc.tokens.map((t) => [t.id, t]));
  const contentLemmas = (u: DiscourseUnit) =>
    new Set(
      u.tokenIds
        .map((tid) => tokens.get(tid))
        .filter((t) => t?.lemma && t.pos && CONTENT_POS.has(t.pos))
        .map((t) => nfc(t!.lemma!))
        .filter((l) => l.length >= 4 && !STOP_LEMMAS.has(l)),
    );
  const first = leaves[0]!;
  const last = leaves[leaves.length - 1]!;
  const shared = [...contentLemmas(first)].filter((l) => contentLemmas(last).has(l));
  if (shared.length < 2) return [];
  return [
    {
      id: 'ds_inclusio',
      type: 'possibleInclusio',
      unitIds: [first.id, last.id],
      label: shared.slice(0, 3).join(', '),
      explanation: `The opening and closing units share vocabulary (${shared.slice(0, 3).join(', ')}) — a candidate inclusio (bracketing repetition). Verify before marking.`,
      confidence: 'low',
      provenance: inferredLow('Shared content lemmas in first and last unit.'),
    },
  ];
}

/**
 * All initial suggestions for a freshly generated document. Deterministic;
 * called once by the builder. PR 5 extends this set (quotation frames,
 * imperative+γάρ command/ground patterns…).
 */
export function buildInitialSuggestions(doc: DiscourseDocument): DiscourseSuggestion[] {
  const leaves = leafUnits(doc);
  const all = [
    ...markerRelationHints(doc, leaves),
    ...menDeHints(doc, leaves),
    ...oukAllaHints(doc, leaves),
    ...repeatedLemmaHints(doc, leaves),
    ...inclusioHint(doc, leaves),
  ];
  // Dedupe by id (two heuristics may key the same unit).
  const seen = new Set<string>();
  return all.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
}
