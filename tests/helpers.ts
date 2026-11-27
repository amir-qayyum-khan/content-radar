import type { Entry } from '../scripts/lib/types.ts';

export function makeEntry(over: Partial<Entry> = {}): Entry {
  return {
    id: 'owner/repo/tool', repo: 'owner/repo', kind: 'skill', path: '', name: 'Tool', slug: 'tool',
    skills: [], hasCode: false, repoEntryCount: 1, firstSeen: '2026-11-27', stale: false, stars: 10,
    license: 'MIT', pushedAt: '2026-11-01T00:00:00Z', inputHash: 'h', digest: 'd',
    installCandidates: [], costEvidence: [], readmeText: '', ...over,
  };
}
