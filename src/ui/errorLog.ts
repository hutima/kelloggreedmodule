/**
 * On-device error log — a permanent safety net for mobile, where there is no dev
 * console. Captures JS errors to localStorage so they survive a reload (or a
 * crash that blanks the page) and can be surfaced on the next load by the
 * DiagnosticsBanner. This is what finally exposed the pinch white-screen: a
 * deferred setView updater dereferencing a nulled ref, thrown mid-render.
 */
const KEY = 'kr:errorlog';
const MAX = 12;

export interface LoggedError {
  t: string;
  msg: string;
  stack?: string;
}

export function logError(msg: string, stack?: string): void {
  try {
    const list = readErrors();
    list.push({ t: new Date().toISOString(), msg, stack });
    while (list.length > MAX) list.shift();
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* localStorage unavailable (private mode quota, etc.) — diagnostics are best-effort. */
  }
}

export function readErrors(): LoggedError[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as LoggedError[]) : [];
  } catch {
    return [];
  }
}

export function clearErrors(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Capture errors that never reach a React error boundary — those thrown from
 *  event handlers (the pinch/pointer path), async callbacks, and rejected
 *  promises. Installed once at startup. */
export function installGlobalErrorLog(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => {
    const err = e.error as Error | undefined;
    logError(err?.message || e.message || 'error', err?.stack);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { message?: string; stack?: string } | undefined;
    logError('unhandledrejection: ' + (r?.message || String(r)), r?.stack);
  });
}
