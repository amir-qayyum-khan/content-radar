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
      searchRepos: async () => ['o/r'],
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
    expect(out).toEqual([
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
      searchRepos: async (q) => (q === 'topic:claude-code-plugin' ? ['p/plug'] : q === 'topic:claude-skills' ? ['s/skill'] : []),
      listDir: async (repo, p) => (repo === 'p/plug' && p === '.claude-plugin' ? ['plugin.json'] : []),
    });
    const out = await collect(gh);
    expect(out).toContainEqual({ repo: 'p/plug', kind: 'plugin', path: '', sourceName: 'topic' });
    expect(out).toContainEqual({ repo: 's/skill', kind: 'skill', path: '', sourceName: 'topic' });
  });
});
