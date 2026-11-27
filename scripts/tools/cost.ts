const COST_RE = /pric|paid|subscription|credit|api[_ -]?key|\btoken\b|\b[A-Z][A-Z0-9_]{2,}_(KEY|TOKEN|SECRET)\b|licen[cs]e|free tier|\$\d/i;

/** Lines that hint at cost: pricing, credits, API keys, env vars, licence. Max 8, each ≤ 200 chars. */
export function extractCostEvidence(md: string, files: string[]): string[] {
  const out: string[] = [];
  for (const text of [md, ...files]) {
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (line && COST_RE.test(line) && !out.includes(line.slice(0, 200))) out.push(line.slice(0, 200));
      if (out.length >= 8) return out;
    }
  }
  return out;
}
