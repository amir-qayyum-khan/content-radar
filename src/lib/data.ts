import { loadEntries, loadHistory } from '../../scripts/lib/store.ts';
import { rank, type Ranked } from '../../scripts/rank.ts';
import { todayPKT, formatPKT } from '../../scripts/lib/time.ts';
import type { CostLabel } from '../../scripts/lib/types.ts';

export type { Ranked };
type History = Record<string, Record<string, number>>;

let cache: (ReturnType<typeof rank> & { history: History; today: string; updated: string }) | null = null;

export function getSiteData() {
  if (cache) return cache;
  const dir = process.env.CR_DATA ?? 'data';
  const today = process.env.CR_TODAY ?? todayPKT();
  const history = loadHistory(dir);
  cache = { ...rank(loadEntries(dir), history, today), history, today, updated: formatPKT(new Date()) };
  return cache;
}

export const COST_TEXT: Record<CostLabel, string> = {
  'free': 'Free',
  'needs-paid-service': 'Needs paid service',
  'freemium': 'Freemium',
  'paid': 'Paid',
  'unknown': 'Cost unknown',
};

export const TYPE_TEXT: Record<string, string> = {
  'micro-drama': 'Micro drama',
  'cinematic': 'Cinematic',
  'reels-shorts': 'Reels & shorts',
  'documentary': 'Documentary',
  'animation': 'Animation',
  'podcast-audio': 'Podcast & audio',
};

export const STAGE_WHY: Record<string, string> = {
  'story-script': 'Hooks, beat sheets, cliffhangers and dialogue that keep viewers watching.',
  'pacing-edit': 'Cut timing, shot variety and transitions, including ffmpeg and Remotion.',
  'voice-emotion': 'Text to speech, voice acting, lip-sync and dubbing.',
  'music-sfx': 'Score, stings, sound effects and mixing.',
  'review-qc': 'Continuity checks and clip scoring, so review takes less of your time.',
  'visual-generation': 'Video and image generation, character consistency and storyboards.',
  'captions-publish': 'Subtitles, thumbnails, platform formats and scheduling.',
  'other': 'Related to video or audio, but outside the stages above.',
};

export const costOf = (r: Ranked): CostLabel => r.detail?.cost.label ?? 'unknown';
export const toolUrl = (r: Ranked) => `/tool/${r.id}/`;

export function fmtNum(n: number): string {
  return n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n);
}

export function ago(iso: string, today: string): string {
  const days = Math.max(0, Math.round((new Date(today).getTime() - new Date(iso).getTime()) / 86_400_000));
  if (days === 0) return 'today';
  if (days < 31) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${(days / 365).toFixed(1).replace(/\.0$/, '')}y ago`;
}

/** Star counts for the last `days` snapshots of a repo, oldest first. */
export function sparkPoints(history: History, repo: string, days = 30): number[] {
  return Object.keys(history).sort().filter((d) => history[d][repo] !== undefined).slice(-days).map((d) => history[d][repo]);
}
