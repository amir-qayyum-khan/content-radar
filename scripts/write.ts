import { z } from 'zod';
import { COST_LABELS, type Detail, type Entry } from './lib/types.ts';
import { runClaude, UsageLimitError } from './lib/claude.ts';
import { isAllowedInstall } from './tools/install.ts';
import { SYSTEM, fence } from './prompts.ts';
import { queueOrder } from './classify.ts';

const schema = z.object({
  summary: z.string(),
  install: z.array(z.string()),
  usage: z.object({ prompt: z.string(), expect: z.string() }),
  pipelineFit: z.string(),
  cost: z.object({ label: z.enum(COST_LABELS), services: z.array(z.string()), evidence: z.string() }),
  flowchart: z.string().nullable(),
});

/** Pattern check in place of a Mermaid parse (needs a DOM); the page also hides charts that fail to render. */
export function isSafeFlowchart(src: string): boolean {
  const lines = src.trim().split(/\r?\n/);
  if (lines[0]?.trim() !== 'flowchart TD') return false;
  if (/click|<|>\s*>|%%\{|javascript:|href|@\{/i.test(src.replace(/-->|---|-\.->|==>/g, ''))) return false;
  const nodes = new Set([...src.matchAll(/([A-Za-z]\w*)\s*[\[({]/g)].map((m) => m[1]));
  return nodes.size <= 12;
}

function checkCost(raw: z.infer<typeof schema>['cost'], e: Entry): Detail['cost'] {
  const unknown: Detail['cost'] = { label: 'unknown', services: [], evidence: '' };
  const quoted = raw.evidence.trim() !== '' && e.costEvidence.some((l) => l.includes(raw.evidence.trim()));
  if (raw.evidence.trim() && !quoted) return unknown;
  if (raw.label === 'free' && !quoted && !e.license) return unknown;
  if (raw.label !== 'free' && raw.label !== 'unknown' && !quoted) return unknown;
  return { label: raw.label, services: raw.services, evidence: quoted ? raw.evidence.trim() : '' };
}

function fallbackInstall(e: Entry): string[] {
  return e.kind === 'plugin' ? [`/plugin marketplace add ${e.repo}`] : [`git clone https://github.com/${e.repo}`];
}

export async function write(entries: Record<string, Entry>, opts: { cap: number; run?: typeof runClaude; log: (s: string) => void }): Promise<{ done: number; stoppedByLimit: boolean }> {
  const run = opts.run ?? runClaude;
  const work = Object.values(entries)
    .filter((e) => e.classification?.relevant && (!e.detail || e.detail.hash !== e.inputHash))
    .sort(queueOrder)
    .slice(0, opts.cap);
  let done = 0;
  for (const e of work) {
    const prompt = [
      `Write a practical guide for the ${e.kind} "${e.name}" (GitHub ${e.repo}${e.path ? `, folder ${e.path}` : ''}).`,
      e.skills.length ? `Skills inside this plugin: ${e.skills.join(', ')}.` : '',
      'Fields:',
      '- summary: 2-3 plain sentences on what it does.',
      '- install: ordered commands, chosen ONLY from the candidate commands below, or the standard `/plugin marketplace add <owner/repo>` / `/plugin install <name>@<marketplace>`. Never invent commands.',
      '- usage.prompt: one example request to Claude; usage.expect: what the user gets back.',
      '- pipelineFit: which step of the creator pipeline it slots after and what it improves.',
      '- cost.label: free (open source, no paid service), needs-paid-service (needs a paid API or credits; name them in services), freemium, paid (the tool itself is sold), or unknown. cost.evidence: copy one evidence line below exactly, or "" if none. Never guess free.',
      '- flowchart: Mermaid "flowchart TD" with at most 10 nodes showing how it works, or null.',
      `Candidate install commands:\n${e.installCandidates.map((c) => `- ${fence(c)}`).join('\n') || '- (none found)'}`,
      `Cost evidence lines:\n${e.costEvidence.map((c) => `- ${fence(c)}`).join('\n') || '- (none found)'}`,
      `License: ${e.license ?? 'none stated'}`,
      `<readme>\n${fence(e.digest)}\n</readme>`,
    ].filter(Boolean).join('\n');
    let res: z.infer<typeof schema>;
    try {
      res = await run({ model: 'sonnet', system: SYSTEM, prompt, schema });
    } catch (err) {
      if (err instanceof UsageLimitError) { opts.log(`write: usage limit reached after ${done}`); return { done, stoppedByLimit: true }; }
      opts.log(`write: ${e.id} failed: ${(err as Error).message}`);
      continue;
    }
    const install = res.install.map((c) => c.trim()).filter((c) => isAllowedInstall(c, e.readmeText, e.repo));
    e.detail = {
      summary: res.summary,
      install: install.length ? [...new Set(install)] : fallbackInstall(e),
      usage: res.usage,
      pipelineFit: res.pipelineFit,
      cost: checkCost(res.cost, e),
      flowchart: res.flowchart && isSafeFlowchart(res.flowchart) ? res.flowchart.trim() : null,
      hash: e.inputHash,
    };
    done++;
  }
  opts.log(`write: ${done} written`);
  return { done, stoppedByLimit: false };
}
