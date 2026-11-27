import type { Candidate } from './lib/types.ts';
import type { GitHub } from './lib/github.ts';
import { looksRelevant } from './tools/prefilter.ts';
export type { GitHub } from './lib/github.ts';

export const KEYWORDS = ['video', 'audio', 'voice', 'tts', 'ffmpeg', 'remotion', 'screenplay', 'script', 'storyboard', 'subtitle', 'music', 'sfx', 'lip-sync', 'animation', 'reel', 'shorts', 'drama', 'cinematic', 'documentary', 'edit'];
export const TOPICS = ['claude-skill', 'claude-skills', 'claude-code-plugin', 'agent-skills'];

const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

/** Normalises a marketplace plugin `source` to a repo + path, or null when it's not on GitHub. */
function pluginSource(marketRepo: string, source: unknown): { repo: string; path: string } | null {
  if (typeof source === 'string') {
    if (source.startsWith('./') || !source.includes(':')) return { repo: marketRepo, path: source.replace(/^\.\//, '').replace(/\/$/, '') };
    const m = source.match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/);
    return m ? { repo: m[1], path: '' } : null;
  }
  if (source && typeof source === 'object') {
    const s = source as { source?: string; repo?: string; url?: string };
    if (s.source === 'github' && s.repo) return { repo: s.repo, path: '' };
    if (s.url) return pluginSource(marketRepo, s.url);
  }
  return null;
}

export async function collect(gh: GitHub, log: (s: string) => void = () => {}): Promise<Candidate[]> {
  const out = new Map<string, Candidate>();
  const add = (c: Candidate) => { const k = `${c.repo}#${c.path}`; if (!out.has(k)) out.set(k, c); };
  let attempts = 0;
  let failures = 0;
  const safely = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    attempts++;
    try { return await fn(); } catch (e) { failures++; log(`collect: ${label} failed: ${(e as Error).message}`); return fallback; }
  };

  // (b) marketplaces first, so plugin entries win the dedupe over topic guesses
  for (const hit of await safely('marketplaces', () => gh.searchCode('filename:marketplace.json path:.claude-plugin'), [])) {
    const raw = await safely(`marketplace ${hit.repo}`, () => gh.getFile(hit.repo, hit.path), null);
    let plugins: { name?: string; description?: string; source?: unknown }[] = [];
    try { plugins = raw ? (JSON.parse(raw).plugins ?? []) : []; } catch { log(`collect: bad marketplace.json in ${hit.repo}`); }
    for (const p of Array.isArray(plugins) ? plugins : []) {
      const src = pluginSource(hit.repo, p?.source);
      if (src) add({ ...src, kind: 'plugin', sourceName: 'marketplace', hint: `${p.name ?? ''} ${p.description ?? ''}`.trim() });
    }
  }

  // (a) SKILL.md files matching each keyword
  for (const kw of KEYWORDS) {
    for (const hit of await safely(`code ${kw}`, () => gh.searchCode(`filename:SKILL.md ${kw}`), [])) {
      add({ repo: hit.repo, kind: 'skill', path: dirOf(hit.path), sourceName: 'code-search' });
    }
  }

  // (c) repo topics
  for (const t of TOPICS) {
    for (const { repo, description } of await safely(`topic ${t}`, () => gh.searchRepos(`topic:${t}`), [])) {
      if (!looksRelevant(repo, description)) continue; // saves a plugin.json lookup per unrelated repo
      const files = await safely(`plugin.json ${repo}`, () => gh.listDir(repo, '.claude-plugin'), [] as string[]);
      add({ repo, kind: files.includes('plugin.json') ? 'plugin' : 'skill', path: '', sourceName: 'topic', hint: description });
    }
  }

  if (attempts > 0 && failures === attempts) throw new Error('collect: every source failed (network down?)');
  return [...out.values()];
}
