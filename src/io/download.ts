/** Browser download helpers, isolated so the rest of io stays testable. */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the click has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadText(text: string, filename: string, mime: string): void {
  downloadBlob(new Blob([text], { type: mime }), filename);
}

/** Copies text to the clipboard, with a legacy fallback for older webviews. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Open a self-contained HTML document in a new window and trigger the print
 * dialog, so the user can "Save as PDF". Falls back to a same-document hidden
 * iframe when popups are blocked. Returns false if neither path is available.
 */
export function printHtmlDocument(html: string): boolean {
  try {
    const win = window.open('', '_blank');
    if (win) {
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
      // Give the new document a tick to lay out before printing.
      setTimeout(() => {
        try {
          win.print();
        } catch {
          /* user can still print manually */
        }
      }, 250);
      return true;
    }
  } catch {
    /* fall through to the iframe path */
  }
  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const cw = iframe.contentWindow;
    if (!cw) return false;
    cw.document.open();
    cw.document.write(html);
    cw.document.close();
    setTimeout(() => {
      cw.focus();
      cw.print();
      setTimeout(() => iframe.remove(), 1000);
    }, 250);
    return true;
  } catch {
    return false;
  }
}

/** Filesystem-safe slug for default filenames. */
export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60) || 'diagram'
  );
}
