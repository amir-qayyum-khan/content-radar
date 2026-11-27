# News page — short design

**Intent.** A `/news/` page on content.swiftwf.com listing the top trending stories about AI and
video creation from the last 7 days, each linking to the original, biggest first. Same audience as
the tools list: the owner's micro-drama pipeline first, the public second.

**Approaches.**
- A. Hacker News + Reddit, ranked by points/upvotes. **Picked by the owner.**
- B. Publisher RSS (Google News, The Verge, TechCrunch): no scores, so "top" could only be newest or an LLM guess.
- C. Both: A ranked plus an RSS "latest" strip. More sources to break; not needed now.

**Goals.** Real popularity ranking; links straight to the story; refreshed by the existing 04:00 run;
no model calls, no API keys.
**Non-goals.** Summaries, comments, accounts, an archive of past days.
**Anti-goals.** Off-topic AI news (LLM benchmarks, funding) crowding out video news; a broken
nightly run because a news source is down.

**Design.**
1. `scripts/news.ts` → `fetchNews(fetch, now)` returns `NewsItem { id, title, url, source: 'hn' | 'reddit', where, score, comments, commentsUrl, postedAt }`.
   - Hacker News via the Algolia API (`/api/v1/search`, `tags=story`, last 7 days), one query per keyword:
     AI video, Sora, Veo, Kling, Runway, Pika, Luma, ElevenLabs, text-to-video, video generation, AI film, lip sync, Remotion.
   - Reddit (change after recon: anonymous JSON is blocked, 403 or login redirect) needs a free Reddit "script" app.
     It runs only when `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET` are set; otherwise the page is Hacker News only.
     It reads `top?t=week` via oauth.reddit.com for r/aivideo, r/VideoEditing, r/StableDiffusion, r/singularity, r/ElevenLabs, with a `content-radar` User-Agent.
     r/aivideo is kept whole; the others must match the video keyword filter.
   - Every title must pass the keyword filter (video/film/animation/voice/TTS/lip sync/model names above).
   - Dedupe by URL. Keep only `http(s)` URLs.
2. **Ranking (my call).** "Top" = score ÷ that source's 90th-percentile score in this batch, so one huge
   subreddit can't drown Hacker News. Ties go to the newer item. The page also offers a "Newest" sort.
   The page keeps the top 60.
3. Stored in `data/news.json` (latest only). If every source fails, keep yesterday's file and log it.
   One failed source never fails the run.
4. `nightly` runs the news step before the build. A news failure is logged and never stops publishing.
5. `src/pages/news/index.astro`: the same look as the tools list. Each row shows the rank, the title
   linking out (`rel="noopener nofollow"`, new tab), a source chip (Hacker News / r/aivideo), points,
   a comments link and the age ("6h ago"). A "Top / Newest" toggle is added, and "News" goes in the
   header nav. All text is escaped by Astro.

**Left to the builder.** Exact keyword list tuning, row styling within the existing tokens.
