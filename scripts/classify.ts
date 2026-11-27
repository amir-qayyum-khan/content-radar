import { z } from 'zod';
import { CAPS, CONTENT_TYPES, STAGES, type Entry } from './lib/types.ts';
import { runClaude, UsageLimitError } from './lib/claude.ts';
import { prefilter } from './tools/prefilter.ts';
import { SYSTEM, fence, attr } from './prompts.ts';

const schema = z.object({
  items: z.array(z.object({
    id: z.string(),
    relevant: z.boolean(),
    confidence: z.number().min(0).max(1),
    stages: z.array(z.enum(STAGES)),
    contentTypes: z.array(z.enum(CONTENT_TYPES)),
    oneLiner: z.string(),
  })),
});

/** Non-stale entries by stars first, then stale ones. */
export function queueOrder(a: Entry, b: Entry): number {
  return Number(a.stale) - Number(b.stale) || b.stars - a.stars;
}

export async function classify(entries: Record<string, Entry>, opts: { cap: number; run?: typeof runClaude; log: (s: string) => void }): Promise<{ done: number; stoppedByLimit: boolean }> {
  const run = opts.run ?? runClaude;
  const work = Object.values(entries)
    .filter((e) => !e.classification || e.classification.hash !== e.inputHash)
    .sort(queueOrder)
    .slice(0, opts.cap);
  let done = 0;
  for (let i = 0; i < work.length; i += CAPS.classifyBatch) {
    const batch = work.slice(i, i + CAPS.classifyBatch);
    const prompt = 'Classify each item below. For every item return its id, whether it is relevant to video or audio content creation, your confidence (0-1), its pipeline stages (most fitting first), content types, and a one-line plain description (max 120 characters).\n\n'
      + batch.map((e) => `<item id="${attr(e.id)}" name="${attr(e.name)}" guess="${prefilter(e.digest).stageGuess}">\n<readme>\n${fence(e.digest.slice(0, 1500))}\n</readme>\n</item>`).join('\n');
    let res: z.infer<typeof schema>;
    try {
      res = await run({ model: 'haiku', system: SYSTEM, prompt, schema });
    } catch (e) {
      if (e instanceof UsageLimitError) { opts.log(`classify: usage limit reached after ${done}`); return { done, stoppedByLimit: true }; }
      opts.log(`classify: batch failed: ${(e as Error).message}`);
      continue;
    }
    const sent = new Set(batch.map((e) => e.id));
    for (const it of res.items) {
      if (!sent.has(it.id) || !entries[it.id]) continue;
      if (!it.relevant) { delete entries[it.id]; done++; continue; }
      entries[it.id].classification = {
        relevant: true,
        confidence: it.confidence,
        stages: it.stages.length ? [...new Set(it.stages)] : ['other'],
        contentTypes: [...new Set(it.contentTypes)],
        oneLiner: it.oneLiner.slice(0, 120),
        maybe: it.confidence < CAPS.maybeBelow,
        hash: entries[it.id].inputHash,
      };
      done++;
    }
  }
  opts.log(`classify: ${done} classified`);
  return { done, stoppedByLimit: false };
}
