# SBLGNT Rebase and Kellogg-Reed Greek Syntax Plan

## Goal

Improve Greek syntax display in ScriptureDiagrammer by fixing misleading
Kellogg-Reed role mapping and rebasing the Greek NT workflow around SBLGNT
Lowfat / MACULA Greek.

Two connected goals, in priority order:

1. **Fix the product bug**: the Lowfat converter and Kellogg-Reed display
   over-flatten Greek syntax into English-school grammar roles — most visibly
   by labeling things as ordinary "direct objects" when Greek grammar calls
   for a more nuanced (or more honest, less certain) analysis.
2. **Rebase Greek data going forward**: SBLGNT-based MACULA Greek becomes the
   primary Greek NT edition; Nestle1904 stays available as legacy/alternate.

The rebase is infrastructure. The Mark 5 Kellogg-Reed bug is the core
regression test — SBLGNT does not automatically fix it.

## Core regression

Mark 5:26 currently exposes bad or misleading role logic around:

- **δαπανήσασα τὰ παρ᾽ αὐτῆς πάντα** — `τὰ παρ᾽ αὐτῆς` should be treated as a
  substantival articular prepositional phrase ("the things belonging to
  her"); `πάντα` should modify that nominal phrase (totality of her
  possessions), not be displayed alone as the ordinary direct object. The
  whole phrase `τὰ παρ᾽ αὐτῆς πάντα` may function as the thing spent.
- **μηδὲν ὠφεληθεῖσα** — `ὠφεληθεῖσα` is a *passive* participle, so `μηδέν`
  must not default to an ordinary direct-object label. Better: adverbial
  accusative of extent, accusative of reference/respect, retained accusative
  (only if explicitly supported by the source), or a neutral "accusative
  modifier" / "object-like accusative". The display should communicate the
  uncertainty rather than invent confidence.
- **τὰ περὶ τοῦ Ἰησοῦ** — currently handled closer to the *preferred*
  analysis of `τὰ παρ᾽ αὐτῆς`. That inconsistency is the tell: the presence
  of `πάντα` in `τὰ παρ᾽ αὐτῆς πάντα` must not force an artificial structural
  difference. The app needs first-class logic for articular prepositional
  phrases and their modifiers.

Guiding rule: **prefer less misleading labels over falsely precise labels.**

## Current source landscape (audited 2026-07-02)

| Layer | Today | Target |
| --- | --- | --- |
| Greek NT text+syntax | Nestle1904 Lowfat (`src/io/gnt.ts` + `src/io/lowfat.ts`), hard-wired | SBLGNT Lowfat / MACULA Greek primary; Nestle1904 legacy/alternate |
| Alternate Greek syntax | OpenText.org (`src/io/opentext*.ts`) | unchanged — secondary/alternate |
| Hebrew | WLC Lowfat, macula-hebrew (`src/io/macula-hebrew.ts`, `src/io/ot.ts`) | unchanged |
| English parallel | BSB, Clear-Bible alignment whose Greek base is *already SBLGNT*; matched to Nestle1904 by Strong's, never by position (`src/io/parallel.ts`) | simpler/more direct alignment once SBLGNT is primary; fallbacks retained |
| Source ids | `SyntaxSourceId = 'nestle1904' \| 'opentext'` (`src/io/sources.ts`) | explicit edition-aware ids (e.g. `macula-greek-sblgnt-lowfat`) |
| Patch bases | guarded by `baseHash` (`src/domain/schema/patch.ts`) | additionally guarded by source/edition id |

## Non-goals

- Do not remove Nestle1904.
- Do not rewrite Hebrew.
- Do not make OpenText the primary Greek source.
- Do not duplicate the Constituency Tree mode.
- Do not silently mutate saved documents or patches.
- Do not claim source fidelity when the display is reconstructed.
- Do not pretend the app has resolved every Greek grammar ambiguity — when the
  converter is uncertain, the UI shows uncertainty.

## Phases

1. Documentation and implementation plan.
2. Mark 5 regression/spec fixtures (Mark 5:25–34, esp. 5:26).
3. Greek role/provenance model improvements.
4. Kellogg-Reed display label improvements.
5. Lowfat converter fixes for Mark 5.
6. Edition-aware source model.
7. SBLGNT loader.
8. SBLGNT default switch.
9. BSB alignment cleanup.
10. Source constituency preservation.
11. Constituency Tree source/reconstructed toggle.
12. Migration guards and regression tests.
13. Final cleanup.

## Status

| Phase | Status | Notes |
|---|---|---|
| 1. Documentation | Done | This document + README data-source section. No behavior change. |
| 2. Mark 5 regression/spec | Done | `tests/mark5-regression.test.ts` + bundled fixtures `tests/fixtures-lowfat-mark-5-25-34.xml`, `tests/fixtures-lowfat-col-1-9-16.xml` (per Tim, no network re-pulls). 5 desired-behavior specs are explicitly marked `it.fails` (they hard-fail once fixed, forcing marker removal); 6 sanity specs pass. |
| 3. Role/provenance model | Done | 6 new `SyntacticRole` values, 3 new `ProvenanceSource` values, `sourceRole`/`editionId` provenance fields; every label map / glossary / guide / layout set updated. Additive only — see Decisions. |
| 4. KR display labels | Done | Detail cards gain an italic "Analysis:" provenance/uncertainty line (`analysisNote` in `describe.ts`, rendered in `DiagramCanvas`) — shown only when there is something worth disclosing (conversion, inference, reconstruction, preserved raw source role, non-high confidence). Role labels/phrases landed in phase 3. Geometry decision: object-like/retained accusatives sit in the object slot, adverbial accusatives hang beneath the verb; per Tim the diagram stays neutral and detail cards carry the nuance. |
| 5. Converter fixes | Done | `src/io/lowfat.ts`: (1) accusative `o` under an explicitly PASSIVE verb → `accusativeModifier`, provenance `converted`/`medium` with `sourceRole: 'o'` (middle-passive left alone — the middle reading takes a real object); (2) articular PPs (det + PP content, no substantive head word) rooted on the ARTICLE (`role: substantivalPrepositionalPhrase`), PP + πάντα-style modifiers beneath it with `converted` provenance preserving the source's `head` marking. Both Mark 5 shapes now identical. All 5 `it.fails` specs flipped to ordinary regressions + 4 new detail specs; 630 tests pass. Hebrew unaffected (no `voice`/`case` attributes; detection requires `class="np"` + `det`). |
| 6. Source model | Done | `SyntaxSourceId` is now explicit + edition-aware (`macula-greek-sblgnt-lowfat` · `macula-greek-nestle1904-lowfat` · `opentext` · `macula-hebrew-wlc-lowfat`); new `ALL_SYNTAX_SOURCES` registry carries corpus/edition/availability (SBLGNT registered, `available: false` until phase 7). Patch bases now stamp `sourceId` via `sourceIdForCorpus`. Safe rename: the old short ids were never persisted anywhere. |
| 7. SBLGNT loader | Done | `src/io/gnt-sblgnt.ts` (Clear-Bible/macula-greek `SBLGNT/lowfat`, CC BY 4.0) + `sblgntDialect` in `lowfat.ts`: ids on `xml:id`/`ref`, "MRK 5:25" milestones, and — the big one — head INFERENCE by class/role because SBLGNT Lowfat carries no `head="true"` at all. Docs get `sblgnt_` id prefix. Selectable in GntPicker + source compare; SW caches it; Nestle1904 loader untouched. Mark 5:26 regression verified under SBLGNT via bundled fixture (`tests/fixtures-sblgnt-lowfat-mark-5-25-34.xml`). Textual note: SBLGNT reads ἀκούσασα περὶ τοῦ Ἰησοῦ (no τά) — one substantival PP in that sentence, not two. |
| 8. Default switch | Done | `DEFAULT_GNT_SOURCE = macula-greek-sblgnt-lowfat` (per Tim: after loader + Mark 5 tests pass, which they do). GntPicker defaults new/non-GNT sessions to SBLGNT and lists it first (Nestle labelled "legacy"); SearchPicker defaults to SBLGNT; SBLGNT Philippians bundled under `public/sblgnt/` so the default edition works offline first-run; contested-reading base label now names the actual edition via `sourceLabel`. Open passages keep their own edition (pickerSource follows the doc id), and patches are keyed by edition-prefixed passage ids + `sourceId`, so nothing crosses editions. |
| 9. Alignment cleanup | Done | `src/io/parallel.ts`: found + fixed a phase-8 gap — `parseRef` only read Nestle osisIds, so SBLGNT docs got NO English alignment; it now reads both spellings. SBLGNT docs align DIRECTLY by position (the alignment's own base text, Strong's-verified), Nestle1904 keeps Strong's-nearest + positional fallback. Every token records its `AlignMethod` (`direct`/`strongs`/`position`/`unmatched`) plus aggregate `stats` for debugging. Hebrew aligner reports `direct` by construction — unchanged behavior. Mark 5:26 alignment covered by tests. |
| 10. Source constituency | Done | New optional `sourceConstituency` layer on `KrDocument` (`schema/constituency.ts` — cat/role/rule/head/articular/tokenIds, whole tree source-given by construction, identified by `sourceId`). Captured verbatim by `captureSourceConstituency` in `lowfat.ts` when the loader passes a `sourceId` (both GNT loaders do); survives `combinePassage` (prefixed under a discourse root, dropped — never corrupted — when members lack it or mix sources). Syntax graph untouched; schemaVersion unchanged; Hebrew deferred per Tim's regression-only default (same helper works when wanted). |
| 11. Constituency UI | Done | The EXISTING Constituency Tree mode (no duplicate) renders the preserved source `<wg>` hierarchy when present: Auto/Source/App toggle in the canvas toolbar (persisted, default Auto), an honesty caption on the diagram ("Source constituency: SBLGNT Lowfat" vs "Reconstructed from the app syntax graph"), raw source roles (s/v/o/io/p/adv, `head`) shown VERBATIM on branch chips (colour borrowed from the closest app family, text never translated), source child order authoritative, leaves hover-linked to app syntax nodes. Reconstructed path byte-for-byte unchanged; Dependency/Phrase-Block/KR and Hebrew RTL untouched. |
| 12. Migration guards/tests | Done | `applyStoredPatch` now refuses (skip + warn, never delete) a patch whose `base.sourceId` names a different edition than the base document's actual source; legacy patches without a `sourceId` keep loading, guarded by `baseHash` as before. Covered by 3 new guard tests (stamping, crossing, legacy). Hebrew smoke (Gen 1:1 fixture, ot tests) and OpenText smoke (opentext tests) already pass unchanged in the suite; Mark 5 covered under both editions; Col 1:9–16 stress bundled (Nestle). |
| 13. Cleanup | Done | README rewritten to the shipped state (SBLGNT default, edition scoping, alignment methods, source constituency); acceptance checklist below. |

## Test passages

Greek: Mark 5:25–34 (main regression), Colossians 1:9–20 (long-sentence
stress), Romans 9:5 (punctuation-sensitive), 1 Timothy 2:11–12 (coordinated
infinitives), John 1:1–4 (baseline).

Hebrew (must not regress): Genesis 1:1–3, Psalm 1:1–2, Deuteronomy 6:4.

## Implementation principles

1. Small PR-sized increments; app buildable after each phase where possible.
2. Document first; update this plan after each phase.
3. No silent source changes — sources always visibly labeled.
4. Do not remove Nestle1904; do not break Hebrew or OpenText.
5. Improve — do not duplicate — the Constituency Tree mode.
6. Never silently apply Nestle1904 patches to SBLGNT documents when token
   ids / source ids differ.
7. Preserve source information (e.g. Lowfat `<wg>` constituency) instead of
   reconstructing it unnecessarily.
8. Mark 5:26 is the regression/spec test for the whole project.
9. Prefer neutral labels over misleading confident ones; show uncertainty.

## Live review notes

- 2026-07-02 (Tim, during PR 1): answered the four behavior-shaping questions —
  see "Decisions made". Notably: Mark 5:25–34 should **not** become the primary
  built-in demo passage, but its source data (plus Colossians 1:9–16) should be
  **bundled into the repo as test fixtures** so tests don't re-fetch from the
  network.

## Bugs discovered

*Add bugs here immediately, with whether they block the current phase.*

- 2026-07-02 (Tim reported from the live app — SBLGNT Mark 1:19–20 in
  Phrase/Block showed a whole clause mislabelled `adjunct`; fixed): **the
  SBLGNT Lowfat converter mangled classless phrase coordinations.** SBLGNT
  writes a PHRASE-level coordination as a CLASSLESS `<wg>` carrying only a
  `rule` (e.g. `<wg role="o" rule="NpaNp">` for the object "Ἰάκωβον … καὶ
  Ἰωάννην … καὶ αὐτοὺς … καταρτίζοντας τὰ δίκτυα"), whereas Nestle1904 puts a
  `class` on such groups. The converter's classless→`convertClause` default
  (`src/io/lowfat.ts`) therefore sent the object coordination to
  `convertClause`, whose no-verb branch mistook the noun-phrase member
  "Ἰάκωβον…καὶ Ἰωάννην…" for a bare subordinator word and `wordNode()`'d the
  ENTIRE `<wg>` into ONE garbled token (surface = the whole group's text),
  which `rescueOrphans` then hung off the root as `adjunct`. This is the same
  CLASS of head-inference gap noted in Phase 14 (it's why Titus 2:13 / Col
  1:15 / etc. were held back), now partly closed. Fix, minimally scoped so
  Nestle1904 is untouched: (1) `convert()` routes a classless `<wg>` with a
  phrase coordination rule (`isCoordinationRule` && not clause/vp) to
  `convertPhrase`; (2) `convertClause`'s no-verb branch delegates a classless,
  clause-content-free `<wg>` (a "καί + <NP>" coordination-member wrapper) to
  `convertPhrase` instead of fabricating an adjunct-only clause. Now εἶδεν
  takes Ἰάκωβον as its direct object, with Ἰωάννην and the participial clause
  as conjuncts and the son-of-Zebedee / brother appositives preserved.
  Regenerated the affected SBLGNT contested-syntax ids (Phil 1:1, Rom 3:22
  relation ids shifted) and re-validated. Regression test
  `tests/sblgnt-coordination-regression.test.ts` + bundled fixture
  `tests/fixtures-sblgnt-lowfat-mark-1-19-20.xml` (fails without the fix).
  Before/after renders sent to Tim. 671 tests pass; typecheck/lint/build +
  `contested:check` clean. NOTE: this narrows but does not fully close the
  Phase 14 `sblgntHead()` gap — Titus 2:13 / Matt 4:3 / 2 Cor 5:4 / Col 1:15
  remain Nestle1904-only pending a broader head-inference pass (their trees
  are mis-*headed*, a different failure from this coordination-*routing* bug).

- 2026-07-02 (Tim reported, out-of-band from the SBLGNT rebase phases — a
  pre-existing Kellogg-Reed layout bug, not caused by any phase above; fixed
  immediately, does not block any phase): **Mark 1:19–20 renders with a whole
  coordinate object missing.** "εἶδεν Ἰάκωβον … καὶ Ἰωάνην … καὶ αὐτοὺς …
  καταρτίζοντας τὰ δίκτυα" ("he saw James, and John, and them mending the
  nets") coordinates the direct object of εἶδεν across a WORD (Ἰάκωβον), a
  second WORD (Ἰωάνην), and a whole participial CLAUSE ("them … mending the
  nets") — three conjuncts, mixed kinds. `layoutCoordination` in
  `src/domain/layout/engine.ts` built its fork's member list from
  `wordConjunctRels`, which deliberately excludes clause dependents (that
  exclusion is correct and needed elsewhere, e.g. compound-predicate
  detection) — but inside the fork builder itself it meant the clause
  conjunct was never passed to `layoutNode` at all, so the ENTIRE third
  member (7 words: αὐτοὺς καταρτίζοντας ἐν τῷ πλοίῳ τὰ δίκτυα) silently
  vanished from the diagram — the fork only ever showed 2 of 3 arms. Fixed by
  merging clause conjuncts into `layoutCoordination`'s LOCAL member list (in
  surface order via `subtreeMinIndex`), leaving the module-level
  `wordConjunctRels` helper itself untouched so its other ~7 call sites are
  unaffected. Regression test: `tests/mark1-coordination-regression.test.ts`
  + bundled fixture `tests/fixtures-lowfat-mark-1-19-20.xml` (confirmed the
  test fails without the fix, passes with it). Before/after SVG renders sent
  to Tim for visual confirmation. 667 tests pass; typecheck/lint/build clean.

- 2026-07-02 (found during phase 9, introduced by phase 8's default switch,
  fixed in phase 9 before shipping): `parseRef` in `src/io/parallel.ts` only
  recognized Nestle1904 osisIds ("Phil.1.1!3"), so an SBLGNT passage rendered
  NO parallel English at all. Fixed by teaching `parseRef` the SBLGNT ref
  spelling ("PHP 1:1!3") and adding the direct alignment path + method stats
  that make this class of silent failure visible.
- 2026-07-02 (found during Phase 14, NOT fixed — documented + blocked
  instead, does not block Phase 14): `sblgntHead()` in `src/io/lowfat.ts`
  mishandles coordinate/apposition/adjective-chain constructions with no
  explicit Lowfat `role` markers, producing either a flat "adjunct soup" (no
  head at all — 2 Cor 5:4's ἐκδύσασθαι/ἐπενδύσασθαι clause) or an incorrect
  head choice (an adjective like μεγάλου or πρωτότοκος instead of the noun it
  modifies — Titus 2:13, Colossians 1:15). Confirmed NOT a Mark-5-regression
  regression (those tests still pass) — a distinct construction class the
  Mark 5:26 fix didn't cover. Blocks SBLGNT contested-syntax mirrors for
  `iss_titus_2_13_granville`, `iss_matt_4_3_command`, `iss_2cor_5_4_leedy`,
  `iss_col_1_15_firstborn` (kept Nestle1904-only; see Phase 14). Recommended
  fix: generalize the head-priority fallback for multi-candidate adjective/
  apposition chains — out of scope to rush; needs its own verification pass
  against the whole GNT, not just these 4 passages.
- 2026-07-02 (found + fixed during Phase 14, dev tooling only, no product
  impact): `scripts/check-contested-registry.mts` reliably OOM'd once a
  second (SBLGNT) registry roughly doubled the number of full-book happy-dom
  parses in one process. Root cause not fully isolated (ruled out: simple
  cache growth — an LRU(3) eviction cache made it WORSE, not better, by
  forcing re-parses of non-adjacent repeated books). Fixed by running each
  registry's check in its own subprocess.

### Confirmed converter behavior behind the Mark 5:26 regression (Phase 2 audit)

The Lowfat source marks `τὰ παρ᾽ αὐτῆς πάντα` as ONE articular object
(`<wg role="o" class="np" articular="true" rule="DetNP">`), but puts
`head="true"` on `πάντα` inside the inner NP (`rule="PpNp2Np"`), while
`τὰ περὶ τοῦ Ἰησοῦ` (`rule="NpPp"`) puts `head="true"` on the article `τά`.
The converter's head percolation therefore emits:

- `δαπανήσασα —directObject→ πάντα` (article demoted to determiner, PP demoted
  beneath πάντα) — bug A;
- `ὠφεληθεῖσα (voice=passive) —directObject→ μηδέν`, stamped gold-standard
  `given` — bug B (the source role is `o`, but blind `o→directObject` mapping
  loses the passive nuance);
- `ἀκούσασα —directObject→ τὰ` with the PP beneath the article — the preferred
  shape, which makes the A/C inconsistency structural, not cosmetic — bug C.

So the fix (Phase 5) lives in `src/io/lowfat.ts` role mapping / head handling
for articular `<wg class="np">` groups and passive-participle `o` dependents,
plus the role vocabulary (Phase 3) and display labels (Phase 4).

## Decisions made

- 2026-07-02 — Plan authored; phases sequenced so the Mark 5 bug (phases 2–5)
  lands before the SBLGNT rebase (phases 6–9), because the bug is the point
  and the rebase is infrastructure.
- 2026-07-02 — Until Tim answers the remaining open questions, safe defaults
  apply: `μηδέν` and `πάντα` are never shown as ordinary direct objects by
  default; Nestle1904 stays visible as legacy/alternate; OpenText stays
  secondary; Hebrew gets regression protection; old patches are guarded by
  source/edition.
- 2026-07-02 (Tim) — For `μηδὲν ὠφεληθεῖσα`, use the conservative
  **"accusative modifier"** display label.
- 2026-07-02 (Tim) — Uncertain Greek roles: default confirmed — neutral label
  on the diagram, full nuance/uncertainty in detail cards/tooltips.
- 2026-07-02 (Tim) — SBLGNT default timing: default confirmed — add the
  loader first; flip the Greek default only after loader + Mark 5 regression
  tests pass.
- 2026-07-02 (Tim) — Mark 5:25–34 does **not** become the primary built-in
  regression/demo passage. Instead, bundle the Mark 5:25–34 and
  **Colossians 1:9–16** source data into the repo as test fixtures so tests
  don't re-pull from the network (feeds Phase 2).

- 2026-07-02 (phase 5) — With the articular PP rooted on its article, the
  whole phrase under the ACTIVE participle δαπανήσασα keeps the plain
  `directObject` relation (an accusative articular NP object of an active verb
  IS an ordinary direct object; the fix was *what* the object is, not the
  role). `objectLikeComplement` stays reserved for genuinely
  undecided object-ish cases. Relates to Tim's open question 1 — flag if you
  want the phrase labelled "object-like" instead.
- 2026-07-02 (phase 5) — Only explicit `voice="passive"` triggers the
  accusative downgrade; middle-passive forms keep their object (the middle
  reading takes a real object, and downgrading those would over-reach).

### Phase 3 type decisions (2026-07-02)

New `SyntacticRole` values (`src/domain/schema/syntax.ts`) — additive, so old
documents parse unchanged:

- `objectLikeComplement` — object-like accusative (renders on the baseline in
  the object slot; the label carries the nuance)
- `accusativeModifier` — the neutral default when the converter cannot decide
  (renders beneath the verb like an adverbial)
- `accusativeExtent`, `accusativeRespect` — the two named adverbial
  accusatives (beneath the verb)
- `retainedAccusative` — only when the analysis marks it explicitly (baseline
  object slot)
- `substantivalPrepositionalPhrase` — article + PP functioning as a noun

New `ProvenanceSource` values (`src/domain/schema/primitives.ts`):
`converted` (interpretive converter mapping), `reconstructed` (rebuilt for
display, not source-faithful), `alternate` (reviewer/alternate overlay).
New optional `Provenance` fields: `sourceRole` (the raw source role, e.g.
Lowfat `role="o"`, preserved whenever a converter relabels) and `editionId`
(populated when sources become edition-aware in phases 6+). We did NOT adopt
the spec's suggested numeric-confidence shape — the existing
`high|medium|low` enum is already used app-wide and is enough to express
"uncertain"; `sourceRole` + `reason` carry the audit trail. `uncertainComplement`
was likewise folded into `accusativeModifier` + confidence, keeping the enum
tight.

Updated consumers: `ui/editor/roles.ts` (ROLE_LABEL is the one exhaustive
map, + descriptions), `model/describe.ts` (detail-card phrases),
`model/glossary.ts`, `ui/editor/relationshipGuide.ts` (new "Nuanced Greek
accusatives" family — its test enforces every role is documented exactly
once), `layout/modes/dependency.ts` (SHORT_ROLE tags), `layout/modes/
phrase-block.ts`, `layout/constants.ts` (arc colour families),
`layout/engine.ts` (BASELINE_COMPLEMENTS gains objectLikeComplement +
retainedAccusative), `model/queries.ts` (VERB_HEADED_ROLES so re-roled words
attach to the verb).

## Open questions for Tim

Answered 2026-07-02 (see "Decisions made"): Mark 5 demo-passage question (no —
bundle Mark 5:25–34 + Col 1:9–16 as test fixtures instead), μηδέν label
("accusative modifier"), uncertainty placement (diagram neutral, nuance in
detail cards), SBLGNT default timing (after tests pass).

Still open:

1. For `δαπανήσασα τὰ παρ᾽ αὐτῆς πάντα`, display the whole phrase as
   object-like while showing `πάντα` as a modifier?
2. Should Nestle1904 remain visible to normal users or move to an
   advanced/legacy selector?
3. Should old Nestle1904 saved patches be preserved indefinitely, or is a
   clear legacy warning enough?
4. Should OpenText remain side-by-side for now, or become a formal overlay
   later?
5. Should Hebrew receive only regression protection, or should Hebrew source
   constituency be preserved too if easy?
6. Is it acceptable to hide incomplete source-constituency features behind a
   dev/debug flag during live review?

## Whole-project acceptance checklist (final, 2026-07-02)

1. ✅ Mark 5:26 no longer shows πάντα as the direct object by itself
   (article-rooted substantival phrase; πάντα is its adjectival modifier).
2. ✅ μηδέν is a neutral "accusative modifier" under the passive ὠφεληθεῖσα,
   never an ordinary direct object by default.
3. ✅ τὰ παρ᾽ αὐτῆς πάντα and τὰ περὶ τοῦ Ἰησοῦ get identical articular-PP
   treatment (Nestle1904; SBLGNT lacks the second τά — a real textual
   difference, preserved as such).
4. ✅ Roles exist and display for object-like, adverbial, respect, extent,
   retained, and uncertain accusative functions (diagram stays neutral;
   detail cards carry the nuance, per Tim).
5. ✅ Provenance distinguishes given / converted / inferred / reconstructed /
   manual / alternate, plus `sourceRole` and confidence; detail cards
   disclose it via the "Analysis:" line.
6. ✅ Default Greek NT source is SBLGNT Lowfat (`DEFAULT_GNT_SOURCE`).
7. ✅ Nestle1904 Lowfat fully selectable as legacy/alternate.
8. ✅ OpenText remains secondary/alternate.
9. ✅ BSB alignment: SBLGNT-direct by position; Strong's/positional fallback
   retained; per-token method metadata.
10. ✅ Lowfat `<wg>` source constituency preserved (optional additive layer).
11. ✅ Existing Constituency Tree renders the source tree when available…
12. ✅ …with the reconstructed tree as fallback, captioned honestly, with an
    Auto/Source/App toggle.
13. ✅ Hebrew WLC Lowfat untouched and green in the suite.
14. ✅ Patches are edition-stamped (`sourceId`) and never silently cross
    editions (skip + warn + keep); legacy patches keep working via baseHash.
15. ✅ README explains the data-source model.
16. ✅ This plan reflects the final state.
17. ✅ Tests: Mark 5 under both editions, SBLGNT loader, Nestle1904 suite,
    BSB alignment (both paths + methods), source constituency + reconstructed
    fallback, OpenText smoke, Hebrew smoke, patch guards — 656 tests, 61
    files, all passing; typecheck, lint, and production build clean.

Known intentional limitations (recorded for follow-up):
- ~~Contested-syntax registry entries are authored against Nestle1904 ids~~ —
  RESOLVED, see Phase 14 below: a mirrored SBLGNT-anchored registry now ships
  25 of 29 GNT issues.
- Hebrew source constituency is not yet captured (Tim's default: regression
  protection only); `captureSourceConstituency` works for it when wanted.
- Open questions 1–6 under "Open questions for Tim" remain open; safe
  defaults are in effect.

## Phase 14 (post-acceptance follow-up): SBLGNT-anchored contested-syntax registry

Tim asked, after PR 13 merged: "review the contested syntax bridges and
convert them to SBLGNT." Delivered as `src/data/contestedSyntaxSblgnt.ts` — a
SECOND curated registry mirroring the Nestle1904 debates onto SBLGNT's own
ids, wired into `allContestedIssues()`/`allAlternateReadings()` alongside the
original.

**Method** — `scripts/generate-contested-sblgnt.mts` +
`scripts/merge-contested-sblgnt.mjs`, driven per-issue (happy-dom's memory
footprint across ~15 full books per run forced a one-process-per-issue
approach — see below): every token maps Nestle1904→SBLGNT by Strong's number
+ within-verse position (mirrors `alignParallel`'s cross-edition alignment);
every node maps via its REPRESENTATIVE token (`repTokenId`); every relation
maps by taking the mapped dependent's CURRENT parent relation in the SBLGNT
tree. `scripts/convert-contested-to-sblgnt.mts` is the diagnostic sibling
(console output, includes a relation-TYPE mismatch detector) used to review
every conversion before it shipped.

**Review caught real problems, not just id drift.** The type-mismatch
detector and hand verification found FOUR Nestle1904 issues whose "default
vs. alternate" framing does not hold under the current SBLGNT converter,
because SBLGNT's head-inference produces a qualitatively different base tree
for their specific construction (long adjective/apposition/coordination
chains without explicit Lowfat `role` markers — a gap beyond what the Mark
5:26 fix covered):

- `iss_titus_2_13_granville` — μεγάλου (an adjective) wrongly becomes the
  head of "the great God and our Savior Jesus Christ" via a chain of
  apposition relations (should be θεοῦ).
- `iss_matt_4_3_command` — SBLGNT's base tree ALREADY shows the ἵνα-clause as
  εἰπὲ's direct object — i.e. SBLGNT's DEFAULT already matches what
  Nestle1904 calls the ALTERNATE. Shipping this would misrepresent SBLGNT's
  own reading as "debated" when the debate is invisible in that tree.
- `iss_2cor_5_4_leedy` — the οὐ/ἐκδύσασθαι/ἀλλά/ἐπενδύσασθαι clause converts
  as four flat `adjunct` children (no head at all) instead of a proper
  head+dependents shape.
- `iss_col_1_15_firstborn` — κτίσεως wrongly becomes head with πρωτότοκος as
  ITS adjectival modifier (backwards from "πρωτότοκος → κτίσεως genitive").

Per the project's "prefer honest over falsely precise" rule, these four stay
Nestle1904-only — documented in `contestedSyntaxSblgnt.ts`'s header — rather
than shipping a debate description on top of a demonstrably degraded base
tree. **Recommended follow-up**: generalize `sblgntHead()` in `src/io/
lowfat.ts` for coordinate/apposition/adjective-chain constructions lacking
explicit Lowfat roles (the current priority list handles single clear heads
well but falls through to the "bare container" flat-adjunct path — or an
adjective — too easily when several plausible heads compete). Re-run
`scripts/convert-contested-to-sblgnt.mts` against these four passages after
any such fix to see if they can be un-blocked.

One MORE issue (`iss_gal_2_16_pistis_christou`) needed a one-line hand
correction, NOT a converter bug: SBLGNT's actual word order is "πίστεως
Ἰησοῦ Χριστοῦ" (Ἰησοῦ before Χριστοῦ — a genuine, known textual difference
from Nestle1904's "πίστεως Χριστοῦ Ἰησοῦ"), so Χριστοῦ is no longer πίστεως's
direct genitive dependent in SBLGNT — Ἰησοῦ is, with Χριστοῦ in apposition to
it. Fixed by pointing the first occurrence's `relationId` at the real
genitive relation (`r_s28_30`, verified by hand) instead of the naively
dependent-tracked apposition relation.

Romans 9:5 (a `mergePassageIds` cross-sentence issue) was hand-authored and
verified against a real `combinePassage` run over the two SBLGNT sentences
(same sentence boundaries as Nestle1904 for this passage, confirmed by
dumping both editions).

**Tooling fix, not just data**: `scripts/check-contested-registry.mts` now
validates BOTH registries — but running ~30 full-book happy-dom parses in one
process reliably OOM'd (confirmed independent of caching strategy: an
unbounded per-book cache, a bounded LRU(3) cache, and a fresh-`Window`-per-
book all either still crashed or made it worse — LRU actually made things
WORSE by forcing re-parses of non-adjacent repeated books). Fix: each
registry now validates in its OWN subprocess (`--only=nestle` /
`--only=sblgnt`, spawned by the default invocation with an 8 GB heap each),
so `npm run contested:check` is back to a single reliable command. This
subprocess-per-registry pattern is worth remembering for any future
whole-corpus sweep script.

Files: `src/data/contestedSyntaxSblgnt.ts` (new registry, 25 issues / 37
readings), `src/domain/contested/registry.ts` (merges both registries),
`src/domain/schema/contested.ts` (additive `sourceId` field on issue +
reading), `scripts/{generate,merge,convert}-contested-sblgnt*` (new
tooling), `scripts/check-contested-registry.mts` (SBLGNT-aware +
subprocess-per-registry), `scripts/dump-passage-syntax.mts` (already
SBLGNT-aware from phase 7), `tests/contested-sblgnt.test.ts` (new).
Build/test: typecheck + lint + production build clean; `npm run
contested:check` exits 0 (32 Nestle1904/WLC + 25 SBLGNT, 0 errors); 663
tests / 61 files pass.

## Resume instructions if interrupted

Current phase: ALL 13 PHASES + Phase 14 (SBLGNT contested-syntax mirror)
COMPLETE.

SUPERSEDED (2026-07-02, source-conversion project): the Phase 14 limitation
below was closed by the staged source-conversion project — see
`docs/source-role-conversion-audit.md` (living audit + per-stage status) and
`docs/source-constituency-audit.md`. The `sblgntHead()` generalization
landed (scored inference: classless wrappers resolve through their own head
constituent; genitive candidates demote relative to non-genitive
case-bearing siblings; clauses rank in the verbal tier), fixing Titus 2:13,
Col 1:15, and 2 Cor 5:4. Titus 2:13 and Col 1:15 are now mirrored into the
SBLGNT contested registry; Matt 4:3 and 2 Cor 5:4 stay Nestle1904-only as
DOCUMENTED EDITION DIFFERENCES (SBLGNT's own base tree resolves those
constructions differently), not converter gaps.

Historical note (pre-project state): 4 Nestle1904 contested issues had no
SBLGNT mirror, pending an `sblgntHead()` generalization — see Phase 14
above for what the gap was.

Superseded status notes from phase 9:
Changed files (phase 9): `src/io/parallel.ts`, `tests/parallel.test.ts`.

Superseded status notes from phase 8:
Changed files (phase 8): `src/io/sources.ts` (`DEFAULT_GNT_SOURCE`),
`src/io/gnt-sblgnt.ts` (Philippians bundled), `public/sblgnt/
11-philippians.xml` (new), `src/ui/panels/left/GntPicker.tsx` (default +
order + per-edition bundled sets), `src/ui/panels/left/SearchPicker.tsx`
(SBLGNT default + option + evict), `src/ui/contested/
ReadingChoiceControl.tsx` (edition-named base label), `tests/sources.test.ts`.
Current build/test status: typecheck + lint + production build clean;
59 files / 642 tests pass. Mark 5 regression passes under the default source.
Known broken behavior: none known. Note: the contested-syntax registry is
authored against Nestle1904 ids, so contested badges only appear on
Nestle1904 passages — intentional for now (registry entries are
edition-scoped by construction; revisit under phase 12 if SBLGNT variants
should be curated).
Next smallest safe task: Phase 9 — `src/io/parallel.ts`: the BSB alignment's
Greek base is SBLGNT, so add DIRECT positional alignment (verse + within-verse
index via `morphology.extra.ref` "MRK 5:25!1") for SBLGNT docs, keep the
Strong's/lemma matching as the Nestle1904/fallback path, and add
alignment-method metadata for debuggability.
