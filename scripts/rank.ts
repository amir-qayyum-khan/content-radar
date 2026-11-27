import { STAGES, type Entry, type Stage } from './lib/types.ts';

type History = Record<string, Record<string, number>>;

const daysBefore = (date: string, n: number) => new Date(new Date(date).getTime() - n * 86_400_000).toISOString().slice(0, 10);

/** Star change over the last 7 days, using whatever snapshots exist in that window. */
export function trending(repo: string, history: History, today: string): number {
  const from = daysBefore(today, 7);
  const days = Object.keys(history).filter((d) => d >= from && d <= today && history[d][repo] !== undefined).sort();
  if (days.length < 2) return 0;
  return history[days[days.length - 1]][repo] - history[days[0]][repo];
}

export interface Ranked extends Entry { trend7d: number; isNew: boolean }

export function rank(entries: Record<string, Entry>, history: History, today: string): { byStage: Record<Stage, Ranked[]>; newThisWeek: Ranked[]; all: Ranked[] } {
  const weekAgo = daysBefore(today, 7);
  const all: Ranked[] = Object.values(entries)
    .filter((e) => e.classification?.relevant)
    .map((e) => ({ ...e, trend7d: trending(e.repo, history, today), isNew: e.firstSeen >= weekAgo }));
  const order = (a: Ranked, b: Ranked) => Number(a.stale) - Number(b.stale) || b.trend7d - a.trend7d || b.stars - a.stars;
  all.sort(order);

  const byStage = Object.fromEntries(STAGES.map((s) => [s, [] as Ranked[]])) as Record<Stage, Ranked[]>;
  for (const r of all) {
    const stages: Stage[] = r.classification!.maybe ? ['other'] : r.classification!.stages;
    for (const s of new Set(stages)) byStage[s].push(r);
  }
  const newThisWeek = all.filter((r) => r.isNew).sort((a, b) => b.stars - a.stars).slice(0, 12);
  return { byStage, newThisWeek, all };
}
