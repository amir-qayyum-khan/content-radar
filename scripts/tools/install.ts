const CANDIDATE = /^(\/plugin\s|npx\s|npm\s+(i|install)\s|pip\s+install\s|pipx\s+install\s|uv\s+tool\s+install\s|git\s+clone\s|cp\s|xcopy\s|Copy-Item\s|curl\s|wget\s)/;

const ALLOWED = [
  /^\/plugin marketplace add \S+$/,
  /^\/plugin install \S+$/,
  /^git clone https:\/\/github\.com\/\S+$/,
  /^(npx|npm i|npm install|pip install|pipx install|uv tool install) [\w@./:-]+( [\w@./:=-]+)*$/,
  /^(cp|xcopy|Copy-Item) .*\.claude[\\/]skills/,
];
const FORBIDDEN = /[|;`]|&&|\$\(|\bcurl\b|\bwget\b|\biex\b|\bsudo\b|Invoke-Expression/i;

/** Lines in the README that look like install commands, verbatim, de-duplicated. */
export function extractInstall(md: string): string[] {
  const seen = new Set<string>();
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[$>]\s+/, '');
    if (CANDIDATE.test(line)) seen.add(line);
  }
  return [...seen];
}

/**
 * True when a command may be shown on a detail page: it must be on the allowlist and appear
 * verbatim in the README/SKILL.md. Exception: `/plugin marketplace add <repo>` for the entry's own repo.
 */
export function isAllowedInstall(cmd: string, sourceText: string, repo?: string): boolean {
  const c = cmd.trim();
  if (!c || FORBIDDEN.test(c)) return false;
  if (repo && c === `/plugin marketplace add ${repo}`) return true;
  return ALLOWED.some((re) => re.test(c)) && sourceText.includes(c);
}
