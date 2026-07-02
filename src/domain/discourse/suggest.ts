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
 * Break-point candidates INSIDE multi-verse units: a verse boundary where the
 * new verse opens with a transition-grade marker (δέ, οὖν, διό, ἀλλά, γάρ) is
 * a place an exegete may want a break. Accepting one splits the unit there.
 */
function breakPointHints(doc: DiscourseDocument, leaves: DiscourseUnit[]): DiscourseSuggestion[] {
  const BREAK_LEMMAS = new Set(['δέ', 'οὖν', 'διό', 'ἀλλά', 'γάρ'].map(nfc));
  const tokens = new Map(doc.tokens.map((t) => [t.id, t]));
  const out: DiscourseSuggestion[] = [];
  for (const u of leaves) {
    if (u.refStart === u.refEnd) continue;
    let prevRef = '';
    for (let i = 0; i < u.tokenIds.length; i++) {
      const t = tokens.get(u.tokenIds[i]!);
      if (!t) continue;
      const verseStart = i > 0 && t.ref !== prevRef;
      prevRef = t.ref;
      if (!verseStart) continue;
      // The marker may sit second (postpositive δέ/γάρ/οὖν).
      const next = tokens.get(u.tokenIds[i + 1] ?? '');
      const markerAtStart =
        (t.lemma && BREAK_LEMMAS.has(nfc(t.lemma))) ||
        (next?.ref === t.ref && next.lemma && BREAK_LEMMAS.has(nfc(next.lemma)));
      if (!markerAtStart) continue;
      out.push({
        id: `ds_break_${t.id}`,
        type: 'possibleBreak',
        unitIds: [u.id],
        tokenIds: [t.id],
        label: t.ref,
        explanation: `Verse ${t.ref} opens with a transition-grade particle inside this unit — a possible break point. Accepting splits the unit at ${t.ref}.`,
        confidence: 'low',
        provenance: inferredLow('Verse boundary + unit-medial transition particle.'),
      });
    }
  }
  return out;
}

/** Units OPENING with the same 3-lemma sequence: a possible parallel frame. */
function repeatedPhraseHints(doc: DiscourseDocument, leaves: DiscourseUnit[]): DiscourseSuggestion[] {
  const tokens = new Map(doc.tokens.map((t) => [t.id, t]));
  const opening = (u: DiscourseUnit) =>
    u.tokenIds
      .slice(0, 3)
      .map((tid) => nfc(tokens.get(tid)?.lemma ?? ''))
      .filter(Boolean)
      .join(' ');
  const byPhrase = new Map<string, string[]>();
  for (const u of leaves) {
    const key = opening(u);
    if (key.split(' ').length < 3) continue;
    (byPhrase.get(key) ?? byPhrase.set(key, []).get(key)!).push(u.id);
  }
  return [...byPhrase.entries()]
    .filter(([, ids]) => ids.length >= 2)
    .slice(0, 5)
    .map(([phrase, unitIds]) => ({
      id: `ds_repphrase_${keySlug(phrase)}`,
      type: 'repeatedPhrase' as const,
      unitIds,
      label: phrase,
      explanation: `${unitIds.length} units open with the same words (${phrase}) — a possible parallel frame or refrain.`,
      confidence: 'low' as const,
      provenance: inferredLow(`Repeated opening phrase ${phrase}.`),
    }));
}

/** An imperative-bearing unit followed by a γάρ unit: possible command→ground. */
function commandGroundHints(doc: DiscourseDocument, leaves: DiscourseUnit[]): DiscourseSuggestion[] {
  const tokens = new Map(doc.tokens.map((t) => [t.id, t]));
  const out: DiscourseSuggestion[] = [];
  for (let i = 0; i < leaves.length - 1; i++) {
    const cmd = leaves[i]!;
    const next = leaves[i + 1]!;
    const hasImperative = cmd.tokenIds.some((tid) => tokens.get(tid)?.mood === 'imperative');
    if (!hasImperative) continue;
    const gar = doc.markers.find(
      (m) => m.scopeUnitId === next.id && nfc(m.lemma ?? '') === 'γάρ' && next.tokenIds.indexOf(m.tokenId) < 3,
    );
    if (!gar) continue;
    out.push({
      id: `ds_cmdground_${next.id}`,
      type: 'possibleGround',
      unitIds: [next.id, cmd.id],
      markerIds: [gar.id],
      label: 'command → γάρ',
      explanation:
        'A command here is followed by a γάρ unit — a candidate command/ground pattern (the γάρ unit may supply the reason for the command).',
      confidence: 'medium',
      provenance: inferredLow('Imperative followed by unit-initial γάρ.'),
    });
  }
  return out;
}

/**
 * All initial suggestions for a freshly generated document. Deterministic;
 * called once by the builder. Every suggestion is a hint the user may accept
 * (turning it into an editable manual relation or a split) or dismiss —
 * nothing is ever committed silently.
 */
export function buildInitialSuggestions(doc: DiscourseDocument): DiscourseSuggestion[] {
  const leaves = leafUnits(doc);
  const all = [
    // Specific patterns first: dedupe keeps the first proposal for a pair, so
    // command→γάρ must beat the generic unit-initial-γάρ hint.
    ...commandGroundHints(doc, leaves),
    ...markerRelationHints(doc, leaves),
    ...menDeHints(doc, leaves),
    ...oukAllaHints(doc, leaves),
    ...breakPointHints(doc, leaves),
    ...repeatedPhraseHints(doc, leaves),
    ...repeatedLemmaHints(doc, leaves),
    ...inclusioHint(doc, leaves),
  ];
  // Dedupe by type + unit pair (two heuristics may propose the same relation);
  // the first (more specific) heuristic wins — e.g. command→γάρ over plain γάρ.
  const seen = new Set<string>();
  return all.filter((s) => {
    const key = `${s.type}:${s.unitIds.join(',')}:${(s.tokenIds ?? []).join(',')}`;
    if (seen.has(key) || seen.has(s.id)) return false;
    seen.add(key);
    seen.add(s.id);
    return true;
  });
}
