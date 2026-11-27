import fs from 'node:fs';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { CAPS, type Candidate, type Entry } from './lib/types.ts';
import { createGitHub } from './lib/github.ts';
import { loadEntries, saveEntries, saveSnapshot, saveRaw, saveNews } from './lib/store.ts';
import { fetchNews } from './news.ts';
import { todayPKT } from './lib/time.ts';
import { collect } from './collect.ts';
import { enrich } from './enrich.ts';
import { classify } from './classify.ts';
import { write } from './write.ts';
import { publish } from './publish.ts';

type Step = (e: Record<string, Entry>, o: { cap: number; log: (s: string) => void; checkpoint?: () => void }) => Promise<{ done: number; stoppedByLimit: boolean }>;

export interface Deps {
  collect: () => Promise<Candidate[]>;
  enrich: (c: Candidate[], prev: Record<string, Entry>, today: string) => Promise<Record<string, Entry>>;
  classify: Step;
  write: Step;
  loadEntries: () => Record<string, Entry>;
  saveEntries: (e: Record<string, Entry>) => void;
  saveSnapshot: (date: string, stars: Record<string, number>) => void;
  saveRaw: (date: string, c: Candidate[]) => void;
  /** Refresh data/news.json; may throw, never stops the run. */
  news: () => Promise<void>;
  build: () => Promise<void>;
  publish: () => Promise<void>;
  commitData: (today: string) => Promise<void>;
  notify: (msg: string) => void;
  log: (s: string) => void;
}

function defaultDeps(today: string): Deps {
  fs.mkdirSync('logs', { recursive: true });
  const logFile = path.join('logs', `${today}.log`);
  const log = (s: string) => {
    const line = `${new Date().toISOString()} ${s}`;
    console.log(line);
    fs.appendFileSync(logFile, line + '\n');
  };
  const gh = createGitHub({ log });
  return {
    collect: () => collect(gh, log),
    enrich: (c, prev, t) => enrich(c, gh, prev, t, log),
    classify: (e, o) => classify(e, o),
    write: (e, o) => write(e, o),
    loadEntries: () => loadEntries(),
    saveEntries: (e) => saveEntries(e),
    saveSnapshot: (d, s) => saveSnapshot(d, s),
    saveRaw: (d, c) => saveRaw(d, c),
    news: async () => {
      const r = await fetchNews({ log });
      log(`news: ${r.items.length} stories from ${r.okSources} source(s)`);
      // Every source down: keep yesterday's list.
      if (r.okSources > 0) saveNews({ updated: new Date().toISOString(), items: r.items });
    },
    build: async () => { execSync('npm run build', { stdio: 'pipe', env: { ...process.env, CR_TODAY: today } }); },
    publish: () => publish('dist', today),
    commitData: async (t) => {
      execFileSync('git', ['add', 'data']);
      try { execFileSync('git', ['diff', '--cached', '--quiet']); } catch { execFileSync('git', ['commit', '-q', '-m', `chore(data): nightly ${t}`]); }
    },
    notify: (msg) => {
      try { execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/notify.ps1', msg]); } catch { /* best effort */ }
    },
    log,
  };
}

export async function nightly(opts: { backfill: boolean; deps?: Partial<Deps>; today?: string }): Promise<{ ok: boolean; published: boolean }> {
  const today = opts.today ?? todayPKT();
  const d: Deps = { ...defaultDeps(today), ...opts.deps } as Deps;
  const caps = opts.backfill ? { classify: Infinity, write: Infinity } : { classify: CAPS.classify, write: CAPS.write };
  const fail = (step: string, e: unknown) => {
    const msg = `Content Radar ${step} failed: ${(e as Error).message}`.slice(0, 240);
    d.log(msg);
    d.notify(msg);
  };

  let entries: Record<string, Entry>;
  let cands: Candidate[];
  try {
    d.log(`nightly ${today} start${opts.backfill ? ' (backfill)' : ''}`);
    cands = await d.collect();
    d.log(`collect: ${cands.length} candidates`);
    if (cands.length === 0) throw new Error('search returned nothing (token or GitHub problem?)');
    const prev = d.loadEntries();
    entries = await d.enrich(cands, prev, today);
    const before = Object.keys(prev).length;
    const after = Object.keys(entries).length;
    d.log(`enrich: ${after} entries`);
    // Guard against a partial outage wiping the list: keep yesterday's data and site.
    if (after < before / 2) throw new Error(`only ${after} tools found vs ${before} last run`);
  } catch (e) { fail('collect', e); return { ok: false, published: false }; }

  try {
    const checkpoint = () => d.saveEntries(entries);
    checkpoint(); // the run can be killed later; never lose the enrich work
    // A usage limit is not a failure: keep what finished and still publish.
    const c = await d.classify(entries, { cap: caps.classify, log: d.log, checkpoint });
    if (!c.stoppedByLimit) await d.write(entries, { cap: caps.write, log: d.log, checkpoint });
    checkpoint();
    const stars: Record<string, number> = {};
    for (const e of Object.values(entries)) stars[e.repo] = e.stars;
    d.saveSnapshot(today, stars);
    d.saveRaw(today, cands);
  } catch (e) { fail('save', e); return { ok: false, published: false }; }

  // News is a side page: a failure is logged only, never stops publishing.
  try { await d.news(); } catch (e) { d.log(`news: ${(e as Error).message}`); }

  let published = false;
  try {
    await d.build();
    d.log('build: ok');
    await d.publish();
    published = true;
    d.log('publish: ok');
  } catch (e) { fail(published ? 'publish' : 'build/publish', e); }

  try { await d.commitData(today); } catch (e) { d.log(`commitData: ${(e as Error).message}`); }
  d.log(`nightly ${today} done (published: ${published})`);
  return { ok: published, published };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  nightly({ backfill: process.argv.includes('--backfill') }).then((r) => process.exit(r.ok ? 0 : 1));
}
