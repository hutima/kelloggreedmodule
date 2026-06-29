import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useEditorStore } from '@/state';
import { buildOutline, glossDoc, type OutlineNode } from '@/domain/model';
import { nodeHighlightColors } from '@/ui/sermon/highlights';
import { useContestedAffectedNodes } from '@/ui/contested';
import { PhraseBlockEditor } from '@/ui/editor/block/PhraseBlockEditor';

/**
 * PHRASE / BLOCK view (HTML) — the clause + phrase hierarchy. In Explore/Sermon
 * it is a selectable, COLLAPSIBLE outline; in EDIT mode it becomes an interactive
 * workbench (PhraseBlockEditor) where rows can be promoted, demoted, moved under
 * one another, relabeled, and grouped. Both render the same hierarchy in Greek
 * order, hover-linked to the source strip.
 *
 * This is the on-screen renderer; SVG/PNG/print export still uses the geometric
 * `phrase-block` layout, so exports are unchanged.
 */
export function PhraseBlockView({
  hovered,
  onHover,
}: {
  hovered: Set<string>;
  onHover: (id?: string) => void;
}) {
  const doc = useEditorStore((s) => s.doc);
  const appMode = useEditorStore((s) => s.appMode);
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const highlights = useEditorStore((s) => s.sermon.highlights);
  const glossMode = useEditorStore((s) => s.glossMode);
  const hlByNode = useMemo(() => nodeHighlightColors(highlights), [highlights]);
  const contestedAffected = useContestedAffectedNodes();

  // English-gloss display swaps the shown words; structure (ids) is unchanged.
  const englishGloss = glossMode && appMode !== 'edit';
  const outline = useMemo(
    () => buildOutline(englishGloss ? glossDoc(doc) : doc),
    [doc, englishGloss],
  );
  const greek = doc.language === 'grc' && !englishGloss;
  const hebrew = doc.language === 'hbo' && !englishGloss;

  // Collapsed branch ids (controlled), reset when the document changes.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => setCollapsed(new Set()), [doc.id]);
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allIds = useMemo(() => {
    const ids: string[] = [];
    const collect = (n: OutlineNode) => {
      if (n.children.length) ids.push(n.id);
      n.children.forEach(collect);
    };
    if (outline) collect(outline);
    return ids;
  }, [outline]);

  // Edit mode swaps the read-only outline for the interactive workbench. (Placed
  // after all hooks so the hook order is stable across mode switches.)
  if (appMode === 'edit') {
    return <PhraseBlockEditor hovered={hovered} onHover={onHover} />;
  }

  if (!outline) return <p className="empty">No structure to outline yet.</p>;

  return (
    <div className={`ob-view${greek ? ' greek' : ''}${hebrew ? ' hebrew' : ''}`}>
      {allIds.length > 0 && (
        <div className="ob-toolbar">
          <button className="mini" onClick={() => setCollapsed(new Set())}>
            Expand all
          </button>
          <button className="mini" onClick={() => setCollapsed(new Set(allIds))}>
            Collapse all
          </button>
        </div>
      )}
      <ul className="ob-tree" role="tree">
        <OutlineRow
          node={outline}
          depth={0}
          collapsed={collapsed}
          toggle={toggle}
          selectedId={selection.nodeId}
          hovered={hovered}
          highlights={hlByNode}
          affected={contestedAffected}
          onSelect={(id) => select(id === selection.nodeId ? {} : { nodeId: id })}
          onHover={onHover}
        />
      </ul>
    </div>
  );
}

function OutlineRow({
  node,
  depth,
  collapsed,
  toggle,
  selectedId,
  hovered,
  highlights,
  affected,
  onSelect,
  onHover,
}: {
  node: OutlineNode;
  depth: number;
  collapsed: Set<string>;
  toggle: (id: string) => void;
  selectedId: string | undefined;
  hovered: Set<string>;
  highlights: Map<string, string>;
  affected: Set<string>;
  onSelect: (id: string) => void;
  onHover: (id?: string) => void;
}) {
  const hasKids = node.children.length > 0;
  const isCollapsed = collapsed.has(node.id);
  const selected = node.id === selectedId;
  const hot = hovered.has(node.id);
  const hl = highlights.get(node.id);
  const contested = affected.has(node.id);
  return (
    <li role="treeitem" aria-expanded={hasKids ? !isCollapsed : undefined}>
      <div
        className={`ob-row${selected ? ' selected' : ''}${hot ? ' hovered' : ''}${
          node.tentative ? ' tentative' : ''
        }${contested ? ' contested-affected' : ''}`}
        // Logical inline-start padding so the indent steps from the LEFT in
        // Greek/English and from the RIGHT in Hebrew (the tree is `direction: rtl`).
        style={{ paddingInlineStart: 6 + depth * 18 }}
        onClick={() => onSelect(node.id)}
        onMouseEnter={() => onHover(node.id)}
        onMouseLeave={() => onHover(undefined)}
      >
        {hasKids ? (
          <button
            className="ob-toggle"
            aria-label={isCollapsed ? 'Expand' : 'Collapse'}
            onClick={(e) => {
              e.stopPropagation();
              toggle(node.id);
            }}
          >
            {isCollapsed ? '▸' : '▾'}
          </button>
        ) : (
          <span className="ob-bullet" aria-hidden="true">
            ·
          </span>
        )}
        {node.label && <span className="ob-label">{node.label}</span>}
        {node.text ? (
          <span
            className={`ob-text${node.implied ? ' implied' : ''}${hl ? ' highlighted' : ''}`}
            style={hl ? { background: hl } : undefined}
          >
            {node.text}
          </span>
        ) : (
          node.implied && <span className="ob-text implied">(implied)</span>
        )}
      </div>
      {hasKids && !isCollapsed && (
        // The CSS var positions a vertical guide line under THIS row's toggle, so
        // every nesting level draws its own line and block membership is explicit.
        <ul role="group" style={{ ['--ob-depth']: depth } as CSSProperties}>
          {node.children.map((c) => (
            <OutlineRow
              key={c.id}
              node={c}
              depth={depth + 1}
              collapsed={collapsed}
              toggle={toggle}
              selectedId={selectedId}
              hovered={hovered}
              highlights={highlights}
              affected={affected}
              onSelect={onSelect}
              onHover={onHover}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
