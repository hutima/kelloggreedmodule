import { useMemo, useState } from 'react';
import { useDiscourseStore } from '@/state';
import type { DiscourseDocument } from '@/domain/schema';
import { formatRange, outlineOrder, parseRef, refInRange } from '@/domain/discourse';

/**
 * OUTLINE / MINIMAP sidebar — a compact navigable table of contents for the
 * loaded range: every unit as one line (label + refs), indented by depth,
 * with search-within-range and jump-to-ref. Clicking a line selects the unit
 * and scrolls its block into view.
 */
export function DiscourseOutlineNav({ doc }: { doc: DiscourseDocument }) {
  const selection = useDiscourseStore((s) => s.selection);
  const select = useDiscourseStore((s) => s.select);
  const setUnitCollapsed = useDiscourseStore((s) => s.setUnitCollapsed);
  const [query, setQuery] = useState('');

  const units = useMemo(() => outlineOrder(doc), [doc]);
  const tokenText = useMemo(() => {
    const tokens = new Map(doc.tokens.map((t) => [t.id, t]));
    return new Map(
      doc.units.map((u) => [
        u.id,
        u.tokenIds
          .map((tid) => {
            const t = tokens.get(tid);
            return `${t?.surface ?? ''} ${t?.lemma ?? ''} ${t?.gloss ?? ''}`;
          })
          .join(' ')
          .toLowerCase(),
      ]),
    );
  }, [doc]);

  // A query that PARSES as a ref ("5:21") jumps by reference; anything else
  // searches unit labels, notes, source text, lemmas, and glosses.
  const q = query.trim().toLowerCase();
  const qRef = parseRef(q) ? q : null;
  const matches = useMemo(() => {
    if (!q) return null;
    const out = new Set<string>();
    for (const u of units) {
      if (qRef) {
        if (u.refStart && refInRange(qRef, u.refStart, u.refEnd || u.refStart)) out.add(u.id);
        continue;
      }
      const hay = `${u.label ?? ''} ${u.notes ?? ''} ${formatRange(u.refStart, u.refEnd)} ${tokenText.get(u.id) ?? ''}`.toLowerCase();
      if (hay.normalize('NFC').includes(q.normalize('NFC'))) out.add(u.id);
    }
    return out;
  }, [q, qRef, units, tokenText]);

  const shown = matches ? units.filter((u) => matches.has(u.id)) : units;

  const jumpTo = (unitId: string) => {
    // Expand any collapsed ancestor so the block can actually be seen.
    const byId = new Map(doc.units.map((u) => [u.id, u]));
    let cur = byId.get(unitId)?.parentId;
    let guard = 0;
    while (cur && guard++ <= doc.units.length) {
      const parent = byId.get(cur);
      if (parent?.collapsed) setUnitCollapsed(parent.id, false);
      cur = parent?.parentId;
    }
    select({ unitId });
    // The block registers a data attribute; scroll it into view after the
    // expansion re-render settles.
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-unit-id="${unitId}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  };

  return (
    <nav className="discourse-outline" aria-label="Range outline">
      <input
        className="discourse-outline-search"
        type="search"
        placeholder="Search or jump to ref (5:21)…"
        value={query}
        aria-label="Search within the loaded range"
        onChange={(e) => setQuery(e.target.value)}
      />
      {matches && (
        <p className="discourse-note" style={{ margin: '2px 0' }}>
          {shown.length} match{shown.length === 1 ? '' : 'es'}
        </p>
      )}
      <ul className="discourse-outline-list">
        {shown.map((u) => (
          <li key={u.id}>
            <button
              className={`discourse-outline-item${selection.unitId === u.id ? ' selected' : ''}`}
              style={{ paddingLeft: 6 + u.depth * 12 }}
              title={u.notes || undefined}
              onClick={() => jumpTo(u.id)}
            >
              <span className="discourse-outline-ref">{formatRange(u.refStart, u.refEnd)}</span>
              <span className="discourse-outline-label">
                {u.label || (u.tokenIds.length ? '' : u.kind)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
