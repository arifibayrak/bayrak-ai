/**
 * tests/boq-value.test.ts
 *
 * Unit tests for the BOQ per-line value helpers (Plan 07-05).
 * These are pure function tests — no DB, no network.
 */

import { describe, it, expect } from 'vitest';
import { lineValue, formatCurrency } from '@/lib/boq-value';

describe('lineValue', () => {
  it('multiplies qty × unitPrice and returns a 2-decimal fixed string', () => {
    expect(lineValue('100', '1250.5')).toBe('125050.00');
  });

  it('returns null when unitPrice is null', () => {
    expect(lineValue('100', null)).toBeNull();
  });

  it('returns null when qty is null', () => {
    expect(lineValue(null, '5')).toBeNull();
  });

  it('returns null when qty is undefined', () => {
    expect(lineValue(undefined, '5')).toBeNull();
  });

  it('returns null when unitPrice is undefined', () => {
    expect(lineValue('100', undefined)).toBeNull();
  });

  it('returns null for non-numeric qty string', () => {
    expect(lineValue('abc', '10.00')).toBeNull();
  });

  it('returns null for non-numeric unitPrice string', () => {
    expect(lineValue('10', 'xyz')).toBeNull();
  });

  it('handles small decimal quantities correctly', () => {
    // 0.1 * 0.2 = 0.02 (decimal.js avoids float rounding to 0.020000000000000004)
    expect(lineValue('0.1', '0.2')).toBe('0.02');
  });
});

describe('formatCurrency', () => {
  it('returns em-dash placeholder when value is null', () => {
    expect(formatCurrency(null, 'TRY')).toBe('—');
  });

  it('returns em-dash placeholder when value is null and currencyCode is null', () => {
    expect(formatCurrency(null, null)).toBe('—');
  });

  it('formats TRY values using tr-TR locale', () => {
    const result = formatCurrency('125050.00', 'TRY');
    // Should contain the numeric value and TRY currency symbol/code
    expect(result).not.toBe('—');
    expect(result).toMatch(/125/); // numeric portion present
  });

  it('formats USD values (different currency code)', () => {
    const result = formatCurrency('1250.50', 'USD');
    expect(result).not.toBe('—');
    expect(result).toMatch(/1\.250|1250/); // numeric portion present (tr-TR uses . as thousands separator)
  });

  it('falls back gracefully on invalid currency code', () => {
    const result = formatCurrency('100.00', 'NOTACURRENCY');
    // Should not throw and should contain the number
    expect(result).toMatch(/100/);
    expect(result).toContain('NOTACURRENCY');
  });

  it('defaults to TRY when currencyCode is null or undefined', () => {
    const withNull = formatCurrency('500.00', null);
    const withUndefined = formatCurrency('500.00', undefined);
    // Both should format without error
    expect(withNull).not.toBe('—');
    expect(withUndefined).not.toBe('—');
  });
});
