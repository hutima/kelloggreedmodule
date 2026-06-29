import { forwardRef, useMemo } from 'react';
import type { KrDocument, AlternateDiff } from '@/domain/schema';
import { buildOutline, getNode, nodeText, type OutlineNode } from '@/domain/model';
import { impactedNodeIds, movedNodes } from './diffHighlighting';

/**
 * Phrase/Block comparison frame as an OUTLINE (HTML), not the geometric diagram.
 * Block mode is about indentation = dependence, so a clean outline reads far
 * better here than the SVG overlay. The variant frame additionally shows each
 * moved row's OLD position as a crossed-out ghost under its former parent, so the
 * re-attachment is unmistakable: it left "there" and arrived "here".
 */
export const BlockOutlineFrame = forwardRef<
  HTMLDivElement,
  {
    baseDoc: KrDocument;
    variantDoc: KrDocument;
    role: 'base' | 'variant';
    diff: AlternateDiff | null;
    title: string;
    onScrollSync?: () => void;
  }
>(function BlockOutlineFrame({ baseDoc, variantDoc, role, diff, title, onScrollSync }, ref) {
  const doc = role === 'base' ? baseDoc : variantDoc;
  const outline = useMemo(() => buildOutline(doc), [doc]);
  const impacted = useMemo(() => impactedNodeIds(diff, doc), [diff, doc]);
  const moved = useMemo(() => movedNodes(baseDoc, variantDoc), [baseDoc, variantDoc]);
  const movedDeps = useMemo(() => new Set(moved.map((m) => m.dependentId)), [moved]);

  // Crossed-out ghosts to inject under each old parent (variant frame only).
  const ghosts = useMemo(() => {
    const map = new Map<string, { id: string; text: string }[]>();
    if (role !== 'variant') return map;
    for (const m of moved) {
      const node = getNode(baseDoc.syntax, m.dependentId);
      const text = node ? nodeText(baseDoc, node) || node.label || '' : '';
      const arr = map.get(m.oldHeadId) ?? [];
      arr.push({ id: m.dependentId, text });
      map.set(m.oldHeadId, arr);
    }
    return map;
  }, [role, moved, baseDoc]);

  const langClass = doc.language === 'grc' ? ' greek' : doc.language === 'hbo' ? ' hebrew' : '';

  const renderNode = (node: OutlineNode, depth: number) => {
    const isMoved = movedDeps.has(node.id);
    const cls = isMoved
      ? role === 'variant'
        ? 'bdf-moved-in'
        : 'bdf-moved-out'
      : impacted.has(node.id)
        ? 'bdf-hi'
        : '';
    const g = ghosts.get(node.id);
    return (
      <li key={node.id}>
        <div className={`bdf-row ${cls}`} style={{ paddingInlineStart: 8 + depth * 16 }}>
          {node.label && <span className="bdf-label">{node.label}</span>}
          <span className={`bdf-text${langClass}`}>
            {node.text || (node.implied ? '(implied)' : '')}
          </span>
          {isMoved && role === 'base' && <span className="bdf-tag out">moves</span>}
          {isMoved && role === 'variant' && <span className="bdf-tag in">moved here</span>}
        </div>
        {(node.children.length > 0 || g) && (
          <ul>
            {node.children.map((c) => renderNode(c, depth + 1))}
            {g?.map((gh) => (
              <li key={`ghost_${gh.id}`}>
                <div className="bdf-row bdf-ghost" style={{ paddingInlineStart: 8 + (depth + 1) * 16 }}>
                  <s className={`bdf-text${langClass}`}>{gh.text}</s>
                  <span className="bdf-tag ghost">was here</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="vc-frame">
      {title && <div className="vc-frame-head">{title}</div>}
      <div className="vc-frame-scroll bdf-scroll" ref={ref} onScroll={onScrollSync}>
        {outline ? (
          // Hebrew flows RTL: the tree direction + logical row padding make the
          // nesting indent (and the before/after ghosts) read correctly in OT.
          <ul className={`bdf-tree${langClass}`}>{renderNode(outline, 0)}</ul>
        ) : (
          <p className="empty">No structure to outline.</p>
        )}
      </div>
    </div>
  );
});
