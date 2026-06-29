/**
 * Suppress the browser's NATIVE pinch-zoom of the whole page.
 *
 * The app is a fixed full-screen PWA with its OWN pan/zoom on the diagram canvas
 * (driven by Pointer events on the viewport, which has `touch-action: none`), so
 * page-level zoom is never wanted — and on iOS Safari it is actively harmful: a
 * two-finger pinch (especially zoom-OUT) shrinks the page past its content and a
 * standalone PWA gets stuck on a blank white screen.
 *
 * The viewport meta (`user-scalable=no, maximum-scale=1`) stops this on Android,
 * Chrome, Firefox and older iOS, but modern iOS Safari ignores those for
 * pinch-zoom, so we also cancel its non-standard *gesture* event stream here.
 * Gesture events are separate from Pointer events, so the diagram's own pinch
 * keeps working; and because we only touch the iOS-only gesture stream (not
 * `touchmove`), a user's "force enable zoom" accessibility setting on other
 * platforms is respected.
 */
export function preventNativeZoom(): void {
  if (typeof document === 'undefined') return;
  const cancel = (e: Event) => e.preventDefault();
  // iOS Safari pinch-zoom rides WebKit-only gesture events; cancelling the start
  // is the documented way to stop the page from zooming.
  document.addEventListener('gesturestart', cancel, { passive: false });
  document.addEventListener('gesturechange', cancel, { passive: false });
  document.addEventListener('gestureend', cancel, { passive: false });
}
