import { useCallback, useRef } from 'react';

/**
 * Linked scrolling for the side-by-side comparison: scrolling one frame scrolls
 * the other to the same offset, so the same region of the passage stays visible
 * in both. A re-entrancy guard stops the two onScroll handlers from ping-ponging.
 * Pan/zoom sync of the SVG itself is a later enhancement — linked scroll first.
 */
export function useLinkedDiagramView(linked: boolean) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  const mirror = useCallback(
    (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
      if (!linked || syncing.current || !from || !to) return;
      syncing.current = true;
      to.scrollLeft = from.scrollLeft;
      to.scrollTop = from.scrollTop;
      // Release on the next frame so the mirrored scroll event is ignored.
      requestAnimationFrame(() => {
        syncing.current = false;
      });
    },
    [linked],
  );

  const onLeftScroll = useCallback(() => mirror(leftRef.current, rightRef.current), [mirror]);
  const onRightScroll = useCallback(() => mirror(rightRef.current, leftRef.current), [mirror]);

  return { leftRef, rightRef, onLeftScroll, onRightScroll };
}
