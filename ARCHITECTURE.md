# Business Student Opportunity Intelligence Dashboard — Architecture

**Hard constraint: this system must cost $0 to operate.** Every choice below
is filtered through that first. There is a documented, optional upgrade path
to a paid, more capable version (Supabase + an automated Claude API pipeline
+ Vercel) in `OPTIONAL_SCALE_UP.md` — but nothing in the default system
requires it, and nothing in the default system silently starts costing
money.

---

## 1. Why $0 and "uses Claude" are in tension, and how this resolves it

The Claude API is metered — there is no ongoing free tier for production
API usage. Supabase, Vercel, and most "serverless" platforms do have free
tiers, but they come with fair-use limits, inactivity pauses, or terms that
assume non-commercial hobby use; GitHub's free infrastructure (Actions,
Pages) has none of those caveats for a public repo and is the most
unambiguously $0 option available.

So the system is split cleanly:

- **The always-on, automated pipeline is 100% deterministic code.** No LLM
  call is on the automated critical path. Classification, tagging, and
  scoring are done with rule-based heuristics (§7) — less nuanced than an
  LLM, but free, fast, and fully auditable.
- **Claude is used manually / on demand**, at zero incremental cost, in one
  of two ways you choose per §8:
  1. Paste a batch of pending opportunities into a free Claude.ai chat using
     the prompts already defined in `lib/claude/prompts.ts`, and paste the
     JSON response back into the repo with a small ingestion script — no
     API key, no billing, genuinely $0.
  2. If you already have a Claude API key you're using for other paid work
     (this repo, Claude Code, etc.) and are fine with the small marginal
     cost, `scripts/enrich-with-claude.ts` calls the same prompts via the
     API to enrich a batch automatically. This is opt-in and off by default
     — running it is a deliberate choice, never a side effect of using the
     dashboard.

Both paths reuse the exact same prompt/schema definitions
(`lib/claude/schemas.ts`, `lib/claude/prompts.ts`), so nothing about the
Claude *design* from the original spec is lost — only *when* and *how* it's
invoked changes.

---

## 2. Stack

| Layer | Choice | Why it's genuinely $0 |
|---|---|---|
| Data store | JSON files under `data/`, committed to git | No database service to pay for, pause, or outgrow a free tier on. Git gives versioning/audit-history for free, which the spec's "update history" requirement needs anyway. |
| Automation / scheduling | GitHub Actions (`.github/workflows/pipeline.yml`), cron-triggered | Free, unlimited minutes on a public repo. No server to keep running, no idle cost. |
| Discovery | RSS parsing (`lib/sources/rss-adapter.ts`) + public JSON APIs | No scraping infrastructure, no headless browser, no third-party scraping service subscription. |
| Frontend hosting | Static export (`next.config.mjs`: `output: 'export'`) deployed to GitHub Pages | Free static hosting with no bandwidth billing risk at this scale; Cloudflare Pages is an equally-valid $0 alternative if preferred. |
| Classification / scoring (automated) | Deterministic heuristics (`lib/scoring/heuristics.ts`) | Pure code, no API calls, no per-request cost. |
| Classification / scoring (optional, richer) | Claude, manual or opt-in scripted (§1) | $0 via the manual chat path; small and fully opt-in via the API path. |
| Realtime updates | Rebuild-and-redeploy: each pipeline run commits new data and a GitHub Actions job redeploys the static site | Not literal websocket push, but the dashboard reflects new data within one pipeline interval at zero cost. See §9 for the honest tradeoff. |
| Saved opportunities / application tracker | Browser `localStorage` | No backend, no auth service, no per-user database rows to pay for. Tradeoff: state is per-browser, not synced across devices — documented, not hidden (§9). |

---

## 3. Data model (flat-file store)

`lib/store/jsonStore.ts` is the only code that reads/writes these files —
everything else goes through it, so swapping the storage backend later
(e.g., to Supabase, per `OPTIONAL_SCALE_UP.md`) touches one module, not the
whole pipeline.

```
data/
  sources.json         -- source registry (replaces a source_registry table)
  organizations.json   -- canonical organizations
  opportunities.json   -- canonical opportunities (the core record)
  tags.json            -- taxonomy
  runs.json            -- pipeline run history (replaces search_runs)
  profile.json         -- the student profile(s) opportunities are scored against
```

Each file is a JSON array of records with the same shape described in the
original spec (title, organization, type, industry, function, description,
location, country, work arrangement, URLs, dates, eligibility fields,
compensation, sponsorship, status flags, discovery/check/update
timestamps). `lib/types.ts` defines the TypeScript shapes; a record's
`updates: OpportunityUpdate[]` array embedded directly on the opportunity
(rather than a separate join) is the one deliberate simplification a flat
file calls for — this is exactly the shape `OPTIONAL_SCALE_UP.md`'s
`opportunity_updates` table normalizes out if you migrate later.

Missing/unknown information is always `null` (or an empty array), never
fabricated — this rule is enforced the same way whether a field was filled
in by a heuristic or by Claude (validation in `lib/pipeline/validate.ts`
doesn't care which one produced the draft).

---

## 4. Pipeline

```
SOURCE REGISTRY (data/sources.json)
      │
      ▼
 DISCOVERY            (lib/sources/rss-adapter.ts: RSS/public-API fetch —
      │                no scraping of sites that don't offer one)
      ▼
 CONTENT-HASH GATE     (lib/dedup.ts: unchanged content since last run stops
      │                here — this is the main cost/effort-control point)
      ▼
 EXTRACTION            (lib/pipeline/extract.ts: deterministic field
      │                extraction from RSS metadata + regex/keyword rules
      │                for dates, work arrangement, GPA, degree/year-level
      │                mentions — see §7. Optionally replaced by Claude
      │                output pasted/ingested via §1's manual path.)
      ▼
 VALIDATION            (lib/pipeline/validate.ts: required-field presence,
      │                well-formed URLs/dates, enum coercion)
      ▼
 DEDUPLICATION         (lib/pipeline/deduplicate.ts: hash match, then an
      │                in-process Dice-coefficient string-similarity check
      │                — no external DB needed for either)
      ▼
 SCORING                (lib/pipeline/analyze.ts: rule-based heuristic
      │                score against each profile in data/profile.json —
      │                see §7)
      ▼
 PERSISTENCE            (lib/pipeline/persist.ts: upsert into
      │                data/opportunities.json, diff against the previous
      │                version, append to that record's update history,
      │                recompute status via lib/status.ts)
      ▼
 COMMIT + REDEPLOY      (GitHub Actions: commit data/*.json, then build +
      │                deploy the static site)
      ▼
 DASHBOARD              (fetches the freshly-deployed JSON on load; see §9
                        for what "realtime" means here)
```

---

## 5. Deduplication logic (no external DB required)

1. **Deterministic hash** — identical to the paid-path design:
   `sha256(normalize(org) + "|" + normalize(title) + "|" + normalize(location))`.
   Exact match = same opportunity, link the new source, no further work.
2. **In-process string similarity** — `lib/dedup.ts` implements a Dice
   (bigram-overlap) coefficient over `normalize(title + organization)`
   against every existing opportunity. This is the free-tier substitute for
   Postgres `pg_trgm`: same idea (character-level fuzzy match), computed in
   plain JavaScript over the (at this scale) small in-memory array from
   `opportunities.json`.
3. **Ambiguous-band handling** — matches in the ambiguous middle
   (configurable threshold) are *not* auto-merged. They're written with
   `status: "needs_review"`-equivalent flag and left for a human (or an
   optional manual Claude tie-break, using the same
   `dedupTieBreakToolSchema` prompt as the paid path) rather than risking a
   bad automatic merge.

This scales fine into the low tens of thousands of records — an O(n)
similarity scan per new item — well beyond what a single-student (or
small-cohort) dashboard will realistically accumulate before you'd
reconsider the storage layer anyway.

---

## 6. Status state machine

Unchanged from the paid-path design — this was already 100% deterministic
code, never Claude's job:

```
NEW              → first insert
UPDATED          → material field changed, not new this run
DEADLINE_CHANGED → subtype of UPDATED specifically for deadline diffs
CLOSING_SOON     → deadline within N days (default 7) AND applications open
CLOSED           → deadline passed, or applications_open flips false
```

See `lib/status.ts` — a pure function of `(previous state, new state, now)`.

---

## 7. Deterministic classification & scoring (the automated default)

Because no LLM runs automatically, `lib/scoring/heuristics.ts` and
`lib/pipeline/extract.ts` carry more weight here than they would in the paid
design. They're intentionally simple and inspectable rather than clever:

**Extraction heuristics** (`lib/pipeline/extract.ts`):
- `opportunity_type` / `tags`: keyword match against the taxonomy (e.g.,
  "case competition", "summer analyst", "management trainee", "fellowship")
  in the title/description.
- `work_arrangement`: keyword match for "remote", "hybrid", "on-site"/"in
  office"; defaults to `unknown` rather than guessing.
- `application_deadline`: regex for common date patterns near the words
  "deadline"/"apply by"/"closes"; anything not confidently parsed stays
  `null` with the raw phrase kept in `deadline_note` — never fabricated.
- `degree_requirements` / `year_level_requirements` /
  `citizenship_requirements` / `gpa_requirement`: keyword/regex rules (e.g.,
  "3rd year", "junior", "Filipino citizens", "GPA of 3.0").

**Scoring heuristics** (`lib/scoring/heuristics.ts`), producing the same six
sub-scores and `overall_score` the spec asks for, with the same fixed
weights as the paid design (relevance 15% / career value 25% /
organization 20% / student fit 20% / accessibility 10% / urgency 10%):

- `relevance_score`: taxonomy tag overlap with "business/management"
  functions.
- `career_value_score`: a small curated signal list (internship vs.
  leadership-program vs. generic listing; presence of compensation;
  program duration) — deliberately conservative, since this is the
  dimension hardest to get right without genuine judgment.
- `organization_score`: looks up the organization against an editable
  curated tier list (`data/organizations.json`'s `reputation_tier` field —
  you can hand-edit this as you learn about organizations relevant to your
  market; this is the honest, low-tech answer to "how do we know
  reputation without an LLM").
- `student_fit_score`: overlap between the opportunity's tags/degree/year
  requirements and the profile in `data/profile.json`.
- `accessibility_score`: eligibility/citizenship/work-arrangement match
  against the profile — an opportunity that excludes the student scores
  low here regardless of how good it otherwise looks.
- `urgency_score`: pure date math against the deadline.

This is explicitly a simpler instrument than Claude's judgment — it cannot
read nuance in a job description the way an LLM can, and `organization_score`
in particular is only as good as the curated tier list you maintain. That
tradeoff is the price of $0 automated operation; §1's manual Claude path
exists specifically to let you periodically re-score with real judgment
without paying for it to happen continuously.

---

## 8. Manual/on-demand Claude usage — concretely, how you'd do it

**Path A — free, via Claude.ai chat, no API key:**
1. Run `npm run pipeline:export-pending` (prints/writes pending items in a
   copy-paste-ready block using `buildExtractionUserPrompt` /
   `buildScoringUserPrompt` from `lib/claude/prompts.ts`).
2. Paste the system + user prompt into a Claude.ai conversation; ask for
   the tool-schema JSON back (the schemas in `lib/claude/schemas.ts` are
   included in the exported block so Claude knows the exact shape).
3. Paste Claude's JSON response into `data/claude-inbox.json`.
4. Run `npm run pipeline:ingest-claude` — validates and merges it into
   `data/opportunities.json` through the same `validate.ts`/`persist.ts`
   code the automated path uses, so there's exactly one code path for
   "getting a draft into the store," regardless of who/what produced it.

**Path B — your own API key, opt-in, small marginal cost:**
- `npm run enrich:claude` runs `scripts/enrich-with-claude.ts`, which calls
  `lib/claude/client.ts` directly against pending items and writes results
  the same way Path A's ingestion step does. This is never invoked by the
  GitHub Actions workflow — only by you, by hand, when you decide the small
  spend is worth it.

---

## 9. Honest tradeoffs vs. the original spec

Being explicit about what the $0 constraint costs in capability, rather
than quietly under-delivering against the spec:

- **"Realtime" is rebuild-and-redeploy, not websocket push.** A pipeline
  run → commit → Actions redeploy cycle takes a few minutes, not
  milliseconds. For a system that checks sources every few hours, this is
  indistinguishable from realtime in practice; it is not, however,
  sub-second push the way Supabase Realtime is.
- **Saved opportunities / application tracker are per-browser
  (`localStorage`), not synced across devices**, because a synced,
  multi-device version needs some backend to own that state, and every
  genuinely-free option for that (a public Google Sheet as a write target,
  for instance) either requires exposing write access insecurely or adds
  real operational complexity for a marginal MVP feature. Documented as a
  known limitation, not solved silently.
- **Scoring quality is lower than Claude's.** §7 is honest about this.
  The curated organization-reputation list in particular needs your manual
  upkeep to stay meaningful.
- **Natural-language search is keyword-based, not Claude-parsed**, for the
  same reason automated scoring is heuristic: parsing free text into
  filters well is exactly the kind of judgment call that needs an LLM, and
  the automated path has none available. The manual Claude path (§8) can
  still be used ad hoc to turn a complex query into filter JSON you apply
  by hand.
- **Notifications are in-dashboard only** ("N new since last visit," a
  closing-soon badge) — email/Telegram/Discord/Slack all require either a
  paid sending service or a webhook target you control; the architecture
  leaves a clean seam (`lib/notifications/` — see §11) for adding one for
  free later (e.g., a Discord webhook is free and requires no service to
  operate), but none is wired into the $0 MVP.

---

## 10. Cost

**$0/month, at any of the volumes originally asked about (100 / 1,000 /
10,000 opportunities per month)**, because nothing in the automated path is
metered:

- GitHub Actions: free (public repo, unlimited minutes).
- GitHub Pages: free static hosting.
- RSS/public API fetches: free.
- Storage: git, free.
- Scoring/classification: local compute in the Actions runner, free.

The only way this system starts costing money is if you deliberately choose
to run `scripts/enrich-with-claude.ts` (§8, Path B) — and even then, cost is
bounded by how often you choose to run it, not by dashboard usage or
pipeline frequency. See `OPTIONAL_SCALE_UP.md` for cost estimates of the
fully-automated-Claude version, if you ever decide that tradeoff is worth
making.

---

## 11. Folder structure

```
/ARCHITECTURE.md
/OPTIONAL_SCALE_UP.md      -- paid upgrade path: Supabase schema, automated
/README.md                    Claude pipeline, cost estimates for that path
/supabase/                 -- reference schema for the optional scale-up path
  schema.sql                  (not required to run the default $0 system)
  seed.sql
/data/                      -- the $0 system's actual database
  sources.json
  organizations.json
  opportunities.json
  tags.json
  runs.json
  profile.json
/.github/workflows/
  pipeline.yml              -- scheduled discovery+scoring run, commits data/
  deploy.yml                -- builds the static export, deploys to Pages
/app/                        -- Next.js App Router, static-exported
  layout.tsx
  page.tsx                   -- dashboard (overview + top opportunities)
  opportunities/[id]/page.tsx
  saved/page.tsx              -- localStorage-backed
/components/
  OpportunityCard.tsx
  OverviewStats.tsx
  FilterBar.tsx
  StatusBadge.tsx
  ScoreBadge.tsx
/lib/
  types.ts
  store/jsonStore.ts          -- the only module that touches data/*.json
  dedup.ts                    -- hash + in-process similarity
  status.ts                   -- deterministic status state machine
  scoring/heuristics.ts        -- deterministic classification + scoring
  claude/
    client.ts                 -- used only by the optional manual/opt-in path
    prompts.ts
    schemas.ts
  pipeline/
    discover.ts
    extract.ts
    validate.ts
    deduplicate.ts
    analyze.ts
    persist.ts
    orchestrator.ts
  sources/
    types.ts
    rss-adapter.ts
    registry.ts
/scripts/
  run-pipeline.ts             -- CLI entry point, run by GitHub Actions
  export-pending-for-claude.ts -- Path A helper (§8)
  ingest-claude-response.ts    -- Path A helper (§8)
  enrich-with-claude.ts        -- Path B, opt-in, uses your own API key
/package.json
/tsconfig.json
/tailwind.config.ts
/next.config.mjs             -- output: 'export'
/.env.example
```

---

## 12. MVP / V2 / V3

### MVP (this repo)
1. 2-3 RSS/public-API sources in `data/sources.json`.
2. Full pipeline (discover → hash-gate → heuristic extract → validate →
   dedup → heuristic score → persist) running on a GitHub Actions schedule.
3. Static dashboard: overview counts, top-opportunities list, filters
   (type/location/work-arrangement/deadline/score), opportunity detail,
   localStorage save/bookmark.
4. Manual Claude enrichment path (§8, Path A) documented and scripted.
5. In-dashboard "new since last visit" indicator computed from
   `runs.json` + localStorage of last-viewed timestamp.

### V2
- Application tracker (full status funnel) in localStorage, with an
  export/import-to-file option so it's at least portable across devices
  even without a sync backend.
- Discord webhook notifications (free, no service to run) for
  high-score/new/closing-soon opportunities.
- Opt-in Path B (`enrich-with-claude.ts`) run on a manual cadence you
  control, with cost visibility (log tokens used per run).
- Recurrence handling for annually-repeating programs.

### V3 (this is where `OPTIONAL_SCALE_UP.md` becomes relevant)
- Migrate to Supabase if/when the flat-file store or single-device saves
  become a real limitation, using the schema already designed there.
- Wire Claude into the automated pipeline for extraction/scoring/NL search,
  accepting the (still modest — see that document's cost table) ongoing
  spend.
- True realtime (Supabase Realtime) and multi-channel notifications
  (email/Telegram/Slack).

---

## 13. Hardest parts / where automation is unreliable (holds for both paths)

1. **Deduplicating differently-worded postings of the same opportunity**
   without merging different cohort-years of a recurring program together.
   The heuristic similarity check in §5 is a blunter instrument than the
   paid path's embeddings + Claude tie-break, so expect more
   false-negatives (missed duplicates) here, not false-positives — a
   conservative failure mode, but a real limitation.
2. **Sites requiring JS rendering or login** aren't reachable by RSS/plain
   HTTP fetch at all in the $0 design — those sources simply can't be
   included until you're willing to run a fetch worker somewhere (which
   costs at least a little to host reliably).
3. **Organization-reputation scoring is only as good as your curated tier
   list.** This is more honestly limited than the paid path (where Claude
   at least attempts general knowledge), not less biased — you should
   expect to maintain `data/organizations.json` by hand as you discover
   organizations the heuristic doesn't know how to rank.
4. **Deadline extraction from inconsistent free text** is genuinely hard
   for regex; expect a meaningfully higher `null`-deadline rate than the
   Claude-extraction path would produce. This is treated as a correct,
   honest `null` rather than a bug to "fix" by guessing.
