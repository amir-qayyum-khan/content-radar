import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';

export class UsageLimitError extends Error {}

export type Exec = (args: string[], stdin: string, cwd: string) => Promise<{ code: number; stdout: string; stderr: string }>;

const LIMIT_RE = /usage limit|rate limit|limit reached|\b429\b/i;
const TIMEOUT_MS = 5 * 60 * 1000;

// No shell: args include "" and raw JSON, which cmd.exe quoting would mangle.
const defaultExec: Exec = (args, stdin, cwd) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.env.CLAUDE_BIN ?? 'claude', args, { cwd, windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? 1, stdout, stderr }); });
    child.stdin.on('error', () => {}); // CLI may exit before reading (bad args, limit); close handles it
    child.stdin.end(stdin);
  });

export async function runClaude<T>(opts: {
  model: 'haiku' | 'sonnet'; system: string; prompt: string; schema: z.ZodType<T>; exec?: Exec;
}): Promise<T> {
  const exec = opts.exec ?? defaultExec;
  // The CLI's validator can't resolve the draft-2020-12 $schema URI, so drop it.
  const { $schema: _drop, ...jsonSchema } = z.toJSONSchema(opts.schema) as Record<string, unknown>;
  const args = [
    '-p', '--model', opts.model, '--output-format', 'json',
    '--json-schema', JSON.stringify(jsonSchema),
    '--tools', '', '--no-session-persistence', '--strict-mcp-config', '--setting-sources', '',
    '--append-system-prompt', opts.system,
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-'));
    let out: Awaited<ReturnType<Exec>>;
    try {
      out = await exec(args, opts.prompt, cwd);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
    let env: { is_error?: boolean; result?: string; structured_output?: unknown } | null = null;
    try { env = JSON.parse(out.stdout); } catch { /* not an envelope */ }
    const errText = `${env?.result ?? ''} ${out.stderr}`;
    if ((env?.is_error || out.code !== 0) && LIMIT_RE.test(errText)) throw new UsageLimitError(errText.trim().slice(0, 200));
    if (env && !env.is_error) {
      let value: unknown = env.structured_output;
      if (value === undefined) { try { value = JSON.parse(env.result ?? ''); } catch { value = undefined; } }
      const parsed = opts.schema.safeParse(value);
      if (parsed.success) return parsed.data;
    }
  }
  throw new Error('claude: invalid output');
}
