import { describe, it, expect } from 'vitest';
import { nightly, type Deps } from '../scripts/nightly.ts';
import { makeEntry } from './helpers.ts';

function deps(over: Partial<Deps> = {}) {
  const calls: string[] = [];
  const d: Deps = {
    collect: async () => { calls.push('collect'); return [{ repo: 'o/r', kind: 'skill', path: '', sourceName: 'x' }]; },
    enrich: async () => { calls.push('enrich'); return { 'o/r/tool': makeEntry({ id: 'o/r/tool', repo: 'o/r', stars: 7 }) }; },
    classify: async (_e, o) => { calls.push(`classify:${o.cap}`); return { done: 1, stoppedByLimit: false }; },
    write: async (_e, o) => { calls.push(`write:${o.cap}`); return { done: 1, stoppedByLimit: false }; },
    loadEntries: () => ({}),
    saveEntries: () => { calls.push('saveEntries'); },
    saveSnapshot: (_d, stars) => { calls.push(`snapshot:${JSON.stringify(stars)}`); },
    saveRaw: () => { calls.push('saveRaw'); },
    news: async () => { calls.push('news'); },
    build: async () => { calls.push('build'); },
    publish: async () => { calls.push('publish'); },
    commitData: async () => { calls.push('commitData'); },
    notify: (m) => { calls.push(`notify:${m}`); },
    log: () => {},
    ...over,
  };
  return { d, calls };
}

describe('nightly', () => {
  it('runs every step in order and publishes', async () => {
    const { d, calls } = deps();
    expect(await nightly({ backfill: false, deps: d, today: '2026-11-27' })).toEqual({ ok: true, published: true });
    expect(calls).toEqual(['collect', 'enrich', 'saveEntries', 'classify:200', 'write:60', 'saveEntries', 'snapshot:{"o/r":7}', 'saveRaw', 'news', 'build', 'publish', 'commitData']);
  });

  it('still publishes when the news step fails, without a failure toast', async () => {
    const { d, calls } = deps({ news: async () => { calls.push('news'); throw new Error('hn down'); } });
    expect((await nightly({ backfill: false, deps: d, today: '2026-11-27' })).published).toBe(true);
    expect(calls).toContain('publish');
    expect(calls.some((c) => c.startsWith('notify:'))).toBe(false);
  });

  it('stops before saving or publishing when collect finds nothing', async () => {
    const { d, calls } = deps({ collect: async () => { calls.push('collect'); return []; } });
    expect((await nightly({ backfill: false, deps: d, today: '2026-11-27' })).published).toBe(false);
    expect(calls).not.toContain('saveEntries');
    expect(calls).not.toContain('publish');
    expect(calls.some((c) => c.startsWith('notify:'))).toBe(true);
  });

  it('stops before saving when the tool count falls below half of last run', async () => {
    const prev: Record<string, any> = {};
    for (let i = 0; i < 10; i++) prev[`o/r/t${i}`] = makeEntry({ id: `o/r/t${i}` });
    const { d, calls } = deps({ loadEntries: () => prev });
    expect((await nightly({ backfill: false, deps: d, today: '2026-11-27' })).published).toBe(false);
    expect(calls).not.toContain('saveEntries');
  });

  it('saves after enrich and passes a checkpoint to classify and write', async () => {
    const { d, calls } = deps({
      classify: async (_e, o) => { calls.push('classify'); o.checkpoint?.(); return { done: 1, stoppedByLimit: false }; },
      write: async (_e, o) => { calls.push('write'); o.checkpoint?.(); return { done: 1, stoppedByLimit: false }; },
    });
    await nightly({ backfill: false, deps: d, today: '2026-11-27' });
    expect(calls.slice(0, 7)).toEqual(['collect', 'enrich', 'saveEntries', 'classify', 'saveEntries', 'write', 'saveEntries']);
  });

  it('reports a failed save instead of crashing', async () => {
    const { d, calls } = deps({ saveSnapshot: () => { throw new Error('disk full'); } });
    expect((await nightly({ backfill: false, deps: d, today: '2026-11-27' })).ok).toBe(false);
    expect(calls.some((c) => c.includes('disk full'))).toBe(true);
  });

  it('still publishes when the usage limit is hit', async () => {
    const { d, calls } = deps({ classify: async () => ({ done: 3, stoppedByLimit: true }) });
    expect(await nightly({ backfill: false, deps: d, today: '2026-11-27' })).toEqual({ ok: true, published: true });
    expect(calls).toContain('publish');
  });

  it('skips writing after classify hits the usage limit', async () => {
    const { d, calls } = deps({ classify: async () => ({ done: 3, stoppedByLimit: true }) });
    await nightly({ backfill: false, deps: d, today: '2026-11-27' });
    expect(calls.some((c) => c.startsWith('write'))).toBe(false);
  });

  it('does not publish when the build fails, and notifies', async () => {
    const { d, calls } = deps({ build: async () => { throw new Error('astro exploded'); } });
    expect(await nightly({ backfill: false, deps: d, today: '2026-11-27' })).toEqual({ ok: false, published: false });
    expect(calls).not.toContain('publish');
    expect(calls.some((c) => c.startsWith('notify:') && c.includes('astro exploded'))).toBe(true);
  });

  it('leaves data untouched when collect fails', async () => {
    const { d, calls } = deps({ collect: async () => { throw new Error('collect: every source failed'); } });
    expect((await nightly({ backfill: false, deps: d, today: '2026-11-27' })).ok).toBe(false);
    expect(calls).not.toContain('saveEntries');
    expect(calls).not.toContain('publish');
  });

  it('backfill lifts the caps', async () => {
    const { d, calls } = deps();
    await nightly({ backfill: true, deps: d, today: '2026-11-27' });
    expect(calls).toContain('classify:Infinity');
    expect(calls).toContain('write:Infinity');
  });

  it('a publish failure is reported but data is kept', async () => {
    const { d, calls } = deps({ publish: async () => { throw new Error('push rejected'); } });
    expect(await nightly({ backfill: false, deps: d, today: '2026-11-27' })).toEqual({ ok: false, published: false });
    expect(calls).toContain('saveEntries');
    expect(calls).toContain('commitData');
  });
});
