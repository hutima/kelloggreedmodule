import { useCallback, useEffect, useState } from 'react';
import { useEditorStore } from '@/state';
import { classifyWidth, type ViewportKind } from './viewport';

export interface Viewport {
  /** Physical device class from the window width. */
  device: ViewportKind;
  /**
   * The class the UI should actually render for: the device class, unless the
   * user forced desktop mode on a small screen.
   */
  effective: ViewportKind;
  width: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  /** The user's "force desktop on this device" preference (persisted). */
  forceDesktop: boolean;
  setForceDesktop: (value: boolean) => void;
}

function currentWidth(): number {
  return typeof window === 'undefined' ? 1280 : window.innerWidth;
}

/**
 * React hook exposing the live viewport class plus the force-desktop override.
 * The override lives in the shared store so every consumer (top bar, shell)
 * re-renders together when it changes; this hook only owns width detection.
 */
export function useViewport(): Viewport {
  const [width, setWidth] = useState<number>(() => currentWidth());
  const forceDesktop = useEditorStore((s) => s.forceDesktop);
  const setStoreForce = useEditorStore((s) => s.setForceDesktop);

  useEffect(() => {
    const onResize = () => setWidth(currentWidth());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  const setForceDesktop = useCallback((value: boolean) => setStoreForce(value), [setStoreForce]);

  const device = classifyWidth(width);
  const effective: ViewportKind =
    forceDesktop && device !== 'desktop' ? 'desktop' : device;

  return {
    device,
    effective,
    width,
    isMobile: effective === 'mobile',
    isTablet: effective === 'tablet',
    isDesktop: effective === 'desktop',
    forceDesktop,
    setForceDesktop,
  };
}
