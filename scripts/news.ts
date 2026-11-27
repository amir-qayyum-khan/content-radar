export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: 'hn' | 'reddit';
  where: string;
  score: number;
  comments: number;
  commentsUrl: string;
  postedAt: string;
  /** score ÷ that source's 90th-percentile score in this batch */
  rank: number;
}

export const NEWS_QUERIES = ['AI video', 'Sora', 'Veo', 'Kling', 'Runway', 'Pika', 'Luma AI', 'ElevenLabs', 'text-to-video', 'video generation', 'AI film', 'lip sync', 'Remotion'];
/** r/aivideo is all on topic; the others must pass isVideoNews. */
const SUBS: [string, boolean][] = [['aivideo', true], ['VideoEditing', false], ['StableDiffusion', false], ['singularity', false], ['ElevenLabs', false]];
const KEEP = 60;
const WEEK_S = 7 * 86_400;
const UA = 'content-radar/1.0';
const TOPIC = /\b(video|film|movie|animation|animated|voice|tts|text-to-speech|lip.?sync|dubbing|sora|veo|kling|runway|pika|luma|elevenlabs|remotion|hailuo|seedance|wan ?2|midjourney video)\b/i;

export function isVideoNews(title: string): boolean {
  // HN's "[video]" marks the link type, not the topic; video games are off topic.
  return TOPIC.test(title.replace(/\[video\]|\bvideo ?games?\b/gi, ''));
}

const isWebUrl = (u: unknown): u is string => typeof u === 'string' && /^https?:\/\//i.test(u);

export function rankNews(items: NewsItem[]): NewsItem[] {
  const p90: Record<string, number> = {};
  for (const src of new Set(items.map((i) => i.source))) {
    const s = items.filter((i) => i.source === src).map((i) => i.score).sort((a, b) => a - b);
    p90[src] = Math.max(1, s[Math.ceil(0.9 * (s.length - 1))]);
  }
  const ranked = items
    .map((i) => ({ ...i, rank: i.score / p90[i.source] }))
    .sort((a, b) => b.rank - a.rank || b.postedAt.localeCompare(a.postedAt));
  const seen = new Set<string>();
  return ranked.filter((i) => !seen.has(i.url) && seen.add(i.url)).slice(0, KEEP);
}

type Fetch = typeof fetch;

async function getJson(f: Fetch, url: string, init?: RequestInit): Promise<unknown> {
  const res = await f(url, init);
  if (!res.ok) throw new Error(`${res.status} for ${url.split('?')[0]}`);
  return res.json();
}

async function fromHN(f: Fetch, now: Date, log: (s: string) => void): Promise<NewsItem[] | null> {
  const since = Math.floor(now.getTime() / 1000) - WEEK_S;
  const out = new Map<string, NewsItem>();
  let ok = 0;
  for (const q of NEWS_QUERIES) {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&typoTolerance=false&numericFilters=created_at_i>${since}&hitsPerPage=50`;
    try {
      const r = (await getJson(f, url)) as { hits?: unknown };
      if (!Array.isArray(r?.hits)) throw new Error('bad response');
      ok++;
      for (const h of r.hits as { objectID: string; title?: string; url?: string | null; points?: number; num_comments?: number; created_at_i: number }[]) {
        if (!h.title || !isVideoNews(h.title)) continue;
        const commentsUrl = `https://news.ycombinator.com/item?id=${encodeURIComponent(h.objectID)}`;
        const link = h.url ?? commentsUrl; // text posts link to their own page
        if (!isWebUrl(link)) continue;
        out.set(h.objectID, { id: `hn-${h.objectID}`, title: h.title, url: link, source: 'hn', where: 'Hacker News', score: h.points ?? 0, comments: h.num_comments ?? 0, commentsUrl, postedAt: new Date(h.created_at_i * 1000).toISOString(), rank: 0 });
      }
    } catch (e) { log(`news: hn "${q}": ${(e as Error).message}`); }
  }
  return ok ? [...out.values()] : null;
}

async function fromReddit(f: Fetch, env: Record<string, string | undefined>, log: (s: string) => void): Promise<NewsItem[] | null> {
  const id = env.REDDIT_CLIENT_ID, secret = env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) { log('news: reddit: skipped (no REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET)'); return null; }
  let token: string;
  try {
    const r = (await getJson(f, 'https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
      body: 'grant_type=client_credentials',
    })) as { access_token?: string };
    if (!r?.access_token) throw new Error('no token');
    token = r.access_token;
  } catch (e) { log(`news: reddit token: ${(e as Error).message}`); return null; }

  const out: NewsItem[] = [];
  let ok = 0;
  for (const [sub, whole] of SUBS) {
    try {
      const r = (await getJson(f, `https://oauth.reddit.com/r/${sub}/top?t=week&limit=50&raw_json=1`, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA } })) as { data?: { children?: unknown } };
      if (!Array.isArray(r?.data?.children)) throw new Error('bad response');
      ok++;
      for (const { data: p } of r.data.children as { data: { id: string; title: string; url: string; permalink: string; score: number; num_comments: number; created_utc: number; over_18: boolean; is_self: boolean } }[]) {
        if (p.over_18 || !p.title || (!whole && !isVideoNews(p.title))) continue;
        const commentsUrl = `https://www.reddit.com${p.permalink}`;
        const link = p.is_self ? commentsUrl : p.url;
        if (!isWebUrl(link) || !isWebUrl(commentsUrl)) continue;
        out.push({ id: `reddit-${p.id}`, title: p.title, url: link, source: 'reddit', where: `r/${sub}`, score: p.score ?? 0, comments: p.num_comments ?? 0, commentsUrl, postedAt: new Date(p.created_utc * 1000).toISOString(), rank: 0 });
      }
    } catch (e) { log(`news: r/${sub}: ${(e as Error).message}`); }
  }
  return ok ? out : null;
}

/** Top AI-video stories of the last 7 days. Never throws; okSources = sources that answered. */
export async function fetchNews(opts: { fetch?: Fetch; now?: Date; env?: Record<string, string | undefined>; log?: (s: string) => void } = {}): Promise<{ items: NewsItem[]; okSources: number }> {
  const f = opts.fetch ?? fetch;
  const log = opts.log ?? (() => {});
  const sources = [await fromHN(f, opts.now ?? new Date(), log), await fromReddit(f, opts.env ?? process.env, log)];
  const okSources = sources.filter(Boolean).length;
  return { items: rankNews(sources.flatMap((s) => s ?? [])), okSources };
}
