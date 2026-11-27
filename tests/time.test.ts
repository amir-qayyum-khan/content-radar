import { describe, it, expect } from 'vitest';
import { todayPKT } from '../scripts/lib/time.ts';

describe('todayPKT', () => {
  it('uses the Pakistan date, not UTC (04:30 PKT is still the previous day in UTC)', () => {
    expect(todayPKT(new Date('2026-11-26T23:30:00Z'))).toBe('2026-11-27');
  });
  it('matches UTC date in the afternoon', () => {
    expect(todayPKT(new Date('2026-11-27T10:00:00Z'))).toBe('2026-11-27');
  });
});
