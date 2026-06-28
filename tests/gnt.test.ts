import { describe, it, expect } from 'vitest';
import { GNT_BOOKS } from '@/io';

describe('GNT book catalogue', () => {
  it('lists all 27 books in canonical order with unique numbers', () => {
    expect(GNT_BOOKS).toHaveLength(27);
    expect(GNT_BOOKS.map((b) => b.num)).toEqual(Array.from({ length: 27 }, (_, i) => i + 1));
    expect(new Set(GNT_BOOKS.map((b) => b.file)).size).toBe(27);
    expect(GNT_BOOKS.find((b) => b.name === 'Philippians')?.file).toBe('11-philippians.xml');
  });
});
