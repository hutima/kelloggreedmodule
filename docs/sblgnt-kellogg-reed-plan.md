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
| 8. Default switch | Not started | Only after loader tests pass. |
| 9. Alignment cleanup | Not started | BSB alignment is already SBLGNT-based; direct alignment becomes possible. |
| 10. Source constituency | Not started | Preserve Lowfat `<wg>` hierarchy as optional layer. |
| 11. Constituency UI | Not started | Improve existing mode; source vs reconstructed toggle. |
| 12. Migration guards/tests | Not started | Patch base source/edition guard; Hebrew/OpenText smoke tests. |
| 13. Cleanup | Not started | |

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

## Resume instructions if interrupted

Current phase: 7 complete; next is 8 (SBLGNT default switch).
Changed files (phase 7): `src/io/lowfat.ts` (`sblgntDialect` + head
inference + dialect/docIdPrefix options + edition-agnostic verseRef),
`src/io/gnt-sblgnt.ts` (new loader), `src/io/{sources,index}.ts`,
`src/sw.ts` (cache rule), `src/state/store.ts` (sibling nav per edition),
`src/ui/panels/left/GntPicker.tsx` (SBLGNT option + attribution + offline
save), `tests/sblgnt.test.ts` + bundled SBLGNT Mark fixture, `README.md`
attribution, `tests/sources.test.ts`.
Current build/test status: typecheck + lint + production build clean;
59 files / 641 tests pass. Mark 5:26 regression verified under BOTH editions.
Known broken behavior: none known.
Next smallest safe task: Phase 8 — flip the Greek default to SBLGNT: GntPicker
default source + option order, whatever seeds the first-run/bundled starter
passage (keep Philippians Nestle1904-bundled behavior graceful — consider
bundling SBLGNT Philippians under `public/sblgnt/`), and make sure saved
patches keep loading against their own edition. Mark 5 regression must pass
under the default source.
