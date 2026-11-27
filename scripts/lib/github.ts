import type { RepoStats } from './types.ts';

const API = 'https://api.github.com';
const MAX_WAIT_MS = 60_000;
const QUOTA_WAIT_MS = 65 * 60_000;
const CODE_SEARCH_GAP_MS = 6_500; // code search allows 10 requests/minute

export type GitHub = ReturnType<typeof createGitHub>;

export function createGitHub(opts: { token?: string; fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; log?: (s: string) => void } = {}) {
  const token = opts.token ?? process.env.GITHUB_PERSONAL_ACCESS_TOKEN ?? '';
  const doFetch = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = opts.log ?? (() => {});
  let lastCodeSearch = 0;

  /** GET with rate-limit retry. Returns null on 404 or after retries are used up. Throws on network failure. */
  async function get(path: string, accept = 'application/vnd.github+json'): Promise<Response | null> {
    const headers: Record<string, string> = { Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'content-radar' };
    if (token) headers.Authorization = `Bearer ${token}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await doFetch(API + path, { headers });
      if (res.ok) return res;
      if (res.status === 404) return null;
      if ((res.status === 403 || res.status === 429) && attempt < 2) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const reset = Number(res.headers.get('x-ratelimit-reset'));
        const wait = retryAfter > 0 ? retryAfter * 1000 : reset > 0 ? reset * 1000 - Date.now() : 5_000;
        // Hourly quota used up: wait for the reset so the run finishes instead of dropping tools.
        const cap = res.headers.get('x-ratelimit-remaining') === '0' ? QUOTA_WAIT_MS : MAX_WAIT_MS;
        if (cap === QUOTA_WAIT_MS) log(`github: hourly quota used, waiting ${Math.round(wait / 60_000)} min`);
        await sleep(Math.min(Math.max(wait, 1000), cap));
        continue;
      }
      log(`github: ${res.status} for ${path.split('?')[0]}`);
      return null;
    }
    return null;
  }

  async function json<T>(path: string): Promise<T | null> {
    const res = await get(path);
    return res ? ((await res.json()) as T) : null;
  }

  async function text(path: string): Promise<string | null> {
    const res = await get(path, 'application/vnd.github.raw+json');
    return res ? res.text() : null;
  }

  const enc = (p: string) => p.split('/').map(encodeURIComponent).join('/');

  return {
    async searchCode(q: string, maxPages = 3): Promise<{ repo: string; path: string }[]> {
      const out: { repo: string; path: string }[] = [];
      for (let page = 1; page <= maxPages; page++) {
        const gap = lastCodeSearch + CODE_SEARCH_GAP_MS - Date.now();
        if (lastCodeSearch && gap > 0) await sleep(gap);
        lastCodeSearch = Date.now();
        const r = await json<{ items: { path: string; repository: { full_name: string } }[] }>(`/search/code?q=${encodeURIComponent(q)}&per_page=100&page=${page}`);
        if (!r) break;
        out.push(...r.items.map((i) => ({ repo: i.repository.full_name, path: i.path })));
        if (r.items.length < 100) break;
      }
      return out;
    },
    async searchRepos(q: string, maxPages = 3): Promise<{ repo: string; description: string }[]> {
      const out: { repo: string; description: string }[] = [];
      for (let page = 1; page <= maxPages; page++) {
        const r = await json<{ items: { full_name: string; description: string | null }[] }>(`/search/repositories?q=${encodeURIComponent(q)}&sort=stars&per_page=100&page=${page}`);
        if (!r) break;
        out.push(...r.items.map((i) => ({ repo: i.full_name, description: i.description ?? '' })));
        if (r.items.length < 100) break;
      }
      return out;
    },
    async getRepo(repo: string): Promise<Omit<RepoStats, 'readme'>> {
      const r = await json<{ full_name: string; stargazers_count: number; forks_count: number; pushed_at: string; license: { spdx_id: string } | null; archived: boolean; topics?: string[] }>(`/repos/${enc(repo)}`);
      if (!r) throw new Error(`github: repo not found ${repo}`);
      const lic = r.license?.spdx_id;
      return { repo: r.full_name, stars: r.stargazers_count, forks: r.forks_count, pushedAt: r.pushed_at, license: lic && lic !== 'NOASSERTION' ? lic : null, archived: r.archived, topics: r.topics ?? [] };
    },
    async getReadme(repo: string): Promise<string> {
      return (await text(`/repos/${enc(repo)}/readme`)) ?? '';
    },
    async getFile(repo: string, path: string): Promise<string | null> {
      return text(`/repos/${enc(repo)}/contents/${enc(path)}`);
    },
    async listDir(repo: string, path: string): Promise<string[]> {
      const r = await json<unknown>(`/repos/${enc(repo)}/contents/${enc(path)}`);
      return Array.isArray(r) ? r.map((i: { name: string }) => i.name) : [];
    },
  };
}
