import { describe, it, expect } from 'vitest';
import { classify } from '../scripts/classify.ts';
import { UsageLimitError } from '../scripts/lib/claude.ts';
import type { Entry } from '../scripts/lib/types.ts';
import { makeEntry } from './helpers.ts';

function entries(n: number): Record<string, Entry> {
  const out: Record<string, Entry> = {};
  for (let i = 0; i < n; i++) out[`o/r/t${i}`] = makeEntry({ id: `o/r/t${i}`, slug: `t${i}`, stars: 100 - i, inputHash: `h${i}` });
  return out;
}

type Item = { id: string; relevant: boolean; confidence: number; stages: string[]; contentTypes: string[]; oneLiner: string };

/** Fake runClaude: answers each sent item with `answer(id)`. */
function fakeRun(answer: (id: string) => Partial<Item> = () => ({})) {
  const calls: string[] = [];
  const run = (async ({ prompt }: { prompt: string }) => {
    calls.push(prompt);
    const ids = [...prompt.matchAll(/<item id="([^"]+)"/g)].map((m) => m[1]);
    return { items: ids.map((id) => ({ id, relevant: true, confidence: 0.9, stages: ['pacing-edit'], contentTypes: ['reels-shorts'], oneLiner: 'Cuts reels', ...answer(id) })) };
  }) as any;
  return { run, calls };
}

const log = () => {};

describe('classify', () => {
  it('sends batches of 10', async () => {
    const { run, calls } = fakeRun();
    const e = entries(25);
    const r = await classify(e, { cap: 200, run, log });
    expect(calls).toHaveLength(3);
    expect(r.done).toBe(25);
    expect(e['o/r/t0'].classification?.stages).toEqual(['pacing-edit']);
    expect(e['o/r/t0'].classification?.hash).toBe('h0');
  });

  it('respects the cap', async () => {
    const { run, calls } = fakeRun();
    await classify(entries(25), { cap: 10, run, log });
    expect(calls).toHaveLength(1);
  });

  it('remembers irrelevant entries and flags low confidence as maybe', async () => {
    const { run } = fakeRun((id) => (id === 'o/r/t0' ? { relevant: false } : id === 'o/r/t1' ? { confidence: 0.4 } : {}));
    const e = entries(3);
    await classify(e, { cap: 200, run, log });
    expect(e['o/r/t0'].classification).toMatchObject({ relevant: false, hash: 'h0' });
    expect(e['o/r/t1'].classification?.maybe).toBe(true);
    expect(e['o/r/t2'].classification?.maybe).toBe(false);
  });

  it('does not re-classify a rejected entry whose hash is unchanged', async () => {
    const e = entries(1);
    e['o/r/t0'].classification = { relevant: false, confidence: 1, stages: ['other'], contentTypes: [], oneLiner: '', maybe: false, hash: 'h0' };
    const { run, calls } = fakeRun();
    await classify(e, { cap: 200, run, log });
    expect(calls).toHaveLength(0);
  });

  it('calls checkpoint after each batch', async () => {
    let n = 0;
    await classify(entries(25), { cap: 200, run: fakeRun().run, log, checkpoint: () => { n++; } });
    expect(n).toBe(3);
  });

  it('skips entries whose hash is unchanged', async () => {
    const e = entries(2);
    for (const x of Object.values(e)) x.classification = { relevant: true, confidence: 1, stages: ['other'], contentTypes: [], oneLiner: 'x', maybe: false, hash: x.inputHash };
    const { run, calls } = fakeRun();
    await classify(e, { cap: 200, run, log });
    expect(calls).toHaveLength(0);
  });

  it('stops on usage limit and keeps earlier results', async () => {
    let n = 0;
    const inner = fakeRun().run;
    const run = (async (o: any) => { if (n++ === 1) throw new UsageLimitError('limit'); return inner(o); }) as any;
    const e = entries(25);
    const r = await classify(e, { cap: 200, run, log });
    expect(r.stoppedByLimit).toBe(true);
    expect(r.done).toBe(10);
    expect(e['o/r/t0'].classification).toBeDefined();
  });

  it('ignores ids the model invents', async () => {
    const run = (async () => ({ items: [{ id: 'evil/x/y', relevant: true, confidence: 1, stages: ['other'], contentTypes: [], oneLiner: 'x' }] })) as any;
    const e = entries(1);
    await classify(e, { cap: 200, run, log });
    expect(e['evil/x/y']).toBeUndefined();
  });

  it('wraps untrusted text in readme tags', async () => {
    const { run, calls } = fakeRun();
    await classify(entries(1), { cap: 200, run, log });
    expect(calls[0]).toContain('<readme>');
  });

  it('puts non-stale entries first', async () => {
    const e = entries(12);
    e['o/r/t0'].stale = true;
    const { run, calls } = fakeRun();
    await classify(e, { cap: 10, run, log });
    expect(calls[0]).not.toContain('id="o/r/t0"');
  });
});
