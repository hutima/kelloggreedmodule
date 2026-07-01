import { z } from 'zod';
import {
  KrDocumentSchema,
  PartOfSpeechSchema,
  SyntacticRoleSchema,
  ClauseTypeSchema,
  NodeKindSchema,
  type ClauseType,
  type KrDocument,
  type Language,
  type PartOfSpeech,
  type Relation,
  type SyntacticRole,
  type SyntaxNode,
  type Token,
} from '@/domain/schema';
import { createDocument, makeId, normalizeSyntax } from '@/domain/model';
import type { ImportResult } from './json';

/**
 * LLM-ASSISTED DIAGRAMMING.
 *
 * Free-typed text can be auto-tagged locally (the inference engine), but a large
 * language model produces a much fuller parse. This module bridges the two:
 *
 *   buildLlmPrompt(text, tokens, language)  → a self-contained prompt the user
 *      pastes into Claude / ChatGPT. It carries the sentence, the exact token ids
 *      to reference, the compact output format, and the allowed enum values.
 *   importLlmDiagram(text)                  → parse the model's reply (the compact
 *      format) and hydrate it into a validated KrDocument, ready to load and edit.
 *
 * The compact format keeps the model's job small (linguistic content only); the
 * mechanical bits (ids, timestamps, provenance, schema version) are filled here,
 * and the final document is validated against the real KrDocumentSchema.
 */

const POS = new Set<string>(PartOfSpeechSchema.options);
const ROLES = new Set<string>(SyntacticRoleSchema.options);
const CLAUSE_TYPES = new Set<string>(ClauseTypeSchema.options);
const KINDS = new Set<string>(NodeKindSchema.options);

export const LLM_DIAGRAM_KIND = 'scripture-diagrammer/diagram';

const GIVEN = { source: 'given', confidence: 'high' } as const;
const FROM_LLM = { source: 'manual', confidence: 'medium', reason: 'Imported from an LLM parse.' } as const;

// ── the compact format the LLM fills in (deliberately forgiving) ──────────────
const LlmTokenSchema = z.object({
  id: z.string(),
  surface: z.string(),
  pos: z.string().optional(),
  lemma: z.string().optional(),
  gloss: z.string().optional(),
});
const LlmNodeSchema = z.object({
  id: z.string(),
  kind: z.string().optional(),
  role: z.string().optional(),
  clauseType: z.string().optional(),
  tokens: z.array(z.string()).default([]),
  implied: z.boolean().optional(),
  label: z.string().optional(),
});
const LlmRelationSchema = z.object({
  id: z.string().optional(),
  type: z.string(),
  head: z.string(),
  dependent: z.string(),
  label: z.string().optional(),
});
export const LlmDiagramSchema = z.object({
  kind: z.string().optional(),
  version: z.number().optional(),
  language: z.string().optional(),
  text: z.string().optional(),
  title: z.string().optional(),
  tokens: z.array(LlmTokenSchema),
  nodes: z.array(LlmNodeSchema),
  relations: z.array(LlmRelationSchema).default([]),
  rootId: z.string().optional(),
});
export type LlmDiagram = z.infer<typeof LlmDiagramSchema>;

const list = (s: Set<string>) => [...s].join(' · ');

/**
 * Build the copy-paste prompt for an LLM. `tokens` are the already-tokenized
 * words of `text`; their ids are what the model must reference in `nodes`.
 */
export function buildLlmPrompt(text: string, tokens: Token[], language: Language): string {
  const langName = language === 'grc' ? 'Koine Greek' : language === 'hbo' ? 'Biblical Hebrew' : 'English';
  const tokenLines = tokens.map((t) => `  ${t.id} = ${JSON.stringify(t.surface)}`).join('\n');
  const tokenJson = tokens
    .map((t) => `    { "id": ${JSON.stringify(t.id)}, "surface": ${JSON.stringify(t.surface)}, "pos": "" }`)
    .join(',\n');
  return `You are a ${langName} grammarian helping build a Reed-Kellogg sentence diagram.

SENTENCE (${langName}):
${JSON.stringify(text)}

TOKENS — reference these EXACT ids in your answer:
${tokenLines}

TASK
Analyse the grammar and reply with ONE JSON object — no prose, no markdown code fences — in exactly this shape:

{
  "kind": "${LLM_DIAGRAM_KIND}",
  "version": 1,
  "language": "${language}",
  "text": ${JSON.stringify(text)},
  "tokens": [
${tokenJson}
  ],
  "nodes": [
    { "id": "c0", "kind": "clause", "clauseType": "independent" },
    { "id": "n_subj", "kind": "word", "role": "subject", "tokens": ["${tokens[0]?.id ?? 't0'}"] }
  ],
  "relations": [
    { "type": "subject", "head": "c0", "dependent": "n_subj" }
  ],
  "rootId": "c0"
}

RULES
- Fill a "pos" for every token (you may also add "lemma" and a short English "gloss").
- A relation reads "dependent functions as <type> of head"; "head" and "dependent" are NODE ids.
- EVERY node must OWN at least one token in "tokens" — the ONLY exception is an implied/elided element ("tokens": [], "implied": true, "label": "(he)"). NEVER create an empty grouping node (a node with no tokens that only holds other nodes) — empty wrappers are dropped and their contents lose their role.
- COORDINATION ("X and Y" — compound subjects, objects, verbs, or clauses): do NOT wrap the parts in a parent node. Make the FIRST part the head that carries the role (e.g. "subject"); attach each other part to that head with a "conjunct" relation and each conjunction word with a "coordinator" relation.
- A VERB PHRASE (auxiliary + main verb, e.g. "have lighted"): make ONE "predicate" node and list BOTH verb token ids in its "tokens". Do not invent roles like "auxiliary" or "head".
- A PREPOSITIONAL PHRASE: the node for the PREPOSITION word (holding the preposition's token) governs its object via "prepositionObject" and attaches to what it modifies via "prepositionalPhrase" or "adverbial". Do not make a separate empty phrase node for it.
- Attach articles/adjectives to their noun with a "determiner"/"adjectival" relation.
- "rootId" is the main clause. For two coordinated main clauses, make the first the root and attach the second with "conjunct" (and the conjunction with "coordinator").
- Use ONLY the values listed below for "pos", node "kind", relation type/role, and "clauseType".

EXAMPLE — a compound subject "Dogs and cats sleep" (note: the FIRST conjunct carries "subject"; no wrapper node):
  nodes:  { "id":"s1","kind":"word","role":"subject","tokens":["dogs"] }, { "id":"cc","kind":"word","role":"coordinator","tokens":["and"] }, { "id":"s2","kind":"word","role":"conjunct","tokens":["cats"] }, { "id":"v","kind":"word","role":"predicate","tokens":["sleep"] }
  relations:  { "type":"subject","head":"c0","dependent":"s1" }, { "type":"conjunct","head":"s1","dependent":"s2" }, { "type":"coordinator","head":"s1","dependent":"cc" }, { "type":"predicate","head":"c0","dependent":"v" }

ALLOWED VALUES
- pos: ${list(POS)}
- node kind: ${list(KINDS)}
- relation type / role: ${list(ROLES)}
- clauseType: ${list(CLAUSE_TYPES)}

Reply with only the JSON object.`;
}

// ── importing the model's reply ───────────────────────────────────────────────
function relax(text: string): string {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/^\s*```(?:json)?\s*\n?/i, '')
    .replace(/\n?\s*```\s*$/i, '')
    .replace(/[“”„‟″‶]/g, '"')
    .replace(/[‘’‚‛′‵]/g, "'")
    .trim();
}

const asPos = (p?: string): PartOfSpeech | undefined =>
  p ? ((POS.has(p) ? p : 'unknown') as PartOfSpeech) : undefined;
const asRole = (r?: string): SyntacticRole | undefined =>
  r ? ((ROLES.has(r) ? r : 'unknown') as SyntacticRole) : undefined;
const asClause = (c?: string): ClauseType | undefined =>
  c ? ((CLAUSE_TYPES.has(c) ? c : 'unknown') as ClauseType) : undefined;
const asKind = (k?: string): SyntaxNode['kind'] => (k && KINDS.has(k) ? (k as SyntaxNode['kind']) : 'word');

/**
 * Parse an LLM reply in the compact diagram format and hydrate it into a fully
 * validated KrDocument. Tolerant of code fences / smart quotes and of unknown
 * enum values (coerced to `unknown`), but rejects structural breakage (a relation
 * pointing at a missing node, or no root clause) with a readable message.
 */
export function importLlmDiagram(text: string, opts: { title?: string } = {}): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    try {
      raw = JSON.parse(relax(text));
    } catch (e) {
      return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
    }
  }
  const parsed = LlmDiagramSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '),
    };
  }
  const d = parsed.data;
  const language: Language = (['en', 'grc', 'hbo'] as const).includes(d.language as Language)
    ? (d.language as Language)
    : 'en';

  const tokens: Token[] = d.tokens.map((t, i) => ({
    id: t.id,
    index: i,
    surface: t.surface,
    language,
    ...(asPos(t.pos) ? { pos: asPos(t.pos) } : {}),
    ...(t.lemma ? { lemma: t.lemma } : {}),
    ...(t.gloss ? { gloss: t.gloss } : {}),
    provenance: GIVEN,
  }));
  const tokenIds = new Set(tokens.map((t) => t.id));

  const nodes: SyntaxNode[] = d.nodes.map((n) => ({
    id: n.id,
    kind: asKind(n.kind ?? (n.clauseType ? 'clause' : n.tokens.length ? 'word' : undefined)),
    ...(asRole(n.role) ? { role: asRole(n.role) } : {}),
    ...(asClause(n.clauseType) ? { clauseType: asClause(n.clauseType) } : {}),
    tokenIds: n.tokens.filter((id) => tokenIds.has(id)),
    ...(n.implied ? { implied: true } : {}),
    ...(n.label ? { label: n.label } : {}),
    provenance: FROM_LLM,
  }));
  const nodeIds = new Set(nodes.map((n) => n.id));
  if (!nodes.length) return { ok: false, error: 'No nodes in the imported diagram.' };

  const relations: Relation[] = [];
  for (const r of d.relations) {
    if (!nodeIds.has(r.head) || !nodeIds.has(r.dependent)) {
      return { ok: false, error: `Relation references an unknown node: ${r.head} → ${r.dependent}.` };
    }
    relations.push({
      id: r.id ?? makeId('rel'),
      type: asRole(r.type) ?? 'unknown',
      headId: r.head,
      dependentId: r.dependent,
      ...(r.label ? { label: r.label } : {}),
      provenance: FROM_LLM,
    });
  }

  const rootId =
    d.rootId && nodeIds.has(d.rootId) ? d.rootId : nodes.find((n) => n.kind === 'clause')?.id;
  if (!rootId) return { ok: false, error: 'No root clause node (need a node with kind "clause").' };

  const title = opts.title ?? d.title ?? titleFromText(d.text ?? tokens.map((t) => t.surface).join(' '));
  const base = createDocument({ language, title, text: d.text ?? tokens.map((t) => t.surface).join(' ') });
  // Normalize so an over-specified reply (a phrase node plus its child words both
  // carrying the same tokens, or a node hung under two heads) never draws a word
  // twice.
  const doc = normalizeSyntax({ ...base, tokens, syntax: { rootId, nodes, relations } } as KrDocument);

  const result = KrDocumentSchema.safeParse(doc);
  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '),
    };
  }
  return { ok: true, document: result.data };
}

/** A short title from the opening words of the sentence. */
export function titleFromText(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'New diagram';
  const words = trimmed.split(' ').slice(0, 6).join(' ');
  return words.length < trimmed.length ? `${words}…` : words;
}
