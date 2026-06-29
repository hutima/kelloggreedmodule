import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '@/state';
import { layoutForMode, DIAGRAM_MODES } from '@/domain/layout';
import { measureText, SMALL_FONT, BASE_FONT } from '@/domain/layout/measure';
import { dashFor, toneColor } from '@/domain/render';
import { describeFunction, getNode, childRelations, lookupGloss, glossDoc } from '@/domain/model';
import {
  loadParallelBook,
  alignParallel,
  bookForDoc,
  loadParallelOtBook,
  alignParallelHebrew,
  bookForOtDoc,
  type ParallelBook,
  type OtParallelBook,
  type ParallelView,
} from '@/io';
import type { KrDocument } from '@/domain/schema';
import { MIN_SCALE, clamp, minZoomScale, maxZoomScale, clampPan } from '@/ui/zoom';
import { PhraseBlockView } from './diagram/PhraseBlockView';
import { MorphologyView } from './diagram/MorphologyView';
import { nodeHighlightColors } from '@/ui/sermon/highlights';
import { EditModeToolbar } from '@/ui/editor/EditModeToolbar';
import { LinkPreviewOverlay } from '@/ui/editor/LinkPreviewOverlay';
import { DependencyEditOverlay } from '@/ui/editor/dependency/DependencyEditOverlay';
import {
  ContestedBadge,
  MobileContestedBar,
  SinglePreviewView,
  VariantComparisonView,
  useContestedAffectedNodes,
} from '@/ui/contested';
import { useViewport } from '@/ui/responsive';

const TENTATIVE = '#c2410c';
const INK = '#1f2933';

interface View {
  x: number;
  y: number;
  scale: number;
}

/**
 * Interactive SVG canvas. It renders exactly the primitives the layout engine
 * emits and adds selection, click-to-relink, and a freely pan/zoomable view: the
 * diagram sits in a white field that auto-fits on load, pans by dragging, and
 * zooms on the wheel / pinch. (Export uses the same layout, so paper matches.)
 */
export function DiagramCanvas() {
  const doc = useEditorStore((s) => s.doc);
  const appMode = useEditorStore((s) => s.appMode);
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const linking = useEditorStore((s) => s.linking);
  const relinkTo = useEditorStore((s) => s.relinkTo);
  const cancelRelink = useEditorStore((s) => s.cancelRelink);
  // Tier-aware editing: visual word→word linking, delete-on-tap, link preview.
  const editTier = useEditorStore((s) => s.editTier);
  const activeEditTool = useEditorStore((s) => s.activeEditTool);
  const pendingLinkStart = useEditorStore((s) => s.pendingLinkStart);
  const linkPreviewTarget = useEditorStore((s) => s.linkPreviewTarget);
  const startVisualLink = useEditorStore((s) => s.startVisualLink);
  const completeVisualLink = useEditorStore((s) => s.completeVisualLink);
  const cancelVisualLink = useEditorStore((s) => s.cancelVisualLink);
  const setLinkPreviewTarget = useEditorStore((s) => s.setLinkPreviewTarget);
  const removeRelation = useEditorStore((s) => s.removeRelation);
  const verticalScale = useEditorStore((s) => s.verticalScale);
  const setVerticalScale = useEditorStore((s) => s.setVerticalScale);
  const diagramMode = useEditorStore((s) => s.diagramMode);
  const setDiagramMode = useEditorStore((s) => s.setDiagramMode);
  const gntPassages = useEditorStore((s) => s.gntPassages);
  const gntIndex = useEditorStore((s) => s.gntIndex);
  const stepGnt = useEditorStore((s) => s.stepGnt);
  const highlights = useEditorStore((s) => s.sermon.highlights);
  // Contested-syntax / alternate-readings display state.
  const alternateDisplayMode = useEditorStore((s) => s.contested.alternateDisplayMode);
  const previewDoc = useEditorStore((s) => s.previewDoc);
  // Words touched by the open contested issue — marked in the base diagram so the
  // debated word stays visible even when the Base reading is selected.
  const contestedAffected = useContestedAffectedNodes();
  const viewport = useViewport();
  // Mobile NEVER renders two variant frames; side-by-side is desktop/tablet only.
  const sideBySide = alternateDisplayMode === 'side-by-side' && !!previewDoc && !viewport.isMobile;
  const singlePreview = alternateDisplayMode === 'single-preview' && !!previewDoc;
  const [collapsed, setCollapsed] = useState(false);
  // Which label element anchors the glossary popover (so it opens at the exact
  // tag tapped, even when several arcs share a label/colour).
  const [glossAnchorId, setGlossAnchorId] = useState<string | null>(null);
  // What is currently hovered — in the diagram, the Greek strip, or the English
  // strip — kept as the set of diagram nodes AND English words it touches, so all
  // three views light up in lock-step (a Greek word ↔ its English translation).
  const [hover, setHover] = useState<{ nodes: Set<string>; en: Set<string> }>(() => ({
    nodes: new Set(),
    en: new Set(),
  }));

  // Parallel English text (Berean Standard Bible), loaded per book on demand, and
  // which version the source strip shows. Offered for Greek (GNT) and Hebrew (OT).
  const [parallelBook, setParallelBook] = useState<ParallelBook | null>(null);
  const [otParallelBook, setOtParallelBook] = useState<OtParallelBook | null>(null);
  const [version, setVersion] = useState<'grc' | 'en'>('grc');
  // The source/reference strip collapses out of the way to give the diagram room,
  // and its height is draggable to rebalance text vs. diagram.
  const [srcCollapsed, setSrcCollapsed] = useState(false);
  const [srcHeight, setSrcHeight] = useState(132);

  const onSrcResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startH = srcHeight;
      const move = (ev: PointerEvent) => setSrcHeight(clamp(startH + (ev.clientY - startY), 40, 640));
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [srcHeight],
  );

  // English-gloss display: structure stays the Greek parse; only the shown words
  // change (Morphology stays in the source language — it's a form study).
  const glossMode = useEditorStore((s) => s.glossMode);
  const setGlossMode = useEditorStore((s) => s.setGlossMode);
  const layoutDoc = useMemo(
    () => (glossMode && diagramMode !== 'morphology' ? glossDoc(doc) : doc),
    [glossMode, diagramMode, doc],
  );
  const layout = useMemo(
    () => layoutForMode(diagramMode, layoutDoc, doc.layoutHints, { verticalScale }),
    [diagramMode, layoutDoc, doc.layoutHints, verticalScale],
  );

  // Text-heavy modes render as interactive HTML on screen (collapsible outline /
  // morphology grid) instead of the pan/zoom SVG; export still uses the geometry.
  const htmlMode = diagramMode === 'phrase-block' || diagramMode === 'morphology';

  // The running source text as interactive words: each maps to the syntax node it
  // belongs to, grouped by verse (a passage stacks several verses).
  const sourceItems = useMemo(() => buildSourceItems(doc), [doc]);

  // Sermon-prep highlights, as a nodeId → colour lookup, so a tagged word shows
  // its category colour in the diagram AND the running text (not just the panel).
  const hlByNode = useMemo(() => nodeHighlightColors(highlights), [highlights]);

  // Fetch the matching parallel book — Greek (GNT) or Hebrew (OT) — on open.
  useEffect(() => {
    setParallelBook(null);
    setOtParallelBook(null);
    let live = true;
    if (doc.language === 'grc') {
      const book = bookForDoc(doc);
      if (book) loadParallelBook(book).then((b) => live && setParallelBook(b));
    } else if (doc.language === 'hbo') {
      const book = bookForOtDoc(doc);
      if (book) loadParallelOtBook(book).then((b) => live && setOtParallelBook(b));
    }
    return () => {
      live = false;
    };
  }, [doc]);

  const parallel: ParallelView | null = useMemo(
    () =>
      parallelBook
        ? alignParallel(doc, parallelBook)
        : otParallelBook
          ? alignParallelHebrew(doc, otParallelBook)
          : null,
    [doc, parallelBook, otParallelBook],
  );
  const hasEnglish = (parallel?.verses.length ?? 0) > 0;
  // Fall back to Greek if English isn't available for the current passage.
  const showEnglish = version === 'en' && hasEnglish;

  // Hover helpers keep the diagram, Greek strip, and English strip in sync.
  const hoverDiagram = useCallback(
    (nodeId?: string) =>
      setHover(
        nodeId
          ? { nodes: new Set([nodeId]), en: new Set(parallel?.nodeToEn.get(nodeId) ?? []) }
          : { nodes: new Set(), en: new Set() },
      ),
    [parallel],
  );
  const hoverEnglish = useCallback(
    (key?: string) =>
      setHover(
        key
          ? { nodes: new Set(parallel?.enToNodes.get(key) ?? []), en: new Set([key]) }
          : { nodes: new Set(), en: new Set() },
      ),
    [parallel],
  );

  const viewportRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });

  // Current layout size, mirrored into a ref so the stable zoom callbacks below
  // can read fresh dimensions without being re-created (and re-binding the wheel
  // listener) on every layout change.
  const dimsRef = useRef({ w: layout.width, h: layout.height });
  dimsRef.current = { w: layout.width, h: layout.height };

  // ---- pan / zoom --------------------------------------------------------
  const PAD = 24;

  /** The smallest scale we allow: the scale at which the whole diagram just fits
   *  the viewport (never above 1, so a tiny diagram still rests at 100%). This is
   *  the *zoom-out lock* — on iOS Safari an over-shrunk SVG stops repainting and
   *  flashes white on gesture end, so the diagram must never shrink past fitting
   *  the screen. Floored at MIN_SCALE for pathologically large diagrams. */
  const minScale = useCallback(() => {
    const vp = viewportRef.current;
    const { w, h } = dimsRef.current;
    if (!vp) return MIN_SCALE;
    return minZoomScale(vp.clientWidth, vp.clientHeight, w, h, PAD);
  }, []);

  /** The largest scale we allow on THIS diagram: the zoom-IN lock. Zooming in
   *  rasterises the SVG at `layout × scale × devicePixelRatio`; past iOS Safari's
   *  layer budget the whole page flashes white. Cap the scale so the rendered
   *  size stays within {@link maxZoomScale}'s budget. Floored at the zoom-out lock
   *  so the range can never invert. */
  const maxScale = useCallback(() => {
    const { w, h } = dimsRef.current;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    return maxZoomScale(w, h, dpr, minScale());
  }, [minScale]);

  /** Keep the diagram from being panned (or pinch-flung) entirely off-screen:
   *  always leave a margin of it within the viewport. A fast pinch at minimum
   *  zoom otherwise flings the already-fitting diagram into the void, which reads
   *  as the same white screen. */
  const clampView = useCallback((x: number, y: number, scale: number) => {
    const vp = viewportRef.current;
    const { w, h } = dimsRef.current;
    if (!vp) return { x, y };
    return clampPan(x, y, scale, vp.clientWidth, vp.clientHeight, w, h);
  }, []);

  /** Fit the whole diagram into the viewport (centred horizontally, top-aligned
   *  so a tall passage starts at the top and you scroll down into it). */
  const fit = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp || layout.width <= 0) return;
    const w = vp.clientWidth - PAD * 2;
    const h = vp.clientHeight - PAD * 2;
    const scale = clamp(Math.min(w / layout.width, h / layout.height, 1.5), MIN_SCALE, maxScale());
    const x = Math.max(PAD, (vp.clientWidth - layout.width * scale) / 2);
    setView({ x, y: PAD, scale });
  }, [layout.width, layout.height, maxScale]);

  // Re-fit when a new document is opened or the viewport first sizes up.
  useLayoutEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(vp);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enforce both zoom locks across layout changes (mode switch, row spacing): if
  // the new minimum rises above the current scale, pull the view up so the SVG is
  // never left over-shrunk; if the new maximum drops below it (a taller diagram
  // shrinks the safe zoom-in budget), pull it down so the SVG is never left
  // over-rasterised. Both extremes are iOS white-screen conditions.
  useEffect(() => {
    const lo = minScale();
    const hi = maxScale();
    setView((v) => (v.scale < lo ? { ...v, scale: lo } : v.scale > hi ? { ...v, scale: hi } : v));
  }, [layout.width, layout.height, minScale, maxScale]);

  const zoomBy = useCallback((factor: number, cx?: number, cy?: number) => {
    // A degenerate pinch (two touches coinciding → 0/0) can hand us a NaN/∞
    // factor; ignore it so `scale` never becomes NaN and the SVG never gets
    // width="NaN" (which renders as a blank white diagram).
    if (!Number.isFinite(factor) || factor <= 0) return;
    setView((v) => {
      // Lower bound is the fit-to-screen scale (the zoom-out lock), not a fixed
      // tiny floor — this is what stops the iOS white-screen on pinch-out.
      const scale = clamp(v.scale * factor, minScale(), maxScale());
      if (!Number.isFinite(scale)) return v;
      const k = scale / v.scale;
      const px = cx ?? (viewportRef.current?.clientWidth ?? 0) / 2;
      const py = cy ?? (viewportRef.current?.clientHeight ?? 0) / 2;
      return { scale, ...clampView(px - (px - v.x) * k, py - (py - v.y) * k, scale) };
    });
  }, [minScale, maxScale, clampView]);

  // Wheel zoom toward the cursor. Attached non-passively so preventDefault stops
  // the page (or trackpad) from scrolling underneath the gesture.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  // Pointer gestures: one pointer pans, two pinch-zoom. A small move threshold
  // distinguishes a pan from a tap so word selection still works.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  const moved = useRef(false);

  const centroid = () => {
    const pts = [...pointers.current.values()];
    return {
      cx: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      cy: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // NB: do NOT setPointerCapture — capturing retargets the subsequent click to
    // the viewport, which would swallow word/line selection. Panning within the
    // viewport works fine without it.
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
    pinch.current = null;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      const { cx, cy } = centroid();
      const rect = viewportRef.current!.getBoundingClientRect();
      // Only zoom once we have a valid previous separation (guards 0/0 → NaN when
      // two touches momentarily coincide).
      if (pinch.current && pinch.current.dist > 0 && dist > 0) {
        // Read the previous pinch frame into LOCALS before calling setView. The
        // updater below runs deferred (React batches it), and onPointerUp nulls
        // `pinch.current` the instant a finger lifts — so dereferencing the ref
        // lazily inside the updater throws `null.cx` mid-render, which (pre-error
        // boundary) unmounted the whole app and was THE pinch white-screen.
        const { dist: prevDist, cx: prevCx, cy: prevCy } = pinch.current;
        zoomBy(dist / prevDist, cx - rect.left, cy - rect.top);
        setView((v) => ({
          ...v,
          ...clampView(v.x + (cx - prevCx), v.y + (cy - prevCy), v.scale),
        }));
      }
      pinch.current = { dist, cx, cy };
      moved.current = true;
      return;
    }
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) moved.current = true;
    setView((v) => ({ ...v, ...clampView(v.x + dx, v.y + dy, v.scale) }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  // ---- selection / relink ------------------------------------------------
  useEffect(() => {
    if (!linking) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancelRelink();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [linking, cancelRelink]);

  // Escape closes the tap-a-word / tap-a-label detail popover.
  useEffect(() => {
    if (linking || (!selection.nodeId && !selection.glossKey)) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && select({});
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [linking, selection.nodeId, selection.glossKey, select]);

  const editingBasic = appMode === 'edit' && editTier === 'basic';
  const linkTool = editingBasic && activeEditTool === 'link';
  const deleteTool = editingBasic && activeEditTool === 'delete';

  const onNode = (nodeId?: string) => {
    if (moved.current) return; // a drag, not a tap
    if (!nodeId) {
      if (linking) cancelRelink();
      else if (pendingLinkStart) cancelVisualLink();
      else select({});
      return;
    }
    if (linking) {
      relinkTo(nodeId);
      return;
    }
    if (linkTool) {
      // Tap the dependent, then tap its head → quick relationship picker.
      if (!pendingLinkStart) startVisualLink(nodeId);
      else if (nodeId === pendingLinkStart) cancelVisualLink();
      else completeVisualLink(nodeId);
      return;
    }
    // In Explore / Sermon, tapping the already-selected word deselects it.
    if (appMode !== 'edit') select(nodeId === selection.nodeId ? {} : { nodeId });
    else select({ nodeId });
  };

  /** Hover a word: light up the views, and preview the link arc when pending. */
  const onNodeHover = (nodeId?: string) => {
    hoverDiagram(nodeId);
    if (pendingLinkStart)
      setLinkPreviewTarget(nodeId && nodeId !== pendingLinkStart ? nodeId : null);
  };

  /** A click on a relation's hit area: delete it (delete tool) or select it. */
  const onRelationHit = (relationId: string) => {
    if (moved.current || linking) return;
    if (deleteTool) {
      removeRelation(relationId);
      select({});
    } else {
      select({ relationId });
    }
  };

  /** Layout-space anchor (x,y) for a node, preferring a horizontal text label. */
  const anchorFor = (nodeId: string): { x: number; y: number } | null => {
    const texts = layout.elements.filter(
      (e) => e.kind === 'text' && e.nodeId === nodeId,
    ) as { x: number; y: number; rotate?: number }[];
    const a = texts.find((e) => !e.rotate) ?? texts[0];
    return a ? { x: a.x, y: a.y } : null;
  };

  const linkPreview =
    pendingLinkStart && anchorFor(pendingLinkStart)
      ? {
          from: anchorFor(pendingLinkStart)!,
          to: linkPreviewTarget ? anchorFor(linkPreviewTarget) : null,
        }
      : null;

  // Endpoint markers for the currently-selected relation (Basic tier), so a
  // selected line shows where its head and dependent attach.
  const selectedRelEndpoints =
    editingBasic && selection.relationId
      ? (layout.elements.filter(
          (e) => (e.kind === 'line' || e.kind === 'curve') && e.relationId === selection.relationId,
        ) as { x1: number; y1: number; x2: number; y2: number }[])
      : [];

  const isSelected = (nodeId?: string, relationId?: string) =>
    (nodeId && nodeId === selection.nodeId) || (relationId && relationId === selection.relationId);

  // ---- reveal popover (clamped into the viewport) ------------------------
  const reveal = useMemo(() => {
    // In Edit mode the contextual action sheet stands in for the reader popover.
    if (linking || appMode === 'edit' || !selection.nodeId) return null;
    // Prefer a horizontal text anchor, but fall back to a rotated one so small
    // diagonal words (articles, πᾶς, prepositions) still get a detail popover.
    const texts = layout.elements.filter(
      (e) => e.kind === 'text' && e.nodeId === selection.nodeId,
    ) as { x: number; y: number; rotate?: number }[];
    const anchor = texts.find((e) => !e.rotate) ?? texts[0];
    const summary = describeFunction(doc, selection.nodeId);
    if (!anchor || !summary) return null;
    return { anchor, summary };
  }, [doc, layout, selection.nodeId, linking, appMode]);

  const revealPos = useMemo(() => {
    if (!reveal) return null;
    const vp = viewportRef.current;
    const W = vp?.clientWidth ?? 600;
    const H = vp?.clientHeight ?? 400;
    const POP_W = 240;
    const POP_H = 130;
    const px = view.x + reveal.anchor.x * view.scale;
    const py = view.y + reveal.anchor.y * view.scale + 14; // just below the word
    return {
      left: clamp(px - POP_W / 2, 8, Math.max(8, W - POP_W - 8)),
      top: clamp(py, 8, Math.max(8, H - POP_H - 8)),
    };
  }, [reveal, view]);

  // ---- detail card for the HTML modes (Phrase/Block, Morphology) ----------
  // The geometric reveal popover only exists in the SVG modes; in the HTML modes
  // a tapped word (incl. a highlighted one or one tapped in the source strip)
  // otherwise shows nothing. Render a fixed detail card for it in Explore.
  const htmlReveal = useMemo(() => {
    if (!htmlMode || appMode !== 'explore' || linking || !selection.nodeId) return null;
    return describeFunction(doc, selection.nodeId);
  }, [htmlMode, appMode, linking, selection.nodeId, doc]);

  // ---- glossary popover (tap a label, e.g. "agr") ------------------------
  const gloss = useMemo(() => {
    if (linking || !selection.glossKey) return null;
    const entry = lookupGloss(selection.glossKey);
    if (!entry) return null;
    // Anchor at the exact tapped label when known, else the first matching one.
    const labels = layout.elements.filter(
      (e) => e.kind === 'text' && e.glossKey === selection.glossKey,
    ) as { id: string; x: number; y: number }[];
    const anchor = labels.find((e) => e.id === glossAnchorId) ?? labels[0];
    if (!anchor) return null;
    return { anchor, entry };
  }, [layout, selection.glossKey, glossAnchorId, linking]);

  const glossPos = useMemo(() => {
    if (!gloss) return null;
    const vp = viewportRef.current;
    const W = vp?.clientWidth ?? 600;
    const H = vp?.clientHeight ?? 400;
    const POP_W = 250;
    const POP_H = 130;
    const px = view.x + gloss.anchor.x * view.scale;
    const py = view.y + gloss.anchor.y * view.scale + 14;
    return {
      left: clamp(px - POP_W / 2, 8, Math.max(8, W - POP_W - 8)),
      top: clamp(py, 8, Math.max(8, H - POP_H - 8)),
    };
  }, [gloss, view]);

  return (
    <div className={`canvas${collapsed ? ' collapsed' : ''}${appMode === 'edit' ? ' editing' : ''}`}>
      <div className="panel-head">
        <span className="panel-head-title">Diagram</span>
        <div className="canvas-tools">
          <label className="mode-select" title={DIAGRAM_MODES.find((m) => m.id === diagramMode)?.description}>
            <span className="sr-only">Diagram mode</span>
            <select
              aria-label="Diagram mode"
              value={diagramMode}
              onChange={(e) => setDiagramMode(e.target.value as typeof diagramMode)}
            >
              {DIAGRAM_MODES.map((m) => (
                <option key={m.id} value={m.id} title={m.description}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          {doc.language !== 'en' && diagramMode !== 'morphology' && (
            <div className="lang-toggle" role="group" aria-label="Diagram words">
              <button
                className={!glossMode ? 'active' : ''}
                title="Show the Greek / Hebrew words"
                onClick={() => setGlossMode(false)}
              >
                {doc.language === 'hbo' ? 'עב' : 'Ελ'}
              </button>
              <button
                className={glossMode ? 'active' : ''}
                title="Show English glosses (structure stays the same)"
                onClick={() => setGlossMode(true)}
              >
                Eng
              </button>
            </div>
          )}
          {!htmlMode && (
            <>
              <div className="canvas-zoom" title="Row spacing">
                <button title="Tighter rows" onClick={() => setVerticalScale(Math.round((verticalScale - 0.15) * 100) / 100)}>↕−</button>
                <button title="Reset rows" onClick={() => setVerticalScale(1)}>{Math.round(verticalScale * 100)}%</button>
                <button title="Looser rows" onClick={() => setVerticalScale(Math.round((verticalScale + 0.15) * 100) / 100)}>↕+</button>
              </div>
              <div className="canvas-zoom">
                <button title="Zoom out" onClick={() => zoomBy(1 / 1.2)}>−</button>
                <button title="Fit to view" onClick={fit}>⤢</button>
                <button title="Zoom in" onClick={() => zoomBy(1.2)}>+</button>
              </div>
            </>
          )}
        </div>
        {!viewport.isMobile && <ContestedBadge />}
        <button
          className="collapse-btn"
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand diagram' : 'Collapse diagram'}
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      </div>
      {viewport.isMobile && <MobileContestedBar />}
      {appMode === 'edit' && <EditModeToolbar />}
      {appMode === 'edit' && <DependencyEditOverlay />}
      {linking && (
        <div className="relink-banner">
          Click the word to use as the new <strong>{linking.end}</strong>.
          <button className="mini" onClick={cancelRelink}>Cancel (Esc)</button>
        </div>
      )}
      {(sourceItems.length > 0 || hasEnglish) && (
        <div
          className={`source-wrap${srcCollapsed ? ' collapsed' : ''}`}
          style={srcCollapsed ? undefined : { height: srcHeight }}
        >
          <div className="source-bar">
            {hasEnglish ? (
              <div className="version-picker" role="group" aria-label="Source language">
                <button
                  className={!showEnglish ? 'active' : ''}
                  onClick={() => setVersion('grc')}
                >
                  {doc.language === 'hbo' ? 'Hebrew' : 'Greek'}
                </button>
                <button
                  className={showEnglish ? 'active' : ''}
                  onClick={() => setVersion('en')}
                >
                  English
                </button>
              </div>
            ) : (
              <span className="source-label">Source text</span>
            )}
            {gntIndex >= 0 && gntPassages.length > 0 && (
              <div className="sentence-nav" role="group" aria-label="Navigate sentences">
                <button
                  title="Previous sentence"
                  aria-label="Previous sentence"
                  disabled={gntIndex <= 0}
                  onClick={() => stepGnt(-1)}
                >
                  ◀
                </button>
                <span className="sentence-pos">
                  {gntIndex + 1}/{gntPassages.length}
                </span>
                <button
                  title="Next sentence"
                  aria-label="Next sentence"
                  disabled={gntIndex >= gntPassages.length - 1}
                  onClick={() => stepGnt(1)}
                >
                  ▶
                </button>
              </div>
            )}
            <button
              className="collapse-btn"
              aria-expanded={!srcCollapsed}
              title={srcCollapsed ? 'Show source text' : 'Hide source text'}
              onClick={() => setSrcCollapsed((v) => !v)}
            >
              {srcCollapsed ? '▸' : '▾'}
            </button>
          </div>
          {!srcCollapsed &&
            (showEnglish ? (
            <div className="source-text english" title="Berean Standard Bible (word-aligned)">
              {parallel!.verses.map((v) => (
                <Fragment key={v.key}>
                  <span className="src-verse">{v.label}</span>
                  {v.words.map((w) => {
                    const space = w.joinLeft ? '' : ' ';
                    if (w.excl)
                      return (
                        <span key={w.i} className="src-punc">
                          {space}
                          {w.t}
                        </span>
                      );
                    const key = `${v.key}#${w.i}`;
                    const hlNode = (parallel!.enToNodes.get(key) ?? []).find((n) =>
                      hlByNode.has(n),
                    );
                    return (
                      <Fragment key={w.i}>
                        {space}
                        <span
                          className={`src-word${hover.en.has(key) ? ' hovered' : ''}${
                            hlNode ? ' highlighted' : ''
                          }`}
                          style={hlNode ? { background: hlByNode.get(hlNode) } : undefined}
                          onMouseEnter={() => hoverEnglish(key)}
                          onMouseLeave={() => hoverEnglish(undefined)}
                          onClick={() => {
                            const ns = parallel!.enToNodes.get(key);
                            if (ns?.[0] && !linking)
                              select(ns[0] === selection.nodeId ? {} : { nodeId: ns[0] });
                          }}
                        >
                          {w.t}
                        </span>
                      </Fragment>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          ) : (
            sourceItems.length > 0 && (
              <div
                className={`source-text${doc.language === 'grc' ? ' greek' : ''}${
                  doc.language === 'hbo' ? ' hebrew' : ''
                }`}
                title="Source text"
              >
                {sourceItems.map((it, i) =>
                  it.kind === 'verse' ? (
                    <span key={`v${i}`} className="src-verse">
                      {it.label}
                    </span>
                  ) : (
                    <span
                      key={it.tid}
                      className={`src-word${it.nodeId && it.nodeId === selection.nodeId ? ' selected' : ''}${
                        it.nodeId && hover.nodes.has(it.nodeId) ? ' hovered' : ''
                      }${it.nodeId && hlByNode.has(it.nodeId) ? ' highlighted' : ''}`}
                      style={
                        it.nodeId && hlByNode.has(it.nodeId)
                          ? { background: hlByNode.get(it.nodeId) }
                          : undefined
                      }
                      onMouseEnter={() => it.nodeId && hoverDiagram(it.nodeId)}
                      onMouseLeave={() => hoverDiagram(undefined)}
                      onClick={() =>
                        it.nodeId &&
                        !linking &&
                        select(it.nodeId === selection.nodeId ? {} : { nodeId: it.nodeId })
                      }
                    >
                      {it.surface}{' '}
                    </span>
                  ),
                )}
              </div>
            )
          ))}
          {!srcCollapsed && (
            <div
              className="source-resize"
              title="Drag to resize"
              onPointerDown={onSrcResize}
            />
          )}
        </div>
      )}
      {sideBySide ? (
        <div className="canvas-viewport compare-mode">
          <VariantComparisonView />
        </div>
      ) : singlePreview ? (
        <div className="canvas-viewport preview-mode">
          <SinglePreviewView />
        </div>
      ) : htmlMode ? (
        <div className="canvas-viewport html-mode">
          {diagramMode === 'phrase-block' ? (
            <PhraseBlockView hovered={hover.nodes} onHover={hoverDiagram} />
          ) : (
            <MorphologyView hovered={hover.nodes} onHover={hoverDiagram} />
          )}
          {htmlReveal && (
            <div className="kr-reveal html-reveal" role="status">
              <button
                className="kr-reveal-close"
                title="Close (Esc)"
                aria-label="Close"
                onClick={() => select({})}
              >
                ✕
              </button>
              <div className="kr-reveal-word">
                {htmlReveal.word}
                {htmlReveal.gloss && <span className="kr-reveal-gloss"> · {htmlReveal.gloss}</span>}
              </div>
              {htmlReveal.translit && <div className="kr-reveal-translit">{htmlReveal.translit}</div>}
              <div className="kr-reveal-role">{htmlReveal.role}</div>
              <div className="kr-reveal-detail">{htmlReveal.detail}</div>
              {htmlReveal.grammar && <div className="kr-reveal-grammar">{htmlReveal.grammar}</div>}
            </div>
          )}
        </div>
      ) : (
      <div
        className={`canvas-viewport${linking ? ' relinking' : ''}`}
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(e) => {
          if (e.target === e.currentTarget && !moved.current) {
            if (linking) cancelRelink();
            else select({});
          }
        }}
      >
        <div
          ref={panRef}
          className="diagram-pan"
          style={{
            // Zoom is a GPU CSS transform, NOT a change to the SVG's intrinsic
            // width/height. Resizing the SVG element re-lays-out and re-rasterises
            // a large vector on every pinch frame — common to zoom-in and zoom-out
            // — which thrashes iOS Safari's compositor until it discards the whole
            // page's tiles and the screen flashes white. A transform reuses one
            // texture during the gesture (Safari re-rasterises the vector crisply
            // once it settles, now that the will-change layer is gone). The math is
            // identical: transform-origin is 0 0, so a point p still lands at
            // x + p*scale either way.
            transform: `translate(${view.x}px, ${view.y}px) scale(${
              Number.isFinite(view.scale) ? view.scale : 1
            })`,
          }}
        >
          <svg
            className={`diagram-paper${doc.language === 'hbo' ? ' hebrew' : ''}`}
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            role="img"
            aria-label={`Kellogg-Reed diagram of: ${doc.text || doc.title}`}
            onClick={(e) => {
              // A click on empty diagram space (the svg itself, not a word/line)
              // dismisses the detail popover.
              if (e.target === e.currentTarget && !moved.current && !linking) select({});
            }}
          >
            {layout.elements.map((el) => {
              if (el.kind === 'line') {
                const sel = isSelected(el.nodeId, el.relationId);
                const dash = dashFor(el.style);
                return (
                  <g key={el.id}>
                    <line
                      className={`kr-line${sel ? ' selected' : ''}`}
                      x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
                      stroke={el.tentative ? TENTATIVE : el.color ?? INK}
                      strokeWidth={1.6}
                      strokeLinecap="round"
                      {...(dash ? { strokeDasharray: dash } : {})}
                    />
                    {(el.nodeId || el.relationId) && (
                      <line
                        className="kr-hit"
                        x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
                        onClick={() => {
                          if (moved.current) return;
                          if (el.nodeId) onNode(el.nodeId);
                          else if (el.relationId) onRelationHit(el.relationId);
                        }}
                      />
                    )}
                  </g>
                );
              }
              if (el.kind === 'curve') {
                const sel = isSelected(el.nodeId, el.relationId);
                const dash = dashFor(el.style);
                const d = `M ${el.x1} ${el.y1} Q ${el.cx} ${el.cy} ${el.x2} ${el.y2}`;
                // Arrowhead: a small triangle at the end, aimed along the tangent.
                const ang = Math.atan2(el.y2 - el.cy, el.x2 - el.cx);
                const s = 6;
                const head = el.arrow
                  ? `M ${el.x2} ${el.y2} L ${el.x2 + s * Math.cos(ang + Math.PI - 0.4)} ${el.y2 + s * Math.sin(ang + Math.PI - 0.4)} L ${el.x2 + s * Math.cos(ang + Math.PI + 0.4)} ${el.y2 + s * Math.sin(ang + Math.PI + 0.4)} Z`
                  : '';
                const color = el.tentative ? TENTATIVE : el.color ?? INK;
                return (
                  <g key={el.id}>
                    <path
                      className={`kr-line${sel ? ' selected' : ''}`}
                      d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round"
                      {...(dash ? { strokeDasharray: dash } : {})}
                    />
                    {head && <path d={head} fill={color} stroke="none" />}
                    {el.relationId && (
                      <path
                        className="kr-hit" d={d} fill="none"
                        onClick={() => {
                          if (moved.current) return;
                          if (el.relationId) onRelationHit(el.relationId);
                        }}
                      />
                    )}
                  </g>
                );
              }
              const sel =
                isSelected(el.nodeId, el.relationId) ||
                (!!el.glossKey && el.glossKey === selection.glossKey && el.id === glossAnchorId);
              const hov = el.nodeId && hover.nodes.has(el.nodeId);
              const fill = el.tentative
                ? TENTATIVE
                : el.color ?? toneColor(el.tone) ?? (el.muted ? '#8a97a3' : '#1f2933');
              const onLabelClick = () => {
                if (moved.current) return;
                if (el.glossKey && !linking) {
                  setGlossAnchorId(el.id);
                  select({ glossKey: el.glossKey });
                } else if (el.nodeId) onNode(el.nodeId);
                else if (el.relationId && !linking) select({ relationId: el.relationId });
                else if (!linking) select({});
              };
              // A label CHIP (Dependency arc tag): a rounded rect behind the text
              // so the tag reads over crossing arcs, in the relation's colour.
              const chip = (() => {
                if (!el.box) return null;
                const size = el.small ? 13 : 18;
                const w = measureText(el.text, el.small ? SMALL_FONT : BASE_FONT);
                const padX = 5;
                const padY = 2.5;
                const bw = w + padX * 2;
                const bh = size * 0.95 + padY * 2;
                const bx =
                  el.anchor === 'middle' ? el.x - bw / 2 : el.anchor === 'end' ? el.x - bw : el.x;
                const by = el.y - size * 0.72 - padY;
                return (
                  <rect
                    x={bx} y={by} width={bw} height={bh} rx={4}
                    fill="#fff" stroke={fill} strokeWidth={sel ? 2 : 1}
                  />
                );
              })();
              // A highlighter swash behind a sermon-tagged word, in its category
              // colour, so highlights read on the diagram (not only in the panel).
              // A sermon highlight (category colour) wins; otherwise a soft amber
              // wash marks a word the open contested issue is about.
              const hlFill = el.nodeId ? hlByNode.get(el.nodeId) : undefined;
              const contestedHere = !hlFill && !!el.nodeId && contestedAffected.has(el.nodeId);
              const markFill = hlFill ?? (contestedHere ? 'rgba(217,119,6,0.26)' : undefined);
              const hlRect =
                markFill && !el.box
                  ? (() => {
                      const size = el.small ? 13 : 18;
                      const w = measureText(el.text, el.small ? SMALL_FONT : BASE_FONT);
                      const padX = 3;
                      const padY = 1.5;
                      const bw = w + padX * 2;
                      const bh = size * 0.95 + padY * 2;
                      const bx =
                        el.anchor === 'middle'
                          ? el.x - bw / 2
                          : el.anchor === 'end'
                            ? el.x - bw + padX
                            : el.x - padX;
                      const by = el.y - size * 0.72 - padY;
                      return (
                        <rect
                          x={bx} y={by} width={bw} height={bh} rx={3}
                          fill={markFill}
                          {...(el.rotate ? { transform: `rotate(${el.rotate} ${el.x} ${el.y})` } : {})}
                        />
                      );
                    })()
                  : null;
              return (
                <g key={el.id}>
                  {hlRect}
                  {chip}
                  <text
                    className={`kr-text${sel ? ' selected' : ''}${hov ? ' hovered' : ''}${
                      el.glossKey ? ' glossed' : ''
                    }`}
                    x={el.x} y={el.y}
                    textAnchor={el.anchor}
                    fontSize={el.small ? 13 : 18}
                    fontStyle={el.italic ? 'italic' : undefined}
                    fill={fill}
                    {...(el.box
                      ? {}
                      : el.rotate
                        ? { transform: `rotate(${el.rotate} ${el.x} ${el.y})` }
                        : { stroke: '#fff', strokeWidth: 3, paintOrder: 'stroke', strokeLinejoin: 'round' })}
                    onMouseEnter={() => el.nodeId && onNodeHover(el.nodeId)}
                    onMouseLeave={() => el.nodeId && onNodeHover(undefined)}
                    onClick={onLabelClick}
                  >
                    {el.text}
                  </text>
                </g>
              );
            })}
            {selectedRelEndpoints.map((e, i) => (
              <g key={`ep${i}`} className="kr-endpoints" pointerEvents="none">
                <circle className="kr-endpoint" cx={e.x1} cy={e.y1} r={4.5} />
                <circle className="kr-endpoint" cx={e.x2} cy={e.y2} r={4.5} />
              </g>
            ))}
            {linkPreview && <LinkPreviewOverlay from={linkPreview.from} to={linkPreview.to} />}
          </svg>
        </div>
        {reveal && revealPos && (
          <div className="kr-reveal" style={{ left: revealPos.left, top: revealPos.top }} role="status">
            <button
              className="kr-reveal-close"
              title="Close (Esc)"
              aria-label="Close"
              onClick={() => select({})}
            >
              ✕
            </button>
            <div className="kr-reveal-word">
              {reveal.summary.word}
              {reveal.summary.gloss && <span className="kr-reveal-gloss"> · {reveal.summary.gloss}</span>}
            </div>
            {reveal.summary.translit && (
              <div className="kr-reveal-translit">{reveal.summary.translit}</div>
            )}
            <div className="kr-reveal-role">{reveal.summary.role}</div>
            <div className="kr-reveal-detail">{reveal.summary.detail}</div>
            {reveal.summary.grammar && <div className="kr-reveal-grammar">{reveal.summary.grammar}</div>}
          </div>
        )}
        {gloss && glossPos && (
          <div className="kr-reveal kr-gloss" style={{ left: glossPos.left, top: glossPos.top }} role="status">
            <button
              className="kr-reveal-close"
              title="Close (Esc)"
              aria-label="Close"
              onClick={() => select({})}
            >
              ✕
            </button>
            <div className="kr-reveal-word">
              {gloss.entry.term}
              {gloss.entry.abbr && <span className="kr-reveal-gloss"> · {gloss.entry.abbr}</span>}
            </div>
            <div className="kr-reveal-detail">{gloss.entry.detail}</div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

type SourceItem =
  | { kind: 'verse'; label: string }
  | { kind: 'word'; tid: string; nodeId?: string; surface: string };

/** "Romans 5:1" → "5:1". */
function verseOf(title: string): string {
  const m = title.match(/(\d+:\d+(?:[–-]\d+)?)\s*$/);
  return m ? m[1]! : '';
}

/**
 * Flatten a document's tokens into an ordered list of verse labels + word spans,
 * each word carrying the syntax node it belongs to so the source text and the
 * diagram can highlight in lock-step.
 */
function buildSourceItems(doc: KrDocument): SourceItem[] {
  const tokenToNode = new Map<string, string>();
  for (const n of doc.syntax.nodes) for (const t of n.tokenIds) tokenToNode.set(t, n.id);

  // Map each token to the verse of the sentence that contains it.
  const tokenToVerse = new Map<string, string>();
  const root = getNode(doc.syntax, doc.syntax.rootId);
  const sentenceRoots =
    root?.clauseType === 'discourse'
      ? childRelations(doc.syntax, root.id).map((r) => getNode(doc.syntax, r.dependentId))
      : [root];
  for (const s of sentenceRoots) {
    if (!s) continue;
    const label = s.label || verseOf(doc.title);
    const seen = new Set<string>();
    const stack = [s.id];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const node = getNode(doc.syntax, id);
      node?.tokenIds.forEach((t) => tokenToVerse.set(t, label));
      for (const r of childRelations(doc.syntax, id)) stack.push(r.dependentId);
    }
  }

  const items: SourceItem[] = [];
  let lastVerse: string | undefined;
  for (const t of doc.tokens) {
    const v = tokenToVerse.get(t.id) ?? '';
    if (v && v !== lastVerse) items.push({ kind: 'verse', label: v });
    lastVerse = v;
    items.push({ kind: 'word', tid: t.id, nodeId: tokenToNode.get(t.id), surface: t.surface });
  }
  return items;
}
