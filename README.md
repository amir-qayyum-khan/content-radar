# Content Radar

A daily list of Claude skills and plugins for video and audio creators, served at
https://content.swiftwf.com. Everything runs on this PC. Only the built site is pushed to
the `gh-pages` branch of `amir-qayyum-khan/content-radar`.

## Daily run

Windows Task Scheduler runs `npm run nightly` at 04:00 every day (task `ContentRadarNightly`).
If the PC was off, the task runs as soon as you next sign in.

Each run:

1. Searches GitHub for skills and plugins.
2. Refreshes stars and READMEs.
3. Uses Claude Code (Haiku) to sort new tools into stages.
4. Uses Claude Code (Sonnet) to write detail pages.
5. Builds the site and pushes it.

Caps per run: 200 tools sorted and 60 detail pages written. If Claude Code hits your usage
limit, the run keeps what finished and still publishes the site.

## Commands

| Task | Command |
|---|---|
| Run the update now | `npm run nightly` |
| Write every missing detail page (no caps) | `npm run nightly -- --backfill` |
| Preview the site locally | `npm run build` then `npx astro preview` |
| Run the tests | `npm test` |
| Re-create the 04:00 task | `powershell -ExecutionPolicy Bypass -File scripts\register-task.ps1` |
| Set up GitHub Pages and the domain | `npx tsx scripts/setup-pages.ts` |

## Where things are

- `data/`: tool list, daily star snapshots, raw search results. This is committed to the local git repo only.
- `logs/YYYY-MM-DD.log`: what each run did. `logs/scheduler.log` holds the task's console output.
- A Windows notification appears when a run fails. The site keeps the last good version.

## Needs

- `GITHUB_PERSONAL_ACCESS_TOKEN` set as a user environment variable (read access is enough for search).
- Claude Code installed and signed in (`claude` on PATH).
- Git signed in to GitHub, so the push to `gh-pages` works.

## DNS

At the DNS host for `swiftwf.com`, add a CNAME record from `content` to `amir-qayyum-khan.github.io`.
