import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { publish } from '../scripts/publish.ts';

describe('publish', () => {
  it('refuses to publish an empty build', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-dist-'));
    await expect(publish(dir, '2026-11-27', 'https://example/x.git', () => {})).rejects.toThrow(/index.html missing/);
  });

  it('force-pushes gh-pages without a token in the remote URL', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-dist-'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<h1>x</h1>');
    const calls: string[][] = [];
    await publish(dir, '2026-11-27', 'https://github.com/o/r.git', (a) => { calls.push(a); });
    expect(calls[0]).toEqual(['init', '-q', '-b', 'gh-pages']);
    expect(calls.at(-1)).toEqual(['push', '--force', 'https://github.com/o/r.git', 'gh-pages']);
    expect(calls.flat().join(' ')).not.toMatch(/ghp_|github_pat_|@github\.com/);
  });
});
