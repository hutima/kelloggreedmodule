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
| 3. Role/provenance model | Not started | Add nuanced accusative roles + richer provenance; additive only. |
| 4. KR display labels | Not started | `describe.ts`, layout labels, detail cards. |
| 5. Converter fixes | Not started | `src/io/lowfat.ts`: passive-participle accusatives, articular PPs. |
| 6. Source model | Not started | Edition-aware `SyntaxSourceId`s. |
| 7. SBLGNT loader | Not started | Keep Nestle1904 loader intact. |
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

Current phase: 2 complete; next is 3 (role/provenance model).
Changed files: `README.md`, `docs/sblgnt-kellogg-reed-plan.md`,
`tests/mark5-regression.test.ts`, `tests/fixtures-lowfat-mark-5-25-34.xml`,
`tests/fixtures-lowfat-col-1-9-16.xml`.
Current build/test status: typecheck clean; 58 files / 623 tests pass
(5 Mark 5 desired-behavior specs are inverted via `it.fails`).
Known broken behavior: the Mark 5:26 role mapping (bugs A/B/C above) — now
captured by `tests/mark5-regression.test.ts`.
Next smallest safe task: Phase 3 — add nuanced accusative / substantival-PP
role values to `SyntacticRoleSchema` (additive) and audit provenance so a
relation can record source role vs display role and uncertainty.
