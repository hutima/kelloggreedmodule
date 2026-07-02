import type { DiscourseDocument, DiscoursePatch, DiscourseUnit } from '@/domain/schema';
import { formatRange } from './refs';
import { outlineOrder } from './mutations';
import { relationTypeLabel } from './layout';

/**
 * DISCOURSE EXPORTS — pure serializers. JSON round-trips through the Zod
 * schema; the Markdown outline is the shareable, human-readable form of the
 * analysis; the relation table travels as Markdown or CSV. (SVG/PNG diagram
 * export belongs to the syntax visualizations' geometry pipeline; the
 * discourse view is HTML and exports these text forms instead.)
 */

/** Pretty JSON of the (live, edited) discourse document. */
export function discourseDocumentJson(doc: DiscourseDocument): string {
  return JSON.stringify(doc, null, 2);
}

/** Pretty JSON of a discourse patch (the compact user-edit diff). */
export function discoursePatchJson(patch: DiscoursePatch): string {
  return JSON.stringify(patch, null, 2);
}

/** Short book abbreviation for refs in the outline ("Ephesians" → "Eph",
 *  "1 Corinthians" → "1 Cor"). */
function bookAbbr(book: string): string {
  const m = /^([1-3]\s)?([A-Za-z]+)/.exec(book.trim());
  if (!m) return book;
  const stem = m[2]!.length > 4 ? m[2]!.slice(0, 3) : m[2]!;
  return `${m[1] ?? ''}${stem}`;
}

function unitHeading(doc: DiscourseDocument, unit: DiscourseUnit): string {
  const abbr = bookAbbr(doc.range.book);
  const refs = unit.refStart ? `${abbr} ${formatRange(unit.refStart, unit.refEnd)}` : '';
  const label = unit.label ?? (unit.tokenIds.length ? '' : `(${unit.kind})`);
  if (label && refs) return `${label} — ${refs}`;
  return label || refs || unit.kind;
}

/**
 * The analysis as a Markdown outline: units in outline order, indented by
 * depth, each with its label + refs, optional source text / glosses, notes,
 * and its outgoing relations.
 *
 *   # Ephesians 5:3–33
 *   - **A — Eph 5:3–4**
 *     - Πορνεία δὲ καὶ …
 *     - Note: …
 *     - Relation: chiasm → A′ (Eph 5:31–33)
 */
export function discourseOutlineMarkdown(
  doc: DiscourseDocument,
  opts: { includeText?: boolean; includeGlosses?: boolean; includeNotes?: boolean } = {},
): string {
  const includeText = opts.includeText ?? true;
  const includeGlosses = opts.includeGlosses ?? false;
  const includeNotes = opts.includeNotes ?? true;
  const tokens = new Map(doc.tokens.map((t) => [t.id, t]));
  const byId = new Map(doc.units.map((u) => [u.id, u]));

  const lines: string[] = [`# ${doc.title}`, ''];
  for (const unit of outlineOrder(doc)) {
    const pad = '  '.repeat(unit.depth);
    lines.push(`${pad}- **${unitHeading(doc, unit)}**`);
    if (includeText && unit.tokenIds.length) {
      const text = unit.tokenIds.map((tid) => tokens.get(tid)?.surface ?? '').join(' ').trim();
      if (text) lines.push(`${pad}  - ${text}`);
    }
    if (includeGlosses && unit.tokenIds.length) {
      const gloss = unit.tokenIds
        .map((tid) => tokens.get(tid)?.gloss ?? '')
        .filter(Boolean)
        .join(' ')
        .trim();
      if (gloss) lines.push(`${pad}  - _${gloss}_`);
    }
    if (includeNotes && unit.notes) lines.push(`${pad}  - Note: ${unit.notes}`);
    for (const r of doc.relations.filter((x) => x.sourceUnitId === unit.id)) {
      const target = byId.get(r.targetUnitId);
      const targetName = target ? unitHeading(doc, target) : r.targetUnitId;
      const label = r.label ? ` (${r.label})` : '';
      lines.push(`${pad}  - Relation: ${relationTypeLabel(r.type)} → ${targetName}${label}`);
    }
  }
  lines.push('', `_Exported from Scripture Diagrammer — user-authored discourse analysis over ${doc.sourceId}._`);
  return lines.join('\n');
}

/** The relations as a Markdown table. */
export function discourseRelationsMarkdown(doc: DiscourseDocument): string {
  const byId = new Map(doc.units.map((u) => [u.id, u]));
  const name = (id: string) => {
    const u = byId.get(id);
    return u ? unitHeading(doc, u) : id;
  };
  const rows = doc.relations.map((r) =>
    [
      relationTypeLabel(r.type),
      name(r.sourceUnitId),
      name(r.targetUnitId),
      r.label ?? '',
      r.confidence ?? '',
      r.notes ?? '',
    ]
      .map((c) => c.replace(/\|/g, '\\|'))
      .join(' | '),
  );
  return [
    `# Relations — ${doc.title}`,
    '',
    'Type | Source | Target | Label | Confidence | Notes',
    '--- | --- | --- | --- | --- | ---',
    ...rows,
  ].join('\n');
}

/** The relations as CSV (RFC-4180 quoting). */
export function discourseRelationsCsv(doc: DiscourseDocument): string {
  const byId = new Map(doc.units.map((u) => [u.id, u]));
  const name = (id: string) => {
    const u = byId.get(id);
    return u ? unitHeading(doc, u) : id;
  };
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = doc.relations.map((r) =>
    [
      r.id,
      r.type,
      name(r.sourceUnitId),
      name(r.targetUnitId),
      r.label ?? '',
      r.confidence ?? '',
      r.provenance.source,
      r.notes ?? '',
    ]
      .map(q)
      .join(','),
  );
  return ['id,type,source,target,label,confidence,provenance,notes', ...rows].join('\n');
}
