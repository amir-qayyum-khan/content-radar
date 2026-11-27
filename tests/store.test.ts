import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadEntries, saveEntries, loadHistory, saveSnapshot, saveRaw } from '../scripts/lib/store.ts';
import { makeEntry } from './helpers.ts';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-store-')); });

describe('store', () => {
  it('loadEntries on empty dir returns {}', () => {
    expect(loadEntries(dir)).toEqual({});
  });

  it('saveEntries then loadEntries round-trips an Entry', () => {
    const e = makeEntry();
    saveEntries({ [e.id]: e }, dir);
    expect(loadEntries(dir)).toEqual({ [e.id]: e });
  });

  it('snapshots are stored per month and merged on load', () => {
    saveSnapshot('2026-11-27', { 'a/b': 5 }, dir);
    saveSnapshot('2026-12-01', { 'a/b': 9 }, dir);
    expect(loadHistory(dir)).toEqual({ '2026-11-27': { 'a/b': 5 }, '2026-12-01': { 'a/b': 9 } });
    expect(fs.existsSync(path.join(dir, 'history', '2026-11.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'history', '2026-12.json'))).toBe(true);
  });

  it('saveRaw writes raw/YYYY-MM-DD.json', () => {
    saveRaw('2026-11-27', [{ repo: 'a/b', kind: 'skill', path: '', sourceName: 'x' }], dir);
    expect(fs.existsSync(path.join(dir, 'raw', '2026-11-27.json'))).toBe(true);
  });
});
