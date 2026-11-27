import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { runClaude, UsageLimitError, type Exec } from '../scripts/lib/claude.ts';

const schema = z.object({ x: z.number() });

function fakeExec(outputs: Array<{ code?: number; stdout: string; stderr?: string }>, seen: string[][] = []): Exec & { calls: number } {
  let i = 0;
  const fn = (async (args: string[]) => {
    seen.push(args);
    const o = outputs[Math.min(i++, outputs.length - 1)];
    fn.calls = i;
    return { code: o.code ?? 0, stdout: o.stdout, stderr: o.stderr ?? '' };
  }) as Exec & { calls: number };
  fn.calls = 0;
  return fn;
}

const ok = (so: unknown) => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: JSON.stringify(so), structured_output: so });

describe('runClaude', () => {
  it('returns parsed structured_output', async () => {
    const r = await runClaude({ model: 'haiku', system: 's', prompt: 'p', schema, exec: fakeExec([{ stdout: ok({ x: 1 }) }]) });
    expect(r).toEqual({ x: 1 });
  });

  it('falls back to JSON in result when structured_output missing', async () => {
    const stdout = JSON.stringify({ type: 'result', is_error: false, result: '{"x":2}' });
    expect(await runClaude({ model: 'haiku', system: 's', prompt: 'p', schema, exec: fakeExec([{ stdout }]) })).toEqual({ x: 2 });
  });

  it('passes required flags', async () => {
    const seen: string[][] = [];
    await runClaude({ model: 'haiku', system: 'sys', prompt: 'p', schema, exec: fakeExec([{ stdout: ok({ x: 1 }) }], seen) });
    const a = seen[0];
    for (const f of ['-p', '--tools', '', '--no-session-persistence', '--strict-mcp-config', '--json-schema', '--model', 'haiku', '--output-format', 'json', '--append-system-prompt', 'sys']) {
      expect(a).toContain(f);
    }
    expect(a[a.indexOf('--setting-sources') + 1]).toBe('');
  });

  it('sends a JSON schema without the $schema key (claude CLI rejects it)', async () => {
    const seen: string[][] = [];
    await runClaude({ model: 'haiku', system: 's', prompt: 'p', schema, exec: fakeExec([{ stdout: ok({ x: 1 }) }], seen) });
    const sent = JSON.parse(seen[0][seen[0].indexOf('--json-schema') + 1]);
    expect(sent.$schema).toBeUndefined();
    expect(sent.type).toBe('object');
  });

  it('throws UsageLimitError on usage limit', async () => {
    const stdout = JSON.stringify({ type: 'result', is_error: true, result: 'Claude AI usage limit reached|1764300000' });
    await expect(runClaude({ model: 'haiku', system: 's', prompt: 'p', schema, exec: fakeExec([{ stdout, code: 1 }]) })).rejects.toBeInstanceOf(UsageLimitError);
  });

  it('retries once then throws on invalid output', async () => {
    const exec = fakeExec([{ stdout: JSON.stringify({ type: 'result', is_error: false, result: 'not json' }) }]);
    await expect(runClaude({ model: 'haiku', system: 's', prompt: 'p', schema, exec })).rejects.toThrow(/invalid output/);
    expect(exec.calls).toBe(2);
  });

  it('retries once on schema mismatch then succeeds', async () => {
    const exec = fakeExec([{ stdout: ok({ x: 'nope' }) }, { stdout: ok({ x: 3 }) }]);
    expect(await runClaude({ model: 'sonnet', system: 's', prompt: 'p', schema, exec })).toEqual({ x: 3 });
  });
});
