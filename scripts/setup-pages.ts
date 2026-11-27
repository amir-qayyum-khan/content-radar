// One-time: point GitHub Pages at the gh-pages branch and set the custom domain.
// Usage: npx tsx scripts/setup-pages.ts
export {}; // module, so top-level await type-checks
const REPO = 'amir-qayyum-khan/content-radar';
const DOMAIN = 'content.swiftwf.com';
const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
if (!token) throw new Error('Set GITHUB_PERSONAL_ACCESS_TOKEN first.');

const api = (method: string, body?: unknown) =>
  fetch(`https://api.github.com/repos/${REPO}/pages`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'content-radar' },
    body: body ? JSON.stringify(body) : undefined,
  });

const created = await api('POST', { source: { branch: 'gh-pages', path: '/' } });
if (created.status !== 201 && created.status !== 409) throw new Error(`enable pages: ${created.status} ${await created.text()}`);
console.log(created.status === 201 ? 'Pages enabled on gh-pages.' : 'Pages already enabled.');

let res = await api('PUT', { cname: DOMAIN, https_enforced: true, source: { branch: 'gh-pages', path: '/' } });
if (!res.ok) {
  res = await api('PUT', { cname: DOMAIN, source: { branch: 'gh-pages', path: '/' } });
  if (!res.ok) throw new Error(`set domain: ${res.status} ${await res.text()}`);
  console.log('Domain set. HTTPS is not enforced yet (certificate pending). Run this again once DNS works.');
} else {
  console.log('Domain set with HTTPS enforced.');
}
const info = await (await api('GET')).json() as { html_url?: string; status?: string };
console.log(`Pages URL: ${info.html_url ?? `https://${DOMAIN}/`} (status: ${info.status ?? 'unknown'})`);
