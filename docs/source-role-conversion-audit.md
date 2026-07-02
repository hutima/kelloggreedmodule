# Source → Syntax-Graph Conversion Audit

Audited 2026-07-02, at commit `af06680` (post PR #194), then kept current as
the staged "source-faithful conversion + source-first Constituency" project
landed (Stages 1–11 — one commit per stage on this branch; each commit
message is that stage's handoff note).

## Final project status (Stage 11)

| Stage | Delivered |
| --- | --- |
| 1 | this audit + `source-constituency-audit.md` (docs only) |
| 2 | Constituency mode renders raw source `rule`/`articular`; `head` never masked by a role; classless wrappers stay visible; fixture tests (SBLGNT Mark 1:19–20, Col 1:16 QuanPp, Nestle1904 Mark 5:25–27) |
| 3 | conversion validation harness (`tests/helpers/validate*.ts`) over every fixture, all four sources; found+fixed `combinePassage` dropping `labelNodeId` prefixes |
| 4 | behavior-preserving extraction: `classifyLowfatRule`, `isPhraseCoordinationRule`, `isClauseCoordinationRule`, `normalizeLowfatClauseRole`, `normalizeLowfatPhraseRole` |
| 5 | scored `sblgntHead()`: classless wrappers rank through their head constituent; genitives demote relative to non-genitive case-bearing siblings — fixes Titus 2:13 (θεοῦ heads) and Col 1:15 (πρωτότοκος heads) |
| 6 | contrastive rules (`notVPbutVP`) coordinate in `convertPhrase`; clauses rank in the verbal tier — fixes 2 Cor 5:4 (no adjunct soup; conjunct/coordinator/adverbial shape) |
| 7 | contested bridge: Titus 2:13 + Col 1:15 mirrored onto SBLGNT (hand-verified ids); Matt 4:3 + 2 Cor 5:4 documented as genuine edition differences, not mirrored |
| 8 | OpenText: raw `sourceRole` provenance on every wordgroup/component relation; clause-layer source constituency (wordgroup nesting deferred, documented) |
| 9 | Hebrew: Gen 1:1–3 / Ps 1:1–2 / Deut 6:4 protection fixtures + validators; WLC source constituency via the shared capture; found+fixed the Psalm 1:2 compound-subordinator (כִּי אִם) token collapse |
| 10 | cross-mode role-display coverage tests (all 33 roles × label/short-tag/detail-phrase; provenance disclosure) |
| 11 | this status, stale-doc cleanup, full acceptance sweep |

Remaining known limitations (deliberate, documented):
- OpenText's wordgroup-layer phrase nesting is not folded into its source
  constituency tree (clause layer only) — see `io/opentext.ts`.
- `iss_matt_4_3_command` and `iss_2cor_5_4_leedy` stay Nestle1904-only:
  SBLGNT's own base tree resolves those constructions differently (edition
  differences, not converter gaps).
- SBLGNT relations derived from *inferred* heads are still stamped `given`
  (relation TYPES track explicit source roles; only the head choice is
  inferred). Candidate future hygiene: a `reason`/`converted` stamp on
  relations whose head came from inference.

Read together with:

- `CLAUDE.md` — the three-concern separation (tokens / syntax / layout) and
  the schema reference.
- `docs/sblgnt-kellogg-reed-plan.md` — the completed SBLGNT rebase (phases
  1–14), including the Mark 5:26 / Mark 1:19–20 / Col 1:16 fix history this
  project must not regress.
- `docs/source-constituency-audit.md` — the constituency-specific companion
  audit (source-first behavior of the Constituency Tree mode).

## 1. The four data layers

The app separates, per document (`KrDocument`):

| Layer | Shape | Populated by | Consumed by |
| --- | --- | --- | --- |
| 1. Tokens | `Token[]`, surface order only | converter leaf reads | every view's text strip; alignment |
| 2. Source constituency | `sourceConstituency?: SourceConstituencyTree` — the published `<wg>` hierarchy verbatim | `captureSourceConstituency` (`src/io/lowfat.ts`) when a loader passes `sourceId` | Constituency Tree mode only |
| 3. Normalized syntax | `syntax: SyntaxModel` — typed head→dependent relations in the app's role vocabulary | each source converter | Kellogg-Reed, Dependency, Phrase/Block, Morphology, editing, inference |
| 4. Layout | geometry from the layout engine + `layoutHints` | layout engine | renderer |

Layer 2 is **strictly additive and never user-edited**; layer 3 is what the
user edits (as a patch over the base). The converters must keep them honest
independently: improving layer-3 role conversion must never rewrite layer 2,
and layer 2's raw source labels must never be silently translated into app
roles.

## 2. Source-by-source syntax mapping (layer 3)

### 2.1 SBLGNT Lowfat / MACULA Greek — primary/default

- **Loader**: `src/io/gnt-sblgnt.ts` → `lowfatToDocuments(xml, { dialect:
  sblgntDialect, docIdPrefix: 'sblgnt', sourceId:
  'macula-greek-sblgnt-lowfat' })`.
- **Converter**: the shared `SentenceConverter` in `src/io/lowfat.ts`, with
  the `sblgntDialect` leaf adapter.

| Fact | Where it comes from | Direct or interpretive? |
| --- | --- | --- |
| POS | `<w class>` (+ `mood="participle/infinitive"` → `participle`/`infinitive`; `type="proper"` → `propernoun`) — `posOf` | **direct** relabelling |
| Morphology | `case/gender/number/person/tense/voice/mood` attributes verbatim; `ref` + `strong` into `morphology.extra` — `sblgntMorphOf` | **direct** |
| Word ids | `xml:id` / `ref` | direct |
| **Heads** | **NOT in the source.** SBLGNT Lowfat carries no `head="true"` at all; every group's head is inferred by `sblgntHead()` (a role→class priority list, `lowfat.ts`) | **interpretive — the main known gap** (see §4) |
| Clause roles | child `role` attribute: `s`→subject, `o`→directObject (or `accusativeModifier` under explicit passive), `o2`→objectComplement, `io`→indirectObject, `p`→predicateNominative/predicateAdjective (or adverbial when the p is a PP), `adv`→adverbial, else adjunct — `convertClause` | mostly direct relabelling; the passive-`o` downgrade and the `p`-is-a-PP rerouting are **interpretive** (stamped `converted`, `sourceRole` preserved for the passive case) |
| Phrase roles | `phraseChildRole`: class/rule heuristics (det/art/om→determiner, adv/advp→adverbial, pp→prepositionalPhrase, adj/adjp/num→adjectival, cl→adjectival, `appos` rules→apposition, `gen/ofnp` rules→genitive, genitive case→genitive, default→apposition) | **interpretive** — currently stamped `given` except in the articular-PP path (honesty gap, see §5.3) |
| Coordination | `isCoordinationRule` (Conj-prefix, case-sensitive `a`-infix, asyndetic repeats) + `isPhraseCoordination` (classless `<wg>` with a phrase-level rule) + `isCoordinatorWord` (conj classes + particle τε) | interpretive rule reading |
| Articular substantival PPs | `articularPpParts` / `convertArticularPp` — rooted on the article, stamped `converted` with the raw `head` marking in `sourceRole` | interpretive, honestly stamped |
| Periphrasis | `isPeriphrasticVp` (`rule="BeVerb"` + finite verb + participle) → one compound predicate node | interpretive |
| Contrastive PPs | `convertContrastivePp` (rule contains `but`) → flattened coordination | interpretive |

**Provenance honesty today**: nodes/relations are stamped `given`/`high`
except the two deliberate `converted` paths (passive accusative,
articular PP). Head inference — genuinely interpretive — is **not** visible
in provenance: a relation produced from an inferred head is stamped `given`
just like a Nestle1904 head-marked one. That is acceptable only because the
relation *types* mostly track explicit `role` attributes; PR 5+ should stamp
inferred-head-derived relations honestly (`converted` or a `reason`).

### 2.2 Nestle1904 Lowfat / MACULA Greek — legacy/secondary

Same converter, `greekDialect` adapter (`src/io/gnt.ts`, `sourceId:
'macula-greek-nestle1904-lowfat'`). Differences from SBLGNT:

- **Heads are explicit**: every `<wg>` has one `head="true"` child;
  `headChild()` honors it before any fallback. This is why the four §4 head
  failures are SBLGNT-only.
- Word ids on `n`/`osisId`; verse milestones `Mark.5.25` vs SBLGNT's
  `MRK 5:25`; alignment anchors `osisId`+`strong` vs `ref`+`strong`.
- All role/rule mapping (`convertClause`, `phraseChildRole`,
  `isCoordinationRule`, articular PP, periphrasis) is shared — so any change
  there affects **both** editions and Hebrew. PR 4's refactor must keep
  edition-specific behavior explicit.

### 2.3 OpenText.org — alternate comparison source

`src/io/opentext.ts` (+ `opentext-align.ts`, `opentext-source.ts`). NOT
Lowfat: a three-layer standoff annotation (base words / wordgroups /
clauses) keyed by word id.

| Fact | Where it comes from | Direct or interpretive? |
| --- | --- | --- |
| POS | base-layer code (`NON/PRO/ADJ/…/VBF/VBP/VBN`) → `POS_CODE`; NON + Louw-Nida domain 93 → propernoun; PAR + lemma in `CONJUNCTION_LEMMAS` → conjunction | mostly direct; the PAR→conjunction promotion and propernoun-by-domain are **interpretive** |
| Morphology | base-layer `pos` element attributes, mapped tables | direct |
| Clause roles | clause layer components: `cl.s`→subject, `cl.p`→predicate, `cl.a`→adverbial, `cl.add`→adjunct, `pl.conj`→conjunction; `cl.c`→directObject, or predicateNominative/predicateAdjective when the predicate lemma is in `COPULA_LEMMAS` (εἰμί/γίνομαι/ὑπάρχω) or absent | `cl.c` mapping is **interpretive** (copula-lemma test), currently stamped `given` |
| Phrase roles | wordgroup modifier edges `definer/specifier/qualifier/relator/connector` → `modRole()`: article→determiner, adj/num→adjectival, definer→genitive-or-apposition by case, specifier→adjectival, qualifier→PP/genitive/apposition, relator(preposition)→prepositionObject | 1:1 relabellings stay `given`; case-decided splits (definer/qualifier → genitive-vs-apposition) are stamped `converted`; **Stage 8**: every wordgroup relation now preserves the raw OpenText role in `provenance.sourceRole` |
| Clause-component provenance | `cl.s`/`cl.a`/`cl.add`/`pl.conj` are `given` with raw `sourceRole` (S/A/add/conj); `cl.c` — whose object-vs-predicate-complement split is decided by the copula lemma list — is `converted`/medium with `sourceRole: 'C'` (**Stage 8**) | honest |
| Heads | the wordgroup layer's own head/modifier structure (explicit in the source) | direct |
| Constituency hierarchy | **Stage 8**: the CLAUSE layer (clauses + S/P/C/A components, raw labels, source order) is preserved as `sourceConstituency` (`captureOpenTextConstituency`) and drives the Constituency Tree in Auto mode with an "OpenText" caption. The WORDGROUP layer's phrase-internal nesting is deliberately NOT folded in — it is a parallel standoff structure whose ordering semantics differ from the clause layer; folding it in faithfully needs its own design pass (documented in `io/opentext.ts`), so phrase-internal structure remains visible only in the normalized graph views | clause layer source-backed; wordgroup nesting deferred, documented |

Extra caveats: surfaces are lemma-only in the source (copyright); the
displayed surface is aligned from Nestle1904 (`opentext-align.ts`, ~94%
coverage on Philemon). `clauseTypeOf` maps `level=embedded/secondary` →
`complement` — coarse but honest-ish (everything else `independent`).

### 2.4 Hebrew WLC Lowfat / MACULA Hebrew

`src/io/macula-hebrew.ts` — shared `SentenceConverter` with the
`hebrewDialect` adapter.

- POS from `class` (`cj`→conjunction, `art`→article, `om`/`rel`→particle,
  `suffix`→pronoun, participle/infinitive by `type`), morphology
  gender/number/person typed + `state`/`stem`/`type`/`translit` in `extra`
  (no `case` — Hebrew has none). Direct relabelling.
- **Heads**: `head="true"` exists but only on word-GROUPS, never `<w>`
  leaves; `heHeadFallback` picks the first non-function-morpheme
  (`HE_FUNCTION_CLASSES`) inside a leaf group. Mildly interpretive,
  linguistically safe.
- Greek-specific interpretive logic **cannot misfire on Hebrew** by
  construction: the passive-accusative downgrade requires
  `case="accusative"` (Hebrew has no case attribute) and `articularPpParts`
  requires a `<w class="det">` child (the Hebrew article is `class="art"`).
  Worth pinning with tests in PR 9, since it is currently implicit.
- **No `sourceConstituency` is captured** — `maculaHebrewToDocuments` builds
  documents by hand and never passes `sourceId`/`captureSourceConstituency`.
  Deferred per Tim's "regression protection only" default (plan phase 10);
  the Hebrew Lowfat trees have the same `<wg>` shape, so the existing helper
  would work if wanted (PR 9 decision).

### 2.5 Other document origins (no source)

Manually typed sentences, LLM imports (`io/llm.ts`), and user-edited graphs
have no published source: no `sourceConstituency`, roles from the inference
engine (`inferred`) or the user (`manual`). Constituency mode reconstructs
for them by design.

## 3. Recent history this project must preserve

All four are covered by offline fixtures + regression tests (see the test
inventory in §6):

1. **Mark 5:26** (PR #189; both editions) — articular substantival PP
   rooted on the article; πάντα is its adjectival modifier, never the bare
   direct object; passive ὠφεληθεῖσα's μηδέν is a neutral
   `accusativeModifier` (`converted`/medium/`sourceRole: 'o'`); only
   explicit `voice="passive"` triggers the downgrade (middle-passive keeps a
   real object).
2. **Mark 1:19–20** (PRs #190–#191) — (a) layout: a clause conjunct in a
   word coordination must render; (b) converter: SBLGNT's classless
   phrase-coordination `<wg role="o" rule="NpaNp">` routes to
   `convertPhrase`, never collapses into one fake token or falls into the
   no-verb clause path.
3. **Col 1:16 `QuanPp`** (PR #192) — `QuanPp` is not a coordination
   (case-sensitive `a`-infix matching); a classless `Conj2Pp` wrapper whose
   converted head is a preposition attaches as `prepositionalPhrase`, not
   apposition; ἐπὶ τῆς γῆς stays a conjunct of ἐν τοῖς οὐρανοῖς; τὰ ὁρατὰ
   καὶ τὰ ἀόρατα stays apposition of πάντα; no dropped tokens.
4. **PR #193/#194** — layout-only cleanups; they demonstrate (per the
   project brief) that layout must not be used to hide conversion bugs, not
   that layout should fix them.

## 4. Known open failures (the work queue)

All four are SBLGNT-only `sblgntHead()` failures, documented in plan
phase 14 and in `src/data/contestedSyntaxSblgnt.ts`'s header; they block the
SBLGNT mirrors of four contested-syntax issues.

| Passage | Failure | Blocked contested issue |
| --- | --- | --- |
| Titus 2:13 — **FIXED (Stage 5)** | adjective μεγάλου became head of "the great God and our Savior…" because the classless `NpaNp` wrapper wasn't recognized as nominal; the scored head inference resolves classless wrappers through their own head constituent, so θεοῦ heads with μεγάλου adjectival (`tests/sblgnt-head-inference.test.ts`) | `iss_titus_2_13_granville` (re-evaluate in Stage 7) |
| Col 1:15 — **FIXED (Stage 5)** | genitive "πάσης κτίσεως" outranked nominative πρωτότοκος; genitive candidates are now demoted relative to non-genitive case-bearing siblings, so πρωτότοκος heads with κτίσεως as its genitive dependent | `iss_col_1_15_firstborn` (re-evaluate in Stage 7) |
| 2 Cor 5:4 — **FIXED (Stages 5–6)** | the οὐ … ἐκδύσασθαι … ἀλλά … ἐπενδύσασθαι construction previously converted as flat "adjunct soup"; the Stage 5 head inference makes ἐκδύσασθαι head, and Stage 6 treats contrastive rules (`notVPbutVP`) as coordination in `convertPhrase` (ἐπενδύσασθαι → conjunct, ἀλλά → coordinator, οὐ → adverbial) and ranks clauses in the verbal tier so the substantival participial subject outranks the focusing adverb καί (`tests/sblgnt-2cor-5-4.test.ts`) | `iss_2cor_5_4_leedy` (re-evaluate in Stage 7) |
| Matt 4:3 — **RESOLVED as edition difference (Stage 7)** | re-verified under the Stage 5–6 converter: SBLGNT's base tree still reads `εἰπὲ —directObject→ [ἵνα clause]` (and `λίθοι —apposition→ οὗτοι`) — SBLGNT's default IS what Nestle1904 calls the alternate, so the debate is invisible in this edition and is documented (contestedSyntaxSblgnt.ts header) rather than mirrored | `iss_matt_4_3_command` stays Nestle1904-only by design |

Stage 7 contested-bridge outcomes: `iss_titus_2_13_granville_sblgnt` and
`iss_col_1_15_firstborn_sblgnt` are now mirrored (hand-verified ids; Titus
needed the Gal-2:16-style word-order correction — SBLGNT reads Ἰησοῦ
Χριστοῦ, so the apposition dependent is Ἰησοῦ/r_s17_65, not Χριστοῦ).
`iss_2cor_5_4_leedy` stays Nestle1904-only: the SBLGNT base already
coordinates the infinitives (partially matching the Leedy alternate) and
attaches the ἵνα clause adverbially under στενάζομεν, so the Nestle1904
issue's default-reading prose would misdescribe this edition's base tree.

Root cause (first three): `sblgntHead()` is a flat priority list
(role v/vc → class cl → np/noun/pron → adjp/adj/num → vp/verb → advp/adv →
pp → first-non-function-word → first). It has no notion of (a) case
agreement or genitive-chain demotion inside nominal groups, (b) infinitives
as heads of infinitival constructions, (c) contrastive coordination, so
multi-candidate groups either pick the first adjective-ish child or fall
through to `convertClause`'s bare-container adjunct path. Matt 4:3 is
different in kind: not a converter bug but a genuine base-tree difference
between editions — the fix is documentation, not code.

## 5. Prioritized converter gaps (feeds the PR sequence)

1. **(PR 5)** `sblgntHead()` nominal chains — noun/propernoun/pronoun must
   outrank adjective/numeral; genitives are dependents, not heads (Titus
   2:13, Col 1:15).
2. **(PR 6)** `sblgntHead()` / clause routing for infinitival + contrastive
   constructions — no flat adjunct soup (2 Cor 5:4).
3. **(PR 3, prerequisite)** No conversion validator exists: dropped tokens,
   fake wg-collapse tokens, dangling relations, passive+directObject,
   PP→apposition fall-through, bad head choice are only guarded
   passage-by-passage today.
4. **(PR 4, prerequisite)** Rule logic is scattered across
   `SentenceConverter` methods and free functions; extract named helpers
   (`classifyLowfatRule`, `isPhraseCoordinationRule`, …) before changing
   inference so behavior changes are reviewable.
5. **(PR 5+ hygiene)** Inferred-head relations under SBLGNT are stamped
   `given`; they should carry honest provenance (`converted` or `reason`)
   without spamming per-verse notes.
6. **(PR 8)** OpenText interpretive mappings (`definer`→apposition/genitive,
   `cl.c`→object-vs-predicate by copula lemma list, PAR→conjunction) are
   stamped `given` with no `sourceRole` — the raw OpenText role should ride
   provenance like Lowfat's converted paths do. OpenText wordgroup/clause
   layers are flattened; source-backed constituency is possible but
   unbuilt.
7. **(PR 2)** Constituency display gaps — see
   `docs/source-constituency-audit.md` §4.
8. **(PR 9)** Hebrew: no validator coverage beyond Gen 1:1; source
   constituency capture deferred; the "Greek logic can't misfire" guarantees
   of §2.4 are implicit, not test-pinned.
9. **(PR 10)** Role-display completeness across KR labels, dependency
   `SHORT_ROLE`, phrase-block grouping, relationship guide, describe.ts —
   the phase-3 additions were wired everywhere, but there is no single test
   asserting every `SyntacticRole` renders in every consumer (the
   relationship-guide test covers only the guide).

## 6. Test + tooling inventory (as of this audit)

- Runner: Vitest (`npm test`); `npm run typecheck` (tsc -b), `npm run lint`
  (eslint), `npm run build` (tsc -b && vite build), `npm run contested:check`
  (validates both contested registries in subprocesses; needs network for
  book fetches), `npm run dump-syntax` (passage dump, needs network).
- Conversion regression tests with offline fixtures:
  `mark5-regression.test.ts` (+ SBLGNT twin in `sblgnt.test.ts`),
  `mark1-coordination-regression.test.ts`,
  `sblgnt-coordination-regression.test.ts`,
  `col-1-16-quanpp-regression.test.ts`, `lowfat.test.ts` (Phil 1:1–2, Col
  1:9–16), `macula-hebrew.test.ts` (Gen 1:1), `opentext.test.ts`,
  `source-constituency.test.ts`.
- Fixtures live in `tests/fixtures-*.xml`. **Titus 2:13, Col 1:15, 2 Cor
  5:4, Matt 4:3 have NO offline fixtures yet** — they are exercised only as
  contested-registry entries against network passages. PR 5/6 must bundle
  fixtures for them first.

## 7. Recommended next stage (PR 2) — exact scope

Constituency mode is already source-first (see the companion audit), so
PR 2 is a **verification + honesty-polish** PR, not a rebuild:

1. Render the captured-but-invisible source metadata: `rule` and
   `articular` on source-tree chips/tooltips, and stop `head="true"` being
   hidden when a node also carries a `role` (today the chip shows only the
   role).
2. Add the missing fixture tests: SBLGNT Mark 1:19–20 source tree preserves
   the classless coordination wrappers verbatim (no fake token); SBLGNT Col
   1:16 source tree shows `rule="QuanPp"` raw (not an app-generated
   coordination); Nestle1904 Mark 5:26 source tree preserves `DetNP` /
   `PpNp2Np` / `NpPp` rules, `articular`, and explicit heads; reconstructed
   mode still works with `sourceConstituency` absent; Source mode with no
   tree visibly says so (already implemented — pin it).
3. Document (do not yet fix) the display-only collapse of the categoryless
   single-child `<wg role="cl">` shell in `buildSourceTree`, and decide
   whether it violates "source child order / nodes preserved" (capture is
   verbatim; only the drawing collapses the shell).
4. No KR/dependency conversion changes; no layout-geometry changes beyond
   the chip additions.
