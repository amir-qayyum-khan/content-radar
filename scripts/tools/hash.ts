import { createHash } from 'node:crypto';

/** sha256 over the parts, length-prefixed so ('ab','') and ('a','b') differ. */
export function inputHash(...parts: string[]): string {
  const h = createHash('sha256');
  for (const p of parts) h.update(`${p.length}:`).update(p);
  return h.digest('hex');
}
