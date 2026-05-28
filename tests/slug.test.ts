/**
 * tests/slug.test.ts
 *
 * Unit tests for toSlug() helper (src/lib/slug.ts).
 *
 * D-112: Filename slugs must be ASCII-safe so they can be used directly in
 * Content-Disposition: attachment; filename="..." without RFC 5987 encoding.
 * Turkish character normalization (İ Ş Ğ Ü Ö Ç + lowercase variants) is the
 * primary correctness requirement — failure would produce filenames like
 * "istanbul-do%C4%9Falgaz.xlsx" or, worse, "istanbul-do?algaz.xlsx".
 */

import { describe, it, expect } from 'vitest';
import { toSlug } from '@/lib/slug';

describe('toSlug — D-112 ASCII slug normalization', () => {
  it('İstanbul Doğalgaz → istanbul-dogalgaz (Turkish capital İ + lowercase ğ)', () => {
    expect(toSlug('İstanbul Doğalgaz')).toBe('istanbul-dogalgaz');
  });

  it('Ankara Şehit Yolu → ankara-sehit-yolu (capital Ş)', () => {
    expect(toSlug('Ankara Şehit Yolu')).toBe('ankara-sehit-yolu');
  });

  it('whitespace collapsed and trailing dashes trimmed', () => {
    expect(toSlug('  Boru   Hattı  ')).toBe('boru-hatti');
  });

  it('non-alphanumerics collapse to single dash', () => {
    expect(toSlug('Project (2026)')).toBe('project-2026');
  });

  it('only dashes returns empty string', () => {
    expect(toSlug('---')).toBe('');
  });

  it('all six Turkish lowercase chars normalize (ç→c ğ→g ş→s ı→i ö→o ü→u + capitals)', () => {
    expect(toSlug('Çağrı Üçgenli')).toBe('cagri-ucgenli');
  });
});
