# Business Student Opportunity Intelligence Dashboard

Automatically discovers, deduplicates, scores, and displays internships,
fellowships, leadership programs, case competitions, and other high-value
opportunities for business/management students — **at $0/month to run.**

Read `ARCHITECTURE.md` first — it explains every design decision, including
why this avoids paid infrastructure and exactly where/how Claude fits in
(manually, on demand — not as an always-on billed API call). Read
`OPTIONAL_SCALE_UP.md` if you later decide the paid, more-capable version
(Supabase + an automated Claude pipeline) is worth it.

## How it works, in one paragraph

A GitHub Actions cron job runs a fully deterministic pipeline (RSS discovery
→ hash-based change detection → rule-based extraction/classification/
scoring → dedup → persistence) that reads and writes plain JSON files under
`data/`. The same workflow commits the updated files back to the repo. A
second workflow rebuilds the dashboard as a static Next.js export and
deploys it to GitHub Pages. Nothing in that loop calls a paid API. You can
optionally, manually enrich opportunities with real Claude judgment (better
scoring/reasoning) via a free Claude.ai chat or, if you accept a small
marginal cost, your own API key — see `ARCHITECTURE.md` §8.

## Setup

1. **Fork/clone this repo.**
2. **Enable GitHub Pages**: repo Settings → Pages → Source: "GitHub
   Actions". No custom domain needed to start.
3. **Add real sources**: edit `data/sources.json`. Every entry ships
   `active: false` with a placeholder URL — verify a real RSS feed exists
   and that using it doesn't violate the source's terms, then flip
   `active: true` and fix the `url`. (RSS/public feeds only for the $0
   pipeline — see ARCHITECTURE.md §1 for why JS-rendered/login-gated sites
   aren't reachable without a paid fetch worker.)
4. **Edit your student profile**: `data/profile.json` — degree, year level,
   interests, work-arrangement preference, geography priority. Add more
   entries to the array to score for more than one profile.
5. **Push to `main`.** The `pipeline.yml` workflow runs every 6 hours (or
   trigger it manually from the Actions tab — "Run workflow"); `deploy.yml`
   rebuilds and redeploys the dashboard on every push, including the
   pipeline bot's own data commits.
6. If you're deploying to `https://<you>.github.io/<repo>/` (a project
   page, not a custom domain or a `<you>.github.io` root repo), set
   `NEXT_BASE_PATH=/<repo>` as a build env var in `deploy.yml`'s build step.

## Local development

```bash
npm install
npm run dev          # copies data/ -> public/data/, starts Next dev server
```

Run the pipeline locally without waiting for the cron:

```bash
npm run pipeline:run -- --manual
```

## Manually enriching with Claude (optional, still $0)

```bash
npm run pipeline:export-pending   # writes data/claude-outbox.md
# paste each block into a free Claude.ai chat, collect the JSON responses
# into data/claude-inbox.json (see the instructions at the top of the
# generated file for the exact shape)
npm run pipeline:ingest-claude    # validates + merges the responses in
```

If you'd rather script that with your own API key (small real cost, opt-in
only, never run in CI):

```bash
ANTHROPIC_API_KEY=... npm run enrich:claude -- --limit=10
```

## Repo layout

See `ARCHITECTURE.md` §11 for the full annotated tree. Short version:

- `data/*.json` — the database (git-versioned, human-readable/editable).
- `lib/pipeline/*` — the deterministic discovery/extraction/dedup/scoring
  pipeline.
- `lib/scoring/heuristics.ts` — the rule-based classifier/scorer that
  replaces an LLM call in the automated path.
- `lib/claude/*` — prompts/schemas/client for the optional manual path
  only.
- `app/`, `components/` — the static Next.js dashboard.
- `.github/workflows/` — the two jobs that make this run without a server.
- `supabase/`, `OPTIONAL_SCALE_UP.md` — the paid upgrade path, unused by
  default.

## Known limitations (see ARCHITECTURE.md §9 for the full, honest list)

- Not real-time push — the dashboard updates on the next pipeline run +
  redeploy, roughly every 6 hours by default.
- Saved opportunities live in browser `localStorage`, not synced across
  devices.
- Scoring is rule-based by default; it's less nuanced than Claude's
  judgment. `organization_score` in particular depends on hand-maintaining
  `reputation_tier` in `data/organizations.json`.
- Natural-language search is keyword matching, not Claude-parsed intent.
