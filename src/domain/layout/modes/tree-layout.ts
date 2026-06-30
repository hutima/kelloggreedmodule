/**
 * Shared TIDY-TREE placement for the two tree visualizations (Dependency Tree and
 * Constituency Tree). It computes, for every node, a position on TWO abstract axes:
 *
 *   • `depth`  — the level from the root (0 = root). The MAIN axis the tree grows
 *                along: downward when vertical, rightward when horizontal.
 *   • `cross`  — the centre position on the axis siblings spread along: horizontal
 *                when the tree is vertical, vertical when it is horizontal.
 *
 * Keeping the placement axis-agnostic lets a single algorithm drive both the old
 * top-to-bottom layout and the new left-to-right one — each mode only decides how
 * a `(depth, cross)` pair maps to `(x, y)` and where it draws the words/labels.
 *
 * The cross-spread is the classic two-pass "tidy tree": measure() reserves, for a
 * subtree, at least the cross-extent of its OWN node (not just its leaves) so a
 * wide internal node can't overlap a neighbour; place() lays each node's children
 * end-to-end along the cross axis and centres the parent over them.
 */

export type TreeOrientation = 'vertical' | 'horizontal';

export interface TidyResult<N> {
  /** Centre position along the cross axis, per node. */
  cross: Map<N, number>;
  /** Depth level (0 at the root), per node. */
  depth: Map<N, number>;
  /** Nodes grouped by depth level (index = depth), in placement order. */
  byDepth: N[][];
}

/**
 * @param root      the root node
 * @param children  a node's children, already ordered along the cross axis
 *                  (surface order). Cycles are guarded per-path, so a graph that
 *                  is "mostly a tree" is safe.
 * @param crossSize a node's OWN extent along the cross axis — its measured text
 *                  width when the tree is vertical, its stacked line-height when
 *                  horizontal. Must include any padding the mode wants between
 *                  siblings.
 */
export function tidyTree<N>(
  root: N,
  children: (n: N) => N[],
  crossSize: (n: N) => number,
): TidyResult<N> {
  const sub = new Map<N, number>(); // reserved cross-extent of each subtree
  const measure = (n: N, seen: Set<N>): number => {
    const kids = children(n).filter((k) => !seen.has(k));
    let w = crossSize(n);
    if (kids.length) {
      const next = new Set(seen).add(n);
      w = Math.max(w, kids.reduce((a, k) => a + measure(k, next), 0));
    }
    sub.set(n, w);
    return w;
  };

  const cross = new Map<N, number>();
  const depth = new Map<N, number>();
  const byDepth: N[][] = [];
  const record = (n: N, d: number) => {
    depth.set(n, d);
    (byDepth[d] ??= []).push(n);
  };
  const place = (n: N, start: number, d: number, seen: Set<N>): void => {
    record(n, d);
    const kids = children(n).filter((k) => !seen.has(k));
    if (!kids.length) {
      cross.set(n, start + (sub.get(n) ?? crossSize(n)) / 2);
      return;
    }
    const next = new Set(seen).add(n);
    const childTotal = kids.reduce((a, k) => a + (sub.get(k) ?? 0), 0);
    // Centre the children band within this node's (possibly wider) reservation.
    let c = start + ((sub.get(n) ?? childTotal) - childTotal) / 2;
    const centres: number[] = [];
    for (const k of kids) {
      place(k, c, d + 1, next);
      centres.push(cross.get(k)!);
      c += sub.get(k) ?? 0;
    }
    cross.set(n, (Math.min(...centres) + Math.max(...centres)) / 2);
  };

  measure(root, new Set([root]));
  place(root, 0, 0, new Set([root]));
  return { cross, depth, byDepth };
}

/**
 * For a HORIZONTAL tree, turn per-depth column widths into the centre-x of each
 * depth column. `gap(d)` is the clear space LEFT of column `d` (room for the edge
 * labels riding into that column); column 0 sits flush at x = 0.
 */
export function columnCentres(
  colWidth: number[],
  gap: (depth: number) => number,
): number[] {
  const centres: number[] = [];
  let left = 0;
  for (let d = 0; d < colWidth.length; d++) {
    left += gap(d);
    centres[d] = left + (colWidth[d] ?? 0) / 2;
    left += colWidth[d] ?? 0;
  }
  return centres;
}
