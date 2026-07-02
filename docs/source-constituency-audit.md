# Source Constituency Audit — Constituency Tree mode

Audited 2026-07-02, at commit `af06680`. **Documentation only.** Companion to
`docs/source-role-conversion-audit.md` (§7 there gives the resulting PR 2
scope). This document answers: *is the Constituency Tree mode source-first
today, per source, and where does it fall short of the acceptance criteria?*

## 1. Verdict

**Yes — Constituency mode is genuinely source-first for the two Greek Lowfat
editions**, and honestly labeled. For every other origin it reconstructs
from the normalized syntax graph and says so. The remaining gaps are
metadata display (rule/articular/head visibility) and coverage (Hebrew,
OpenText), not architecture.

## 2. How the mode works today

- **Capture** (`src/io/lowfat.ts`, `captureSourceConstituency`): when a
  loader passes `sourceId`, the sentence's `<wg>` hierarchy is recorded
  verbatim into `doc.sourceConstituency` (`src/domain/schema/constituency.ts`):
  per node `kind` (wg/word), `cat` (= source `class`), `role`, `rule`,
  `head` (only when the source wrote `head="true"`), `articular`,
  leaf `tokenIds`, children in source order. Pure recording — no
  interpretation, no app roles, classless `<wg>`s kept as nodes.
- **Selection** (`src/domain/layout/modes/constituency.ts`,
  `layoutConstituency(doc, orientation, variant)`): `variant` is
  `'auto' | 'source' | 'reconstructed'` (default `auto`). Auto and Source
  build from `doc.sourceConstituency` when present; Reconstructed — and any
  document without a source tree — builds from `doc.syntax` via `build()`.
- **Honesty caption** (emitted with the layout, drawn on the diagram):
  `"Source constituency: SBLGNT Lowfat"` / `"…Nestle 1904 Lowfat"`, or
  `"Reconstructed from the app syntax graph"`, or — when the user forces
  Source and none exists — `"Reconstructed from the app syntax graph (no
  source tree available)"`. So Source mode never *silently* falls back.
- **Raw labels**: the branch chip shows the RAW source role text (s, v, o,
  io, p, adv, …) verbatim; app-role translation is used **only** to pick a
  familiar branch colour (`SOURCE_ROLE_COLOR`), never the chip text.
- **UI switch**: a 3-button Auto/Source/App toggle in the canvas toolbar
  (`src/ui/components/DiagramCanvas.tsx`), persisted as
  `kr:constituencyVariant` in the store.
- **Combined passages** (`src/io/passage.ts`, `prefixConstituency`): member
  source trees are merged under a synthetic discourse root only when every
  member shares the same `sourceId`; otherwise the combined doc carries
  none (drops honestly rather than mixing sources).
- **Editing**: the mode is presentation-only (not in `EDITABLE_MODES`), so
  KR/dependency role-conversion improvements cannot corrupt the captured
  tree; the tree also lives outside `syntax`, outside the patch diff.

## 3. Per-source status

| Source | `sourceConstituency` populated? | Constituency mode shows | Notes |
| --- | --- | --- | --- |
| SBLGNT Lowfat | **Yes** (`gnt-sblgnt.ts` passes `sourceId`) | source tree in Auto/Source | no `head` markers exist in this edition, so none are shown — nothing inferred is presented as source-given |
| Nestle1904 Lowfat | **Yes** (`gnt.ts` passes `sourceId`) | source tree in Auto/Source | explicit `head="true"` captured; display caveat in §4.2 |
| Hebrew WLC Lowfat | **No** — `macula-hebrew.ts` never captures | reconstructed (captioned) | deferred per plan phase 10 ("regression protection only"); the Hebrew trees are the same `<wg>` shape, so `captureSourceConstituency` would work — PR 9 decision |
| OpenText | **No** — wordgroup/clause layers are flattened to adjacency during conversion | reconstructed (captioned) | OpenText is not Lowfat; a source-backed view would render its own clause + wordgroup layers, not a forced `<wg>` shape — PR 8 audit |
| Custom / LLM / edited-beyond-source | No (nothing published to preserve) | reconstructed (captioned) | correct by design |

One subtlety in the reconstructed path: `phraseCat` prefers the
gold-standard Lowfat category stamped on the head token
(`morphology.extra.cat`, written by the converter's `stampCategory`) over
the POS estimate. That is source-*informed* reconstruction, labeled
reconstructed — acceptable, but worth remembering when reading its output.

## 4. Gaps against the acceptance criteria

### 4.1 `rule` and `articular` are captured but never rendered — FIXED (Stage 2)

`SourceConstituencyNode.rule` (e.g. `DetNP`, `PpNp2Np`, `QuanPp`,
`Conj2Pp`) and `.articular` now render as a small muted italic suffix
beside the category on source-tree nodes (`srcMeta` in `constituency.ts`),
verbatim and untranslated. Reconstructed nodes never carry them. Covered by
the "source metadata display" tests in `tests/source-constituency.test.ts`.

### 4.2 `head="true"` hidden when the node also has a `role` — FIXED (Stage 2)

The chip now combines both (`s · head`), so Nestle1904's explicit head
marking is never masked by a role. (No current Lowfat fixture actually
writes both attributes on one element — the fix is defensive — so the test
pins it with a synthetic tree.)

### 4.3 Display-only shell collapse — NARROWED (Stage 2)

`buildSourceTree` now collapses a single-child wrapper only when it carries
NOTHING (no class, role, rule, articular, or head): effectively only
Lowfat's bare `<wg role="cl">` outer shell. Any wrapper with source
content — including a classless single-child wrapper whose only content is
its `rule` — stays visible as a source node. Classless SBLGNT coordination
wrappers (Mark 1:19–20 `NpaNp`) are pinned by test to survive as source
nodes with their members intact.

### 4.4 No inferred-head display for SBLGNT

The app's conversion infers heads for SBLGNT (see the role-conversion
audit §2.1). The source tree neither contains nor displays those inferred
heads — which is honest. If PR 2+ ever chooses to show them as an aid, they
must be visually marked *inferred*, never presented like Nestle1904's
source-given `head`. Default recommendation: leave them out of the source
view entirely.

### 4.5 Coverage gaps

Hebrew (§3, PR 9) and OpenText (§3, PR 8). Both currently reconstruct with
an honest caption, so nothing lies today — they are missing features, not
honesty bugs.

### 4.6 Test gaps

`tests/source-constituency.test.ts` covers capture fidelity (Nestle1904
heads/rules/articular; SBLGNT no-heads), syntax-graph non-interference,
`combinePassage` behavior, mode selection, captions, and the reconstructed
fallback — all on Mark 5:25–34 fixtures. Missing (PR 2): SBLGNT Mark
1:19–20 classless-wrapper preservation; SBLGNT Col 1:16 `QuanPp` visible as
a raw rule; Nestle1904 Mark 5:26 rule/articular/head *display* (not just
capture); a pinned test that forced-Source-without-a-tree captions the
fallback.

## 5. Acceptance-criteria scorecard (today)

| Criterion | Status |
| --- | --- |
| SBLGNT source-backed passages render source constituency by default (Auto) | ✅ |
| Nestle1904 likewise, with explicit heads preserved | ✅ captured + shown, never masked (Stage 2, §4.2) |
| Source mode labels raw roles/rules/classes without translating | ✅ roles+classes+rules+articular (Stage 2, §4.1) |
| Reconstructed mode clearly labeled | ✅ caption |
| Never silently falls back Source→Reconstructed | ✅ caption names the fallback |
| Source child order preserved | ✅ (capture and draw; never re-sorted) |
| Discontinuous/non-adjacent token groups representable | ✅ leaves carry token ids; layout does not require adjacency |
| Classless SBLGNT `<wg>` wrappers shown as source nodes | ✅ behavior + pinned by test (Stage 2, §4.3/§4.6) |
| Source tree and app syntax graph separate layers | ✅ (separate schema key; mode is read-only) |
| Role-conversion improvements can't corrupt the source tree | ✅ structurally (capture is independent of conversion) — PR 3 adds a validator to keep it that way |
