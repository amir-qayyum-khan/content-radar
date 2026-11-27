import { describe, it, expect } from 'vitest';
import { isVideoNews, rankNews, fetchNews, type NewsItem } from '../scripts/news.ts';

const NOW = new Date('2026-11-27T00:00:00Z');

function hnHit(id: string, title: string, url: string | null, points: number) {
  return { objectID: id, title, url, points, num_comments: 3, created_at_i: NOW.getTime() / 1000 - 3600 };
}

/** Fake fetch: first route whose key is a substring of the URL answers. */
function fake(routes: Record<string, { status?: number; body: unknown }>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return new Response('{}', { status: 404 });
    const r = routes[key];
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { f, calls };
}

function item(p: Partial<NewsItem>): NewsItem {
  return { id: 'x', title: 'AI video', url: 'https://e.com/' + Math.random(), source: 'hn', where: 'Hacker News', score: 1, comments: 0, commentsUrl: 'https://news.ycombinator.com/item?id=1', postedAt: NOW.toISOString(), rank: 0, ...p };
}

describe('isVideoNews', () => {
  it('matches video model news', () => expect(isVideoNews('Kling 3.0 makes 2-min videos')).toBe(true));
  it('ignores the HN [video] link tag', () => expect(isVideoNews('VCs complain about AI slop [video]')).toBe(false));
  it('ignores video games', () => expect(isVideoNews('Video games could pacify the masses after AI')).toBe(false));
});

describe('fetchNews', () => {
  it('uses Hacker News only when Reddit keys are missing', async () => {
    const { f, calls } = fake({ 'hn.algolia.com': { body: { hits: [hnHit('1', 'Sora 2 video launch', 'https://a.com/sora', 50)] } } });
    const logs: string[] = [];
    const r = await fetchNews({ fetch: f, now: NOW, env: {}, log: (s) => logs.push(s) });
    expect(calls.every((c) => c.url.includes('hn.algolia.com'))).toBe(true);
    expect(calls.every((c) => c.url.includes('typoTolerance=false'))).toBe(true);
    expect(r.okSources).toBe(1);
    expect(r.items.map((i) => i.url)).toEqual(['https://a.com/sora']);
    expect(logs.join('\n')).toMatch(/reddit: skipped/);
  });

  it('drops javascript: URLs and keeps the rest', async () => {
    const { f } = fake({ 'hn.algolia.com': { body: { hits: [hnHit('1', 'Veo video trick', 'javascript:alert(1)', 90), hnHit('2', 'Runway video model', 'https://b.com/r', 10)] } } });
    const r = await fetchNews({ fetch: f, now: NOW, env: {} });
    expect(r.items.map((i) => i.url)).toEqual(['https://b.com/r']);
  });

  it('falls back to the HN item page for text posts', async () => {
    const { f } = fake({ 'hn.algolia.com': { body: { hits: [hnHit('7', 'Ask HN: best AI video tool?', null, 5)] } } });
    const r = await fetchNews({ fetch: f, now: NOW, env: {} });
    expect(r.items[0].url).toBe('https://news.ycombinator.com/item?id=7');
  });

  it('survives Hacker News being down', async () => {
    const { f } = fake({ 'hn.algolia.com': { status: 500, body: 'oops' } });
    const r = await fetchNews({ fetch: f, now: NOW, env: {}, log: () => {} });
    expect(r).toEqual({ items: [], okSources: 0 });
  });

  it('gives up on a source that hangs', async () => {
    const f = ((_u: string, init?: RequestInit) => new Promise((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as typeof fetch;
    const r = await fetchNews({ fetch: f, now: NOW, env: {}, log: () => {}, timeoutMs: 5 });
    expect(r.okSources).toBe(0);
  });

  it('skips a malformed hit and keeps the rest of the batch', async () => {
    const bad = { objectID: '9', title: 'Sora video', url: 'https://bad' };
    const { f } = fake({ 'hn.algolia.com': { body: { hits: [bad, { ...hnHit('2', 'Veo video', 'https://good', 3), title: 'Veo video' }, { objectID: '3', title: 42 }] } } });
    const r = await fetchNews({ fetch: f, now: NOW, env: {}, log: () => {} });
    expect(r.items.map((i) => i.url)).toEqual(['https://good']);
  });

  it('does not count Hacker News as up when most queries fail', async () => {
    const { f } = fake({ 'query=Sora': { body: { hits: [hnHit('1', 'Sora video', 'https://a', 5)] } }, 'hn.algolia.com': { status: 503, body: '' } });
    const r = await fetchNews({ fetch: f, now: NOW, env: {}, log: () => {} });
    expect(r.okSources).toBe(0);
  });

  it('survives junk JSON', async () => {
    const { f } = fake({ 'hn.algolia.com': { body: '<html>' } });
    const r = await fetchNews({ fetch: f, now: NOW, env: {}, log: () => {} });
    expect(r.okSources).toBe(0);
  });

  it('uses Reddit with keys: basic auth token, skips over_18', async () => {
    const post = (id: string, title: string, over18 = false) => ({ data: { id, title, url: `https://v.redd.it/${id}`, permalink: `/r/aivideo/comments/${id}/x/`, score: 900, num_comments: 4, created_utc: NOW.getTime() / 1000 - 7200, over_18: over18, is_self: false } });
    const { f, calls } = fake({
      'hn.algolia.com': { body: { hits: [] } },
      'access_token': { body: { access_token: 'TOK' } },
      'oauth.reddit.com/r/aivideo': { body: { data: { children: [post('a', 'My short film made with Kling'), post('b', 'nsfw clip', true)] } } },
      'oauth.reddit.com': { body: { data: { children: [] } } },
    });
    const r = await fetchNews({ fetch: f, now: NOW, env: { REDDIT_CLIENT_ID: 'id', REDDIT_CLIENT_SECRET: 'sec' } });
    const tok = calls.find((c) => c.url.includes('access_token'))!;
    expect(new Headers(tok.init?.headers).get('authorization')).toBe('Basic ' + Buffer.from('id:sec').toString('base64'));
    expect(calls.some((c) => c.url.includes('sec'))).toBe(false);
    expect(new Headers(calls.find((c) => c.url.includes('oauth.reddit.com'))!.init?.headers).get('authorization')).toBe('Bearer TOK');
    expect(r.okSources).toBe(2);
    expect(r.items.map((i) => i.id)).toEqual(['reddit-a']);
    expect(r.items[0]).toMatchObject({ where: 'r/aivideo', commentsUrl: 'https://www.reddit.com/r/aivideo/comments/a/x/' });
  });
});

describe('rankNews', () => {
  it('normalises each source so a big subreddit does not drown HN', () => {
    const out = rankNews([item({ score: 100, url: 'https://1' }), item({ score: 10, url: 'https://2' }), item({ source: 'reddit', score: 5000, url: 'https://3' }), item({ source: 'reddit', score: 500, url: 'https://4' })]);
    expect(out).toHaveLength(4);
    expect(out.slice(0, 2).map((i) => i.source).sort()).toEqual(['hn', 'reddit']);
    for (const i of out.slice(0, 2)) expect(i.rank).toBeCloseTo(1, 0);
  });

  it('shows a link posted on both sources once', () => {
    const out = rankNews([item({ score: 50, url: 'https://same' }), item({ source: 'reddit', score: 5000, url: 'https://same' }), item({ score: 5, url: 'https://other' })]);
    expect(out.filter((i) => i.url === 'https://same')).toHaveLength(1);
  });

  it('keeps the top 60', () => {
    expect(rankNews(Array.from({ length: 70 }, (_, n) => item({ score: n, url: `https://${n}` })))).toHaveLength(60);
  });
});
