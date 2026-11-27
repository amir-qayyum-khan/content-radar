import fs from 'node:fs';
import path from 'node:path';
import type { Candidate, Entry } from './types.ts';
import type { NewsItem } from '../news.ts';

type History = Record<string, Record<string, number>>;

function readJson<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, file);
}

export function loadEntries(dir = 'data'): Record<string, Entry> {
  return readJson(path.join(dir, 'entries.json'), {});
}

export function saveEntries(e: Record<string, Entry>, dir = 'data'): void {
  writeJson(path.join(dir, 'entries.json'), e);
}

export function loadHistory(dir = 'data'): History {
  const hdir = path.join(dir, 'history');
  if (!fs.existsSync(hdir)) return {};
  const out: History = {};
  for (const f of fs.readdirSync(hdir).filter((f) => f.endsWith('.json')).sort()) {
    Object.assign(out, readJson<History>(path.join(hdir, f), {}));
  }
  return out;
}

export function saveSnapshot(date: string, stars: Record<string, number>, dir = 'data'): void {
  const file = path.join(dir, 'history', `${date.slice(0, 7)}.json`);
  const month = readJson<History>(file, {});
  month[date] = stars;
  writeJson(file, month);
}

export function saveRaw(date: string, cands: Candidate[], dir = 'data'): void {
  writeJson(path.join(dir, 'raw', `${date}.json`), cands);
}

export type News = { updated: string; items: NewsItem[] };

export function loadNews(dir = 'data'): News {
  return readJson(path.join(dir, 'news.json'), { updated: '', items: [] });
}

export function saveNews(n: News, dir = 'data'): void {
  writeJson(path.join(dir, 'news.json'), n);
}
