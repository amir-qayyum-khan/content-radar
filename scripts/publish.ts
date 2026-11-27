import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const REMOTE = 'https://github.com/amir-qayyum-khan/content-radar.git';

/**
 * Force-pushes the built site to the gh-pages branch. Auth comes from the owner's git
 * credential manager; the token never goes in the URL.
 */
export async function publish(distDir: string, today: string, remote = REMOTE, git: (args: string[], cwd: string) => void = (a, cwd) => { execFileSync('git', a, { cwd, stdio: 'pipe' }); }): Promise<void> {
  if (!fs.existsSync(path.join(distDir, 'index.html'))) throw new Error(`publish: ${distDir}/index.html missing`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-pages-'));
  try {
    fs.cpSync(distDir, tmp, { recursive: true });
    fs.writeFileSync(path.join(tmp, '.nojekyll'), '');
    git(['init', '-q', '-b', 'gh-pages'], tmp);
    git(['add', '-A'], tmp);
    git(['-c', 'user.name=content-radar', '-c', 'user.email=content-radar@users.noreply.github.com', 'commit', '-q', '-m', `deploy ${today}`], tmp);
    git(['push', '--force', remote, 'gh-pages'], tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
