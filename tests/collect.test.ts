import { describe, it, expect } from 'vitest';
import { collect, type GitHub } from '../scripts/collect.ts';

function fakeGh(over: Partial<GitHub>): GitHub {
  return {
    searchCode: async () => [], searchRepos: async () => [], getRepo: async () => { throw new Error('unused'); },
    getReadme: async () => '', getFile: async () => null, listDir: async () => [], ...over,
  } as GitHub;
}

describe('collect', () => {
  it('dedupes the same repo+path from different sources', async () => {
    const gh = fakeGh({
      searchCode: async (q) => (q.includes('SKILL.md') ? [{ repo: 'o/r', path: 'SKILL.md' }] : []),
      searchRepos: async () => [{ repo: 'o/r', description: 'video skills' }],
    });
    const out = await collect(gh);
    expect(out.filter((c) => c.repo === 'o/r' && c.path === '')).toHaveLength(1);
  });

  it('turns SKILL.md hits into skill candidates at the folder path', async () => {
    const gh = fakeGh({ searchCode: async (q) => (q.includes('SKILL.md') ? [{ repo: 'o/r', path: 'skills/hook/SKILL.md' }] : []) });
    expect(await collect(gh)).toContainEqual({ repo: 'o/r', kind: 'skill', path: 'skills/hook', sourceName: 'code-search' });
  });

  it('expands marketplace.json plugins (relative and GitHub sources)', async () => {
    const gh = fakeGh({
      searchCode: async (q) => (q.includes('marketplace.json') ? [{ repo: 'm/market', path: '.claude-plugin/marketplace.json' }] : []),
      getFile: async () => JSON.stringify({ plugins: [
        { name: 'a', source: './plugins/a' },
        { name: 'b', source: { source: 'github', repo: 'x/b' } },
        { name: 'c', source: 'https://github.com/y/c.git' },
        { name: 'd', source: { source: 'url', url: 'https://example.com/d.git' } },
      ] }),
    });
    const out = (await collect(gh)).filter((c) => c.sourceName === 'marketplace');
    expect(out.map(({ hint, ...c }) => c)).toEqual([
      { repo: 'm/market', kind: 'plugin', path: 'plugins/a', sourceName: 'marketplace' },
      { repo: 'x/b', kind: 'plugin', path: '', sourceName: 'marketplace' },
      { repo: 'y/c', kind: 'plugin', path: '', sourceName: 'marketplace' },
    ]);
  });

  it('ignores a malformed marketplace.json', async () => {
    const gh = fakeGh({
      searchCode: async (q) => (q.includes('marketplace.json') ? [{ repo: 'm/market', path: '.claude-plugin/marketplace.json' }] : []),
      getFile: async () => '{ not json',
    });
    expect(await collect(gh)).toEqual([]);
  });

  it('throws when every source fails (network down)', async () => {
    const boom = async () => { throw new TypeError('fetch failed'); };
    await expect(collect(fakeGh({ searchCode: boom, searchRepos: boom }))).rejects.toThrow(/every source failed/);
  });

  it('topic repos with plugin.json become plugins, else skills', async () => {
    const gh = fakeGh({
      searchRepos: async (q) => (q === 'topic:claude-code-plugin' ? [{ repo: 'p/plug', description: 'reel editing plugin' }] : q === 'topic:claude-skills' ? [{ repo: 's/skill', description: 'voice tts' }] : []),
      listDir: async (repo, p) => (repo === 'p/plug' && p === '.claude-plugin' ? ['plugin.json'] : []),
    });
    const out = await collect(gh);
    expect(out).toContainEqual({ repo: 'p/plug', kind: 'plugin', path: '', sourceName: 'topic', hint: 'reel editing plugin' });
    expect(out).toContainEqual({ repo: 's/skill', kind: 'skill', path: '', sourceName: 'topic', hint: 'voice tts' });
  });

  it('keeps the marketplace name and description as a hint', async () => {
    const gh = fakeGh({
      searchCode: async (q) => (q.includes('marketplace.json') ? [{ repo: 'm/market', path: '.claude-plugin/marketplace.json' }] : []),
      getFile: async () => JSON.stringify({ plugins: [{ name: 'reelkit', description: 'Cuts reels', source: './p' }] }),
    });
    expect((await collect(gh))[0].hint).toBe('reelkit Cuts reels');
  });

  it('skips topic repos that look unrelated, without a plugin.json lookup', async () => {
    const looked: string[] = [];
    const gh = fakeGh({
      searchRepos: async (q) => (q === 'topic:claude-skills' ? [{ repo: 'a/db-tools', description: 'Postgres helpers' }] : []),
      listDir: async (repo) => { looked.push(repo); return []; },
    });
    expect(await collect(gh)).toEqual([]);
    expect(looked).toEqual([]);
  });
});
