import { describe, it, expect } from 'vitest';
import { OT_BOOKS, chapterFile } from '@/io/ot';

describe('Old Testament book table', () => {
  it('has all 39 books in canonical order with unique numbers', () => {
    expect(OT_BOOKS).toHaveLength(39);
    expect(OT_BOOKS.map((b) => b.num)).toEqual(Array.from({ length: 39 }, (_, i) => i + 1));
    expect(new Set(OT_BOOKS.map((b) => b.code)).size).toBe(39);
    expect(OT_BOOKS.every((b) => b.chapters > 0)).toBe(true);
  });

  it('builds the macula-hebrew chapter filename (zero-padded, exact code case)', () => {
    const byName = (n: string) => OT_BOOKS.find((b) => b.name === n)!;
    expect(chapterFile(byName('Genesis'), 1)).toBe('01-Gen-001-lowfat.xml');
    expect(chapterFile(byName('Psalms'), 119)).toBe('19-Psa-119-lowfat.xml');
    expect(chapterFile(byName('Isaiah'), 53)).toBe('23-Isa-053-lowfat.xml');
    // Hosea's source code is upper-case in the filenames.
    expect(chapterFile(byName('Hosea'), 1)).toBe('28-HOS-001-lowfat.xml');
  });

  it('matches well-known chapter counts', () => {
    const ch = (n: string) => OT_BOOKS.find((b) => b.name === n)!.chapters;
    expect(ch('Genesis')).toBe(50);
    expect(ch('Psalms')).toBe(150);
    expect(ch('Obadiah')).toBe(1);
    expect(ch('Malachi')).toBe(3);
  });
});
