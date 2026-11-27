import { describe, it, expect } from 'vitest';
import { createGitHub } from '../scripts/lib/github.ts';

type R = { status: number; body?: unknown; headers?: Record<string, string> };

function fakeFetch(routes: (url: string) => R | R[]) {
  const counts = new Map<string, number>();
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const f = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const r = routes(url);
    const n = counts.get(url) ?? 0;
    counts.set(url, n + 1);
    const one = Array.isArray(r) ? r[Math.min(n, r.length - 1)] : r;
    return new Response(one.body === undefined ? null : typeof one.body === 'string' ? one.body : JSON.stringify(one.body), { status: one.status, headers: one.headers });
  }) as typeof fetch;
  return { f, calls };
}

const noSleep = () => { const waits: number[] = []; return { waits, sleep: async (ms: number) => { waits.push(ms); } }; };

describe('github client', () => {
  it('retries after 429 using retry-after', async () => {
    const { f } = fakeFetch(() => [{ status: 429, headers: { 'retry-after': '1' } }, { status: 200, body: { items: [{ path: 'a/SKILL.md', repository: { full_name: 'o/r' } }] } }]);
    const s = noSleep();
    const gh = createGitHub({ token: 't', fetch: f, sleep: s.sleep });
    expect(await gh.searchCode('q', 1)).toEqual([{ repo: 'o/r', path: 'a/SKILL.md' }]);
    expect(s.waits).toContain(1000);
  });

  it('gives up after 2 retries and returns []', async () => {
    const { f, calls } = fakeFetch(() => ({ status: 403, headers: { 'retry-after': '1' } }));
    const gh = createGitHub({ token: 't', fetch: f, sleep: noSleep().sleep });
    expect(await gh.searchCode('q', 1)).toEqual([]);
    expect(calls.length).toBe(3);
  });

  it('caps rate-limit waits at 60s', async () => {
    const { f } = fakeFetch(() => [{ status: 429, headers: { 'retry-after': '9999' } }, { status: 200, body: { items: [] } }]);
    const s = noSleep();
    await createGitHub({ token: 't', fetch: f, sleep: s.sleep }).searchRepos('topic:x', 1);
    expect(Math.max(...s.waits)).toBeLessThanOrEqual(60000);
  });

  it('waits for the hourly reset when the main quota is used up', async () => {
    const reset = String(Math.floor(Date.now() / 1000) + 30 * 60);
    const { f } = fakeFetch(() => [{ status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset } }, { status: 200, body: { items: [] } }]);
    const s = noSleep();
    await createGitHub({ token: 't', fetch: f, sleep: s.sleep }).searchRepos('topic:x', 1);
    expect(Math.max(...s.waits)).toBeGreaterThan(25 * 60_000);
    expect(Math.max(...s.waits)).toBeLessThanOrEqual(65 * 60_000);
  });

  it('throws on 401 (bad or missing token) instead of returning nothing', async () => {
    const { f } = fakeFetch(() => ({ status: 401, body: { message: 'Bad credentials' } }));
    await expect(createGitHub({ token: 't', fetch: f, sleep: noSleep().sleep }).searchCode('q', 1)).rejects.toThrow(/401/);
  });

  it('throws on a GitHub outage (5xx)', async () => {
    const { f } = fakeFetch(() => ({ status: 502 }));
    await expect(createGitHub({ token: 't', fetch: f, sleep: noSleep().sleep }).getReadme('o/r')).rejects.toThrow(/502/);
  });

  it('does not wait on a 403 that is not a rate limit', async () => {
    const { f } = fakeFetch(() => ({ status: 403, headers: { 'x-ratelimit-remaining': '4000' }, body: { message: 'blocked' } }));
    const s = noSleep();
    expect(await createGitHub({ token: 't', fetch: f, sleep: s.sleep }).listDir('o/r', '')).toEqual([]);
    expect(s.waits).toEqual([]);
  });

  it('getReadme returns empty string on 404', async () => {
    const { f } = fakeFetch(() => ({ status: 404, body: { message: 'Not Found' } }));
    expect(await createGitHub({ token: 't', fetch: f, sleep: noSleep().sleep }).getReadme('o/r')).toBe('');
  });

  it('sends bearer token in header, never in URL', async () => {
    const { f, calls } = fakeFetch(() => ({ status: 200, body: { items: [] } }));
    await createGitHub({ token: 'SECRET', fetch: f, sleep: noSleep().sleep }).searchRepos('topic:x', 1);
    expect(calls[0].headers.Authorization).toBe('Bearer SECRET');
    expect(calls[0].url).not.toContain('SECRET');
  });

  it('searchRepos returns repo names with descriptions', async () => {
    const { f } = fakeFetch(() => ({ status: 200, body: { items: [{ full_name: 'o/r', description: 'reels' }, { full_name: 'o/s', description: null }] } }));
    expect(await createGitHub({ token: 't', fetch: f, sleep: noSleep().sleep }).searchRepos('topic:x', 1)).toEqual([{ repo: 'o/r', description: 'reels' }, { repo: 'o/s', description: '' }]);
  });

  it('getRepo maps fields', async () => {
    const { f } = fakeFetch(() => ({ status: 200, body: { full_name: 'o/r', stargazers_count: 5, forks_count: 1, pushed_at: '2026-01-01T00:00:00Z', license: { spdx_id: 'MIT' }, archived: false, topics: ['a'] } }));
    expect(await createGitHub({ token: 't', fetch: f, sleep: noSleep().sleep }).getRepo('o/r')).toEqual({ repo: 'o/r', stars: 5, forks: 1, pushedAt: '2026-01-01T00:00:00Z', license: 'MIT', archived: false, topics: ['a'] });
  });
});
