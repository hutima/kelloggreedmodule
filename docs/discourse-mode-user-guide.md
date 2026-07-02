# Discourse Mode — User Guide

> Discourse mode is an interpretive outline and relationship layer over the
> passage. Source data may suggest markers and boundaries, but user-authored
> structure is **your** analysis.

Where the syntax visualizations (Kellogg-Reed, Phrase/Block, Dependency,
Constituency, Morphology) diagram **one sentence's grammar**, Discourse mode
analyzes the **argument, movement, rhetoric, and macro-structure** of a larger
passage — a section (Ephesians 5:3–33), a sweep of chapters (Romans 9–11), or
a whole book (Philemon). Its unit of analysis is a **discourse unit** (a block
of text), not an individual word.

## Getting in and out

1. Pick **Visualization → Discourse** (the mode selector in the diagram header).
2. The passage panel on the left switches to the **discourse range selector**.
3. Load a range. Your open syntax passage is untouched — switch back to any
   syntax view at any time and it is exactly where you left it; switch to
   Discourse again and your range is exactly where you left it. The two never
   overwrite each other.

## Loading a range

The range selector offers:

- **Source** — SBLGNT Lowfat (default), Nestle 1904 Lowfat, or OpenText.
- **Book**, **From** and **To** references (chapter : verse).
- **Whole book** and **Chapter…** shortcuts.
- **Unit size** — one unit per source *sentence* (recommended) or per *verse*.
- An **estimated unit count**, with a warning for very large ranges.

Whole short books load comfortably. Long books load too — chapters open
collapsed so the outline stays navigable; expand what you're working on.

## Reading the outline (Explore mode)

- Each **unit block** shows its verse reference, your label (if any), the
  Greek text, optional English glosses (Ελ / Eng / Both toggle), and
  **marker chips** for discourse-relevant particles (γάρ, οὖν, δέ, ἀλλά,
  ἵνα…). A chip's wording is always *"possible …"* — particles are clues the
  source offers, never conclusions it draws.
- **Relation arcs/brackets** in the left gutter connect related units;
  chiasm / parallel / inclusio pairs draw dashed. Arcs are never the only
  reading: select a unit and its relations are **listed textually** in the
  inspector below.
- Header toggles: Markers · Arcs · Labels · Full/Compact · Collapse/Expand
  all · **Outline** (a searchable minimap — type a word or a reference like
  `5:21` to jump) · **Hints** (the suggestions panel).

## Editing the analysis (Edit mode, desktop)

Switch the app to **Edit** mode. The discourse toolbar appears. Everything
below edits the *discourse layer only* — your syntax edits, sermon notes, and
the source data itself are never touched.

| Action | Toolbar | Keyboard |
| --- | --- | --- |
| Insert a break (split a unit) | **Split**, then click the word that starts the new unit | `Enter` on the selected unit |
| Merge into the previous unit | **Merge ←** | `Backspace` / `Delete` |
| Indent under the previous unit | **→ Indent** | `Tab` |
| Outdent one level | **← Outdent** | `Shift+Tab` |
| Move among siblings | **↑ / ↓** | — |
| Group units under a new parent | shift-click several units, **Group** | — |
| Ungroup a parent | **Ungroup** | — |
| Label a unit (A, B′, "Household code"…) | **Label…** or the inspector | — |
| Notes | inspector | — |
| Draw a relation | **Relate →**, click the target, pick the type | `Esc` cancels |
| Undo / redo | **↶ / ↷** | `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z` or `Ctrl/Cmd+Y` |
| Discard all discourse edits | **Reset edits…** (asks first) | — |

**Indentation is an interpretive outline, not a syntactic claim.** Nesting a
unit under another says *"I read this as subordinate in the argument"* —
nothing about the Greek clause structure changes.

**Relations** (ground, inference, result, purpose, condition, concession,
contrast, series, coordinate, elaboration, explanation, quotation, inclusio,
parallel, chiasm, custom) connect a *source* unit to a *target* unit. Select a
relation in the inspector to edit its type, label, confidence, notes, and the
marker chips you cite as evidence — or delete it.

**Chiasm / parallelism**: label units `A`, `B`, `C`, `C′`, `B′`, `A′` and pair
them with `chiasm` / `parallel` relations — the paired arcs draw dashed.

## Hints (suggestions panel)

The **Hints** panel lists *candidates* the source data supports: possible
grounds (γάρ), inferences (οὖν, διό, ἄρα), contrasts (ἀλλά, πλήν, οὐ…ἀλλά),
μέν/δέ pairs, command→γάρ patterns, possible break points at verse seams,
repeated lemmas/phrases, and inclusio candidates.

- Nothing in this panel changes your diagram by itself.
- **Accept** (Edit mode) turns a hint into a normal, editable relation or
  break — from that moment it is yours to reshape or delete.
- **Dismiss** hides a hint (it stays hidden when you reload).
- Ignoring a hint costs nothing. The machine may point at γάρ; it should not
  preach the sermon.

## Persistence & reset

Your discourse edits are stored as a compact diff against the generated base,
in their own storage (`kr:discourse:…`), keyed by source edition + book +
range + unit size, and guarded by a fingerprint so they are never misapplied
to different source data. They survive reloads. **Reset edits** removes only
the discourse diff for the loaded range — syntax edits, sermon prep, and
notes live in different keys and are unaffected.

## Export

**Export analysis** (top bar) offers:

- the full discourse **document as JSON** (schema-validated, re-importable);
- your **edits as a patch** (compact JSON diff);
- the **outline as Markdown** — labels, references, optional Greek text and
  glosses, notes, and relations;
- the **relation table** as Markdown or CSV.

SVG/PNG export belongs to the syntax visualizations (they render layout
geometry); the discourse outline is a text analysis and exports as text.

## What the source data does — and does not — provide

MACULA / SBLGNT Lowfat supplies tokens, references, sentence boundaries,
morphology, lemmas, glosses, and the particles the hints are built from. It
does **not** provide finalized discourse-arc relationships — no published
"correct" answer is being hidden from you. Every arc in your outline is either
something you drew or a hint you explicitly accepted.
