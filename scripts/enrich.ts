import type { Candidate, Entry, RepoStats } from './lib/types.ts';
import { CAPS } from './lib/types.ts';
import type { GitHub } from './lib/github.ts';
import { digestReadme } from './tools/digest.ts';
import { extractInstall } from './tools/install.ts';
import { extractCostEvidence } from './tools/cost.ts';
import { prefilter } from './tools/prefilter.ts';
import { inputHash } from './tools/hash.ts';

const CODE_EXT = /\.(py|js|mjs|cjs|ts|sh|ps1|bat|cmd)$/i;
const join = (...p: string[]) => p.filter(Boolean).join('/');
const kebab = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tool';

function frontmatterName(md: string | null): string | null {
  const fm = md?.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const name = fm?.[1].match(/^name:\s*["']?(.+?)["']?\s*$/m)?.[1];
  return name ?? null;
}

type FileData = Pick<Entry, 'name' | 'skills' | 'hasCode' | 'digest' | 'installCandidates' | 'costEvidence' | 'readmeText' | 'inputHash'>;

async function fetchFiles(c: Candidate, gh: GitHub, readme: string): Promise<FileData> {
  const listing = await gh.listDir(c.repo, c.path);
  let name: string | null = null;
  let own = '';
  let skills: string[] = [];
  let hasCode = listing.some((n) => n === 'hooks' || n === 'hooks.json' || n === 'scripts' || CODE_EXT.test(n));
  if (c.kind === 'plugin') {
    const pj = await gh.getFile(c.repo, join(c.path, '.claude-plugin/plugin.json'));
    try { name = pj ? JSON.parse(pj).name ?? null : null; } catch { name = null; }
    own = pj ?? '';
    skills = await gh.listDir(c.repo, join(c.path, 'skills'));
  } else {
    own = (await gh.getFile(c.repo, join(c.path, 'SKILL.md'))) ?? '';
    name = frontmatterName(own);
  }
  const fallback = c.path ? c.path.split('/').pop()! : c.repo.split('/')[1];
  const text = `${readme}\n\n${own}`;
  return {
    name: name ?? fallback,
    skills,
    hasCode,
    digest: digestReadme(`${own}\n\n${readme}`, CAPS.digestChars).text,
    installCandidates: extractInstall(text),
    costEvidence: extractCostEvidence(readme, [own]),
    readmeText: text,
    inputHash: inputHash(readme, own),
  };
}

/** Turns candidates into entries: one per installable unit, with stats, digests and stale/archive rules. */
export async function enrich(cands: Candidate[], gh: GitHub, prev: Record<string, Entry>, today: string, log: (s: string) => void = () => {}): Promise<Record<string, Entry>> {
  // A skill inside a plugin of the same repo is listed on the plugin's page, not on its own.
  const plugins = cands.filter((c) => c.kind === 'plugin');
  const units = cands.filter((c) => c.kind === 'plugin' || !plugins.some((p) => p.repo === c.repo && (p.path === '' || c.path === p.path || c.path.startsWith(p.path + '/'))));

  const byRepo = new Map<string, Candidate[]>();
  for (const c of units) byRepo.set(c.repo, [...(byRepo.get(c.repo) ?? []), c]);

  const prevList = Object.values(prev);
  const staleBefore = new Date(today).getTime() - CAPS.staleDays * 86_400_000;
  const out: Record<string, Entry> = {};

  for (const [repo, list] of byRepo) {
    let stats: Omit<RepoStats, 'readme'>;
    try { stats = await gh.getRepo(repo); } catch (e) { log(`enrich: ${repo}: ${(e as Error).message}`); continue; }
    if (stats.archived) continue;
    let readme: string | null = null;
    const made: Entry[] = [];
    for (const c of list) {
      const old = prevList.find((p) => p.repo === repo && p.path === c.path && p.kind === c.kind);
      let files: FileData;
      if (old && old.pushedAt === stats.pushedAt) {
        files = old;
      } else {
        try {
          readme ??= await gh.getReadme(repo);
          files = await fetchFiles(c, gh, readme);
        } catch (e) { log(`enrich: ${repo}/${c.path}: ${(e as Error).message}`); continue; }
      }
      if (!prefilter(`${files.name}\n${files.digest}`).keep) continue;
      let slug = kebab(files.name);
      while (made.some((m) => m.slug === slug)) slug += '-2';
      const id = `${repo}/${slug}`;
      const before = prev[id] ?? old;
      made.push({
        id, repo, kind: c.kind, path: c.path, slug,
        name: files.name, skills: files.skills, hasCode: files.hasCode, digest: files.digest,
        installCandidates: files.installCandidates, costEvidence: files.costEvidence, readmeText: files.readmeText, inputHash: files.inputHash,
        repoEntryCount: 0, firstSeen: before?.firstSeen ?? today,
        stale: new Date(stats.pushedAt).getTime() < staleBefore,
        stars: stats.stars, license: stats.license, pushedAt: stats.pushedAt,
        classification: before?.classification, detail: before?.detail,
      });
    }
    for (const m of made) out[m.id] = { ...m, repoEntryCount: made.length };
  }
  return out;
}
