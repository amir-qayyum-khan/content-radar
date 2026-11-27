import { describe, it, expect } from 'vitest';
import { enrich } from '../scripts/enrich.ts';
import type { GitHub } from '../scripts/lib/github.ts';
import type { Candidate } from '../scripts/lib/types.ts';
import { makeEntry } from './helpers.ts';

const TODAY = '2026-11-27';
const README = '# Reel Cutter\nCuts ffmpeg video into punchy reels.\n```\n/plugin marketplace add o/r\n```\nNeeds ELEVENLABS_API_KEY.';

function fakeGh(opts: { archived?: boolean; pushedAt?: string; files?: Record<string, string>; dirs?: Record<string, string[]>; readme?: string } = {}) {
  const calls: string[] = [];
  const gh = {
    searchCode: async () => [], searchRepos: async () => [],
    getRepo: async (repo: string) => ({ repo, stars: 42, forks: 1, pushedAt: opts.pushedAt ?? '2026-11-20T00:00:00Z', license: 'MIT', archived: !!opts.archived, topics: [] }),
    getReadme: async () => opts.readme ?? README,
    getFile: async (_r: string, p: string) => { calls.push(`file:${p}`); return opts.files?.[p] ?? null; },
    listDir: async (_r: string, p: string) => { calls.push(`dir:${p}`); return opts.dirs?.[p] ?? []; },
  } as unknown as GitHub;
  return { gh, calls };
}

const skill = (path: string, repo = 'o/r'): Candidate => ({ repo, kind: 'skill', path, sourceName: 'code-search', hint: 'video' });
const plugin = (path: string, repo = 'o/r'): Candidate => ({ repo, kind: 'plugin', path, sourceName: 'marketplace', hint: 'video' });

describe('enrich', () => {
  it('skips unrelated candidates before any GitHub call', async () => {
    let repoCalls = 0;
    const { gh } = fakeGh();
    (gh as { getRepo: unknown }).getRepo = async () => { repoCalls++; throw new Error('should not be called'); };
    expect(await enrich([{ repo: 'a/db-tools', kind: 'skill', path: 'skills/postgres', sourceName: 'code-search' }], gh, {}, TODAY)).toEqual({});
    expect(repoCalls).toBe(0);
  });

  it('keeps a candidate whose hint is relevant even when its name is not', async () => {
    const out = await enrich([{ repo: 'o/r', kind: 'skill', path: 'x', sourceName: 'marketplace', hint: 'ffmpeg reels' }], fakeGh().gh, {}, TODAY);
    expect(Object.keys(out)).toHaveLength(1);
  });

  it('keeps last run entries for a repo when GitHub fails (rate limit)', async () => {
    const old = makeEntry({ id: 'o/r/r', repo: 'o/r', path: '', firstSeen: '2026-11-01' });
    const { gh } = fakeGh();
    (gh as { getRepo: unknown }).getRepo = async () => { throw new Error('github: repo not found o/r'); };
    const out = await enrich([skill('')], gh, { 'o/r/r': old }, TODAY);
    expect(out['o/r/r']).toEqual(old);
  });

  it('drops archived repos', async () => {
    expect(await enrich([skill('')], fakeGh({ archived: true }).gh, {}, TODAY)).toEqual({});
  });

  it('marks stale when last push is over 365 days ago', async () => {
    const out = await enrich([skill('')], fakeGh({ pushedAt: '2025-10-01T00:00:00Z' }).gh, {}, TODAY);
    expect(Object.values(out)[0].stale).toBe(true);
  });

  it('a plugin swallows the skills inside it', async () => {
    const { gh } = fakeGh({ dirs: { 'skills': ['hook-writer'] }, files: { '.claude-plugin/plugin.json': '{"name":"Reel Kit"}' } });
    const out = await enrich([plugin(''), skill('skills/hook-writer')], gh, {}, TODAY);
    const list = Object.values(out);
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe('plugin');
    expect(list[0].name).toBe('Reel Kit');
    expect(list[0].skills).toEqual(['hook-writer']);
    expect(list[0].id).toBe('o/r/reel-kit');
  });

  it('takes the name from SKILL.md frontmatter and counts entries per repo', async () => {
    const { gh } = fakeGh({ files: { 'a/SKILL.md': '---\nname: Hook Writer\ndescription: drama hooks\n---\nbody', 'b/SKILL.md': '---\nname: Beat Sheet\n---\n' } });
    const out = await enrich([skill('a'), skill('b')], gh, {}, TODAY);
    expect(Object.keys(out).sort()).toEqual(['o/r/beat-sheet', 'o/r/hook-writer']);
    expect(out['o/r/hook-writer'].repoEntryCount).toBe(2);
  });

  it('keeps firstSeen and prior classification from the previous run', async () => {
    const prev = { 'o/r/r': makeEntry({ id: 'o/r/r', repo: 'o/r', firstSeen: '2026-11-01', classification: { relevant: true, confidence: 0.9, stages: ['pacing-edit'], contentTypes: [], oneLiner: 'x', maybe: false, hash: 'h' } }) };
    const out = await enrich([skill('')], fakeGh().gh, prev, TODAY);
    expect(out['o/r/r'].firstSeen).toBe('2026-11-01');
    expect(out['o/r/r'].classification?.oneLiner).toBe('x');
  });

  it('sets hasCode when the plugin ships hooks', async () => {
    const out = await enrich([plugin('')], fakeGh({ dirs: { '': ['hooks', 'README.md'] } }).gh, {}, TODAY);
    expect(Object.values(out)[0].hasCode).toBe(true);
  });

  it('fills digest, install candidates, cost evidence and a hash', async () => {
    const e = Object.values(await enrich([skill('')], fakeGh().gh, {}, TODAY))[0];
    expect(e.digest).toContain('punchy reels');
    expect(e.installCandidates).toContain('/plugin marketplace add o/r');
    expect(e.costEvidence.some((l) => l.includes('ELEVENLABS_API_KEY'))).toBe(true);
    expect(e.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(e.stars).toBe(42);
  });

  it('drops entries the keyword prefilter rejects', async () => {
    expect(await enrich([skill('')], fakeGh({ readme: '# Postgres backup operator for Kubernetes' }).gh, {}, TODAY)).toEqual({});
  });

  it('reuses previous file data when the repo has not been pushed since', async () => {
    const prevEntry = makeEntry({ id: 'o/r/r', name: 'r', slug: 'r', repo: 'o/r', path: '', pushedAt: '2026-11-20T00:00:00Z', digest: 'old digest ffmpeg', inputHash: 'H' });
    const { gh, calls } = fakeGh();
    const out = await enrich([skill('')], gh, { 'o/r/r': prevEntry }, TODAY);
    expect(calls).toEqual([]);
    expect(out['o/r/r'].inputHash).toBe('H');
    expect(out['o/r/r'].stars).toBe(42);
  });
});
