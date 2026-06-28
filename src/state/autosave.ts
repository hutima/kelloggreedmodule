import type { KrDocument } from '@/domain/schema';
import { saveDocument } from '@/persistence';

/**
 * Debounced autosave. Kept out of the store so the persistence side-effect is
 * isolated and easy to swap (e.g. for a remote sync later).
 */
const DEBOUNCE_MS = 600;
let timer: ReturnType<typeof setTimeout> | null = null;

export function scheduleAutosave(
  doc: KrDocument,
  onStatus: (s: 'saving' | 'saved' | 'error') => void,
): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    onStatus('saving');
    try {
      await saveDocument(doc);
      onStatus('saved');
    } catch (e) {
      console.error('Autosave failed', e);
      onStatus('error');
    }
  }, DEBOUNCE_MS);
}
