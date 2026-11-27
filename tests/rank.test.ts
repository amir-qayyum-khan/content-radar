import { describe, it, expect } from 'vitest';
import { trending, rank } from '../scripts/rank.ts';
import type { Entry } from '../scripts/lib/types.ts';
import { makeEntry } from './helpers.ts';

const TODAY = '2026-11-27';
const cls = (stages: Entry['classification'] extends infer C ? any : never, maybe = false) => ({ relevant: true, confidence: 0.9, stages, contentTypes: [], oneLiner: 'x', maybe, hash: 'h' });

describe('trending', () => {
  it('uses the oldest snapshot within 7 days (full week)', () => {
    const h = { '2026-11-19': { 'a/b': 50 }, '2026-11-20': { 'a/b': 100 }, '2026-11-27': { 'a/b': 140 } };
    expect(trending('a/b', h, TODAY)).toBe(40);
  });

  it('handles gaps when the PC was off', () => {
    const h = { '2026-11-25': { 'a/b': 120 }, '2026-11-27': { 'a/b': 140 } };
    expect(trending('a/b', h, TODAY)).toBe(20);
  });

  it('returns 0 with no history (never NaN)', () => {
    expect(trending('a/b', {}, TODAY)).toBe(0);
    expect(trending('a/b', { '2026-11-27': { 'x/y': 5 } }, TODAY)).toBe(0);
  });
});

describe('rank', () => {
  const e = (id: string, over: Partial<Entry>) => makeEntry({ id, repo: id.split('/').slice(0, 2).join('/'), slug: id.split('/')[2], ...over });

  it('sorts non-stale first, then trend, then stars', () => {
    const entries = {
      'a/a/x': e('a/a/x', { stars: 999, stale: true, classification: cls(['pacing-edit']) }),
      'b/b/x': e('b/b/x', { stars: 10, classification: cls(['pacing-edit']) }),
      'c/c/x': e('c/c/x', { stars: 20, classification: cls(['pacing-edit']) }),
    };
    const h = { '2026-11-21': { 'b/b': 0, 'c/c': 20 }, '2026-11-27': { 'b/b': 10, 'c/c': 20 } };
    expect(rank(entries, h, TODAY).byStage['pacing-edit'].map((r) => r.id)).toEqual(['b/b/x', 'c/c/x', 'a/a/x']);
  });

  it('lists an entry under every stage it has', () => {
    const r = rank({ 'a/a/x': e('a/a/x', { classification: cls(['story-script', 'voice-emotion']) }) }, {}, TODAY);
    expect(r.byStage['story-script']).toHaveLength(1);
    expect(r.byStage['voice-emotion']).toHaveLength(1);
  });

  it('shows maybe entries only under other', () => {
    const r = rank({ 'a/a/x': e('a/a/x', { classification: cls(['story-script'], true) }) }, {}, TODAY);
    expect(r.byStage['story-script']).toHaveLength(0);
    expect(r.byStage.other).toHaveLength(1);
  });

  it('new this week: first seen within 7 days, stars desc, max 12', () => {
    const entries: Record<string, Entry> = {};
    for (let i = 0; i < 15; i++) entries[`r/r${i}/x`] = e(`r/r${i}/x`, { stars: i, firstSeen: '2026-11-25', classification: cls(['other']) });
    entries['o/o/x'] = e('o/o/x', { stars: 1000, firstSeen: '2026-11-01', classification: cls(['other']) });
    const r = rank(entries, {}, TODAY);
    expect(r.newThisWeek).toHaveLength(12);
    expect(r.newThisWeek[0].stars).toBe(14);
    expect(r.newThisWeek.some((x) => x.id === 'o/o/x')).toBe(false);
    expect(r.all.find((x) => x.id === 'r/r1/x')?.isNew).toBe(true);
  });

  it('skips unclassified entries', () => {
    expect(rank({ 'a/a/x': e('a/a/x', {}) }, {}, TODAY).all).toHaveLength(0);
  });
});
