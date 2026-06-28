import { KrDocumentSchema, type KrDocument } from '@/domain/schema';
import fox from './fox.json';
import wordFlesh from './word-became-flesh.json';
import john11a from './john-1-1a.json';
import john114a from './john-1-14a.json';
import john1John11 from './1-john-1-1.json';
import phil116 from './philippians-1-1-6.json';
import phil112grc from './philippians-1-1-2-grc.json';

/**
 * Bundled sample analyses. Each is validated against the schema at module load
 * so a malformed fixture fails loudly in development and in tests.
 */
const raw: unknown[] = [fox, wordFlesh, john11a, john114a, john1John11, phil116, phil112grc];

export const sampleDocuments: KrDocument[] = raw.map((r) => KrDocumentSchema.parse(r));

export interface SampleEntry {
  id: string;
  title: string;
  language: KrDocument['language'];
  document: KrDocument;
}

export const sampleEntries: SampleEntry[] = sampleDocuments.map((d) => ({
  id: d.id,
  title: d.title,
  language: d.language,
  document: d,
}));

/** Deep clone a sample so loading it into the editor never mutates the bundle. */
export function cloneSample(id: string): KrDocument | undefined {
  const found = sampleDocuments.find((d) => d.id === id);
  return found ? KrDocumentSchema.parse(JSON.parse(JSON.stringify(found))) : undefined;
}
