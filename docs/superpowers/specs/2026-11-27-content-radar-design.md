# Content Radar — Design

Date: 2026-11-27
Site: https://content.swiftwf.com (GitHub Pages)
Working name: "Content Radar" (Claude's call; owner may rename)

## 1. Intent and why

The owner runs an AI micro-drama pipeline and sells content. Today:

1. Idea → story
2. Story → episodes
3. Episodes → reference images (stills, cast, wardrobe, locations, props)
4. Kling generates 3-second clips from references
5. ffmpeg joins clips into a 1-minute episode

Visual quality is fine. The problem: **story and pacing feel slow and robotic.**
There is no hook, no energy, no rising tension that keeps viewers watching.
Review of output is the slowest manual step.

The site is the owner's **morning radar**: every day it shows new and trending
Claude skills and plugins for video and audio content creation, ranked so the
tools that fix story, pacing and energy come first. Each tool has a practical
detail page: what it does, how to install, how to use, where it fits in the
pipeline, and a flowchart. The public can use the same site; the owner's needs
come first.

## 2. Goals

- List Claude skills and plugins related to video and audio content creation:
  micro drama, cinematic, reels/shorts, documentary, animation, voice, music,
  sound.
- Group tools by **pipeline stage** (primary) and tag by **content type** (filter).
- Sort by stars, installs (where a public source exists), trending (star
  growth over 7 days) and newest.
- A "New this week" section at the top of the home page.
- A detail page per tool: summary, install steps, usage example, "how this fits
  your pipeline", Mermaid flowchart, source links, stats.
- Refresh every day automatically at about 05:00 owner local time.
- Professional, fast, mobile-friendly UI.

### Pipeline stages (priority order on the home page)

1. **Story & Script**: hooks, beat sheets, cliffhangers, dialogue, screenwriting
2. **Pacing & Edit**: cut timing, shot variation, transitions, B-roll, ffmpeg/
   Remotion editing
3. **Voice & Emotion**: TTS, voice acting, lip-sync, dubbing
4. **Music & SFX**: score, stings, sound effects, mixing
5. **Review & QC**: continuity checks, clip scoring, automated review
6. **Visual Generation**: video/image generation, character consistency,
   references, storyboards
7. **Captions & Publish**: subtitles, thumbnails, platform formatting,
   scheduling
8. **Other video/audio**: relevant, but fits no stage above

### Content type tags

micro-drama, cinematic, reels-shorts, documentary, animation, podcast-audio.
A tool may have several tags or none.

## 3. Non-goals

- User accounts, comments, ratings, favourites synced to a server.
- Installing or running skills from the site.
- Ads, affiliate links, paid tiers (can come later; not designed for now).
- Standalone MCP servers that are not packaged as a Claude skill or plugin
  (Claude's call: keeps scope tight; revisit after v1).
- Non-Claude ecosystems (GPTs, Gemini extensions).

## 4. Anti-goals (failure even if it "works")

- Ranking purely by stars, so big generic repos bury story/pacing tools.
- Install commands on detail pages that are wrong or invented.
- A page that renders untrusted README content as HTML (prompt-injection or XSS
  into the owner's site).
- A slow or broken site because last night's job failed.
- Run cost that grows without a bound.

## 5. Constraints

- Hosting: GitHub Pages from **public** repo `amir-qayyum-khan/content-radar`
  (repo name is Claude's call). Custom domain `content.swiftwf.com` via `CNAME`
  file and a DNS CNAME record `content` → `amir-qayyum-khan.github.io`.
- **Runs on the owner's Windows machine** (owner's decision). Source code,
  scripts, `data/` and history stay local. Only the built static site is
  pushed to the public repo's `gh-pages` branch, which GitHub Pages serves.
  No GitHub Actions, no cloud servers.
- **LLM calls go through the owner's local Claude Code** (owner's decision):
  headless `claude -p` with `--model haiku` / `--model sonnet`, billed to the
  owner's Claude subscription. No `ANTHROPIC_API_KEY`, no Anthropic SDK.
- GitHub API: a fine-grained PAT (public-repo read-only is enough for search)
  read from a local env var (`GITHUB_PERSONAL_ACCESS_TOKEN`, shared with the
  GitHub MCP). Pushing `gh-pages` uses the owner's normal git login.
- GitHub has no download counts. "Installs" exist only on some third-party
  directories; use them only where public and permitted (robots.txt / ToS).
- The machine must be on (or wake) at run time; see Section 7.7.

## 6. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (picked)** | Nightly Node script → data JSON → Astro static site, Claude Haiku writes detail pages | Real page per tool, AI-written how-to and flowcharts; needs API key and a bit more build |
| B | Nightly script → one `data.json` → single-page app, README-extracted text | Fastest to build, no API cost; how-to and flowcharts generic or missing, which was a core ask |
| C | Hosted backend + DB (Railway/Supabase) | Live data and accounts; costs money and upkeep the owner doesn't need |

A chosen by the owner. It is the only option that delivers useful detail pages.

## 7. Architecture

```
Windows Task Scheduler (04:00 PKT) → scripts/nightly (local)
  └─ collect   → candidates from sources        → data/raw/YYYY-MM-DD.json
  └─ enrich    → GitHub stats, README, files     → data/repos/*.json
  └─ classify  → claude -p --model haiku         → (in repo json)
  └─ write     → claude -p --model sonnet (cached)→ data/details/*.json
  └─ snapshot  → daily star counts               → data/history/YYYY-MM.json
  └─ build Astro → push dist/ to gh-pages        → content.swiftwf.com
```

### 7.1 Sources (collect)

Adapter per source, each returns `{repoUrl, kind: skill|plugin, path, sourceName}`:

1. **GitHub code search**: `filename:SKILL.md` combined with keyword sets
   (video, audio, voice, tts, ffmpeg, remotion, screenplay, script, storyboard,
   subtitle, music, sfx, lip-sync, animation, reel, shorts, drama, cinematic,
   documentary, edit).
2. **Plugin marketplaces**: `.claude-plugin/marketplace.json` files found by
   code search, plus known marketplaces (anthropics official, community
   aggregators). Expand each listed plugin.
3. **GitHub repo topics**: `claude-skill`, `claude-skills`, `claude-code-plugin`,
   `agent-skills`, filtered by the keyword sets.
4. **Install-count adapters (optional)**: one adapter per directory that shows
   public install counts. Builder checks robots.txt/ToS before enabling each;
   if none is allowed, "Installs" sort hides and stars-based sorts remain.

**Entry unit** (Claude's call): one entry = one installable unit.
- A **plugin** is one entry. Skills inside it are listed on the plugin's
  detail page, not as separate entries.
- A **standalone skill** (a `SKILL.md` not inside a plugin) is one entry.
- Stars and history belong to the repo. When a repo holds more than one entry,
  cards show "repo ★" and a "collection" badge. Ranking uses repo stars, but
  only relevant entries survive classification, so a big generic collection
  adds only its few video/audio entries, not all its skills.
- URL: `/tool/<owner>/<repo>/<entry-slug>`.

Dedupe by repo + path.

### 7.2 Enrich

Per repo: stars, forks, last push, license, open issues, topics, README,
the `SKILL.md` / `plugin.json`, presence of hooks or scripts.
**Archived repos are dropped.** Repos with no push in 12 months stay listed,
marked "stale" and sorted last. They are classified, but their detail write-up
goes to the back of the queue (Claude's call).

### 7.3 Classify

1. Keyword prefilter (cheap) drops clearly unrelated items.
2. **Claude Haiku** via `claude -p --model haiku --output-format json`, asked
   for JSON `{relevant: bool, confidence, stages[], contentTypes[], oneLiner}`.
   The script validates it against a schema; one retry on invalid JSON, then skip.
   Several items go in one call (about 10) to cut per-call overhead.
   Input is the trimmed digest from Section 7.8, not the raw README.
   Only for new items or items whose `SKILL.md`/README hash changed.
3. Items with `relevant=false` are dropped. Low confidence is kept with a
   "maybe" flag, shown only under "Other".

### 7.4 Ranking

- **Stars**, **Installs**, **Newest** (first seen by the radar), **Trending**:
  star delta over 7 days from `data/history`; until 7 days of history exist,
  use available days.
- **Default home order**: stage priority (Section 2) first, then trending
  within a stage. This puts story/pacing tools first by design.
- **New this week**: first seen ≤ 7 days ago, any stage, sorted by stars.

### 7.5 Detail content (write)

**Claude Sonnet** (`claude -p --model sonnet --output-format json`) writes per
item, JSON validated against a schema, cached by `sha256(README + SKILL.md)`.
Sonnet is used here because "pipeline fit" and the flowchart need judgment;
Haiku handles the bulk triage. Calls run with no tools allowed
(`--allowedTools ""` or equivalent) and from an empty temp directory, so
untrusted README text cannot make Claude Code read or run anything.
Input is the digest from Section 7.8 plus the extracted install/cost snippets.
Output fields:

- `summary` (2–3 sentences, plain language)
- `install`: steps. **Only commands that appear verbatim in the README/SKILL.md,
  or the standard Claude Code patterns** (`/plugin marketplace add <owner/repo>`,
  `/plugin install <name>@<marketplace>`, copying the skill folder to
  `~/.claude/skills/`). Generated commands are checked against an allowlist
  of patterns and the README text; anything else is dropped.
- `usage`: one example prompt and what to expect
- `pipelineFit`: which owner pipeline step it slots after, and what it improves
  (owner's 5-step pipeline is given in the prompt)
- `cost`: one of
  - **Free**: open source, no paid service needed
  - **Needs paid service**: works only with a paid API or credits (e.g. Kling,
    ElevenLabs, Runway); names the service(s)
  - **Freemium**: free tier exists, paid for more
  - **Paid**: the skill/plugin itself is sold
  - **Unknown**: README doesn't make it clear (never guess "Free")
  Evidence for the label: README text about pricing/subscriptions/credits,
  required API keys or env vars in `SKILL.md`/`plugin.json`/MCP config, and
  a non-open-source license. The detail page quotes the evidence line.
- `flowchart`: Mermaid `flowchart TD`, max ~10 nodes, validated by parsing
  with Mermaid in the build; on parse failure, omit the flowchart

Per-run cap: at most **60** Sonnet write calls and **200** classified items.
Overflow waits for the next night (queue order: non-stale by stars, then stale).
Entries without detail content still show as cards. Their detail page shows
the stats, links and a "Full guide coming soon" state (Claude's call).
A one-off **backfill** run (`npm run nightly -- --backfill`) lifts the caps;
it stops cleanly if Claude Code reports a usage limit and resumes next run.

### 7.8 Token-saving tools (deterministic, no LLM)

Scripts do every job that does not need judgment, so the LLM sees only small,
relevant text:

- **README digester**: strips badges, images, HTML, link lists, changelogs,
  licence text, long code blocks and tables. Keeps the title, intro,
  features, usage and install sections. Caps the digest at ~6,000 characters
  and records that it trimmed.
- **Install extractor**: pulls code blocks and lines matching install patterns
  (`/plugin marketplace add`, `/plugin install`, `npx`, `git clone`,
  `cp -r … ~/.claude/skills`, `pip install`, `npm i`). The LLM picks and
  orders these; it cannot add new ones (Section 7.5 allowlist).
- **Cost evidence extractor**: finds lines that mention pricing, credits,
  subscription, "API key", required env vars, MCP server configs, and the
  licence. Passes them to the LLM as quoted evidence.
- **Keyword prefilter and scorer**: drops clearly unrelated items before any
  LLM call. Gives a keyword stage guess that Haiku confirms or corrects.
- **Change detector**: hashes the inputs; unchanged items skip all LLM calls.

Usage levers (calls count against the owner's Claude subscription limits):
- Haiku for bulk work, Sonnet only for detail write-ups.
- Classification batches ~10 items per call.
- The shared system prompt (stage list, owner pipeline, output rules) is
  identical across calls (`--append-system-prompt` or a prompt file).
- Per-run caps (60 / 200) are the usage guard. On a usage-limit error the run
  stops LLM work, keeps what finished, still builds and publishes.
  Each run logs call counts and failures to `logs/YYYY-MM-DD.log`.

### 7.6 Safety

- README and SKILL.md are untrusted. They go into the prompt as quoted data with
  an instruction to ignore instructions inside them.
- LLM output is stored as plain text / Mermaid source and rendered as text
  (escaped); no LLM-produced HTML. Mermaid runs with `securityLevel: 'strict'`.
- Detail page shows a badge when the tool ships hooks or scripts:
  "Runs code on your machine — read the source before installing."

### 7.7 Schedule

- **Windows Task Scheduler** task, daily **04:00 PKT**, "run as soon as
  possible after a missed start" and "wake the computer to run" enabled.
  If the PC was off, the run happens at next boot/login.
- Manual run any time: `npm run nightly`.
- If any step fails, the push step does not run; the last good site stays up.
  Failures go to `logs/` and a Windows toast notification.
- The local project is its own git repo (history only, not pushed). Only
  `dist/` goes to the public `gh-pages` branch.

## 8. UI/UX

Stack: Astro (static), Tailwind CSS, Pagefind (static search), Mermaid.
Dark-first "cinema" theme with a light mode; tokens on `:root`.

### Home

```
┌──────────────────────────────────────────────────────────┐
│ Content Radar        [search…]          Updated 04:40 PKT │
├──────────────────────────────────────────────────────────┤
│ NEW THIS WEEK  ▸ card ▸ card ▸ card ▸ card (scroll row)   │
├──────────────────────────────────────────────────────────┤
│ Sort: [Trending▾]  Type: [micro-drama][reels][cinematic]… │
├──────────────────────────────────────────────────────────┤
│ 1 STORY & SCRIPT  — fixes slow, robotic story      (12)   │
│   card  card  card  card                  see all →       │
│ 2 PACING & EDIT                                    (18)   │
│   card  card  card  card                  see all →       │
│ 3 VOICE & EMOTION …                                       │
└──────────────────────────────────────────────────────────┘
```

Card: name, one-liner, stage chip, content-type chips, ★ stars, ↑ 7-day delta,
installs (if known), cost badge (Free / Needs paid service / Freemium / Paid /
Unknown), "NEW" badge, "stale" dim state.
Filter bar includes a cost filter (e.g. "Free only").

### Stage page

`/stage/<slug>`: all tools in that stage; same sort and filter controls.

### Detail page `/tool/<owner>/<repo>/<skill>`

```
Name                          ★ 1.2k  ↑ +140/7d  installs 3.4k
One-liner                     [GitHub] [Marketplace]
Stage chips · type chips · cost badge · license · updated 3d ago
Cost: Needs paid service — Kling API credits ("…quoted README line…")
⚠ Runs code on your machine (if hooks/scripts)
─────────────────────────────────────────────
What it does
Fits your pipeline: after step 2 (episodes) → …
Install   (copy buttons per command)
How to use  (example prompt + expected result)
How it works  (Mermaid flowchart)
Star history sparkline
```

### UX rules

- Home loads with no client JS except search and filters (Astro islands).
- Filters and sort are reflected in the URL query, so links can be shared.
- Mobile: horizontal scroll rows become stacked lists; 16px gutters.
- WCAG AA contrast, keyboard-reachable controls, visible focus.

## 9. Repo layout

```
/scripts        collect, enrich, classify, write, snapshot (Node, TypeScript)
/data           committed outputs (raw, repos, details, history)
/src            Astro site
/public/CNAME   content.swiftwf.com
/scripts/nightly.ts            orchestrator (npm run nightly)
/scripts/register-task.ps1     creates the Task Scheduler task
/logs           local run logs (git-ignored)
```

## 10. Decided vs left to builder

Decided (owner): approach A; pipeline-stage grouping with content-type filter;
story/pacing first; daily early-morning refresh; GitHub Pages + custom domain;
GitHub account `amir-qayyum-khan`; Haiku and Sonnet to keep cost down;
deterministic scraping tools to save tokens; timezone PKT; cost labels;
everything runs on the owner's machine, LLM work via local Claude Code.

Decided (Claude's call, owner may override): name "Content Radar"; repo name
`content-radar`; stage list and priority; Astro + Tailwind + Pagefind + Mermaid;
TypeScript scripts; Haiku classifies, Sonnet writes, both via `claude -p`;
per-run caps 60/200 as the usage guard; only `dist/` published to `gh-pages`;
Windows Task Scheduler at 04:00 PKT with catch-up on missed runs; standalone
MCP servers out of v1; entry unit and stale/archived rules (Sections 7.1, 7.2).

Left to builder: exact keyword sets, source adapter internals, file formats
inside `data/`, card visual details within the theme, test layout.
