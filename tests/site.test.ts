import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { STAGE_LABELS, STAGES } from '../scripts/lib/types.ts';

const DIST = 'dist';
const read = (p: string) => fs.readFileSync(path.join(DIST, p), 'utf8');

function allHtml(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? allHtml(p) : p.endsWith('.html') ? [p] : [];
  });
}

describe('site build', () => {
  beforeAll(() => {
    execSync('npx astro build', { env: { ...process.env, CR_DATA: 'tests/fixtures/data', CR_TODAY: '2026-11-27' }, stdio: 'pipe' });
  }, 180_000);

  it('home lists stage headings in pipeline order', () => {
    const html = read('index.html');
    const positions = STAGES.map((s) => html.indexOf(`id="stage-${s}"`));
    expect(positions.every((p) => p > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html).toContain(STAGE_LABELS['story-script'].replace('&', '&amp;'));
  });

  it('builds a detail page for each entry', () => {
    for (const id of ['hookco/hooks/hook-writer', 'evil/xss/bad', 'old/repo/stale-tool', 'code/runner/runner']) {
      expect(fs.existsSync(path.join(DIST, 'tool', id, 'index.html'))).toBe(true);
    }
  });

  it('builds a page per stage', () => {
    for (const s of STAGES) expect(fs.existsSync(path.join(DIST, 'stage', s, 'index.html'))).toBe(true);
  });

  it('never renders untrusted text as HTML', () => {
    for (const f of allHtml(DIST)) {
      // `<` inside a quoted attribute value is inert; only markup outside attributes matters.
      const html = fs.readFileSync(f, 'utf8').replace(/="[^"]*"/g, '=""');      expect(html, f).not.toContain('<img src=x onerror');
      expect(html, f).not.toContain('Bad <b>name</b>');
    }
    expect(read('tool/evil/xss/bad/index.html')).toContain('&lt;img src=x onerror');
  });

  it('shows coming soon when there is no write-up', () => {
    expect(read('tool/evil/xss/bad/index.html')).toContain('Full guide coming soon');
  });

  it('warns when a tool runs code', () => {
    expect(read('tool/code/runner/runner/index.html')).toContain('Runs code on your machine');
    expect(read('tool/hookco/hooks/hook-writer/index.html')).not.toContain('Runs code on your machine');
  });

  it('quotes cost evidence and shows install commands', () => {
    const html = read('tool/code/runner/runner/index.html');
    expect(html).toContain('ELEVENLABS_API_KEY');
    expect(html).toContain('/plugin marketplace add hookco/hooks');
  });

  it('writes the CNAME', () => {
    expect(read('CNAME').trim()).toBe('content.swiftwf.com');
  });

  it('has no set:html in the source', () => {
    const files = fs.readdirSync('src', { recursive: true }).map(String).filter((f) => /\.(astro|ts)$/.test(f));
    for (const f of files) expect(fs.readFileSync(path.join('src', f), 'utf8'), f).not.toContain('set:html');
  });
});
