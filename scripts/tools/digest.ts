import { CAPS } from '../lib/types.ts';

const DROP_SECTION = /^#{1,6}\s*(changelog|change log|release notes|license|licence|contributors|contributing|acknowledg\w*|credits|star history|sponsors?)\b/i;
const MAX_CODE_LINES = 15;

/** Cuts a README down to the parts an LLM needs: title, intro, features, install, usage. */
export function digestReadme(md: string, cap = CAPS.digestChars): { text: string; trimmed: boolean } {
  if (!md) return { text: '', trimmed: false };
  let s = md.replace(/\r\n/g, '\n')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Keep short fenced code blocks (install commands), drop long ones.
  s = s.replace(/```[^\n]*\n([\s\S]*?)```/g, (_m, body: string) =>
    body.split('\n').length > MAX_CODE_LINES ? '' : '```\n' + body.trimEnd() + '\n```');

  const out: string[] = [];
  let skipLevel = 0;
  let inCode = false;
  for (const raw of s.split('\n')) {
    let line = raw;
    if (line.startsWith('```')) inCode = !inCode;
    const heading = !inCode && line.match(/^(#{1,6})\s/);
    if (heading) {
      const level = heading[1].length;
      if (skipLevel && level <= skipLevel) skipLevel = 0;
      if (DROP_SECTION.test(line)) { skipLevel = level; continue; }
    }
    if (skipLevel) continue;
    if (!inCode) {
      line = line
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')            // images
        .replace(/\[\s*\]\([^)]*\)/g, '')                 // empty links left by badges
        .replace(/<[^>]+>/g, '');                         // html tags
      if (/^\s*\|/.test(line)) continue;                  // tables
      if (/^\s*[-*+]\s*\[[^\]]*\]\([^)]*\)\s*$/.test(line)) continue; // link-only list items
    }
    out.push(line);
  }
  const text = out.join('\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  return text.length > cap ? { text: text.slice(0, cap), trimmed: true } : { text, trimmed: false };
}
