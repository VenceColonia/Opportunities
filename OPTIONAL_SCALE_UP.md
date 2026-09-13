# Optional scale-up path (costs money — not part of the default $0 system)

The default system in this repo (see `ARCHITECTURE.md`) runs entirely on free
infrastructure: a flat-file JSON "database" versioned in git, GitHub Actions
for scheduling, GitHub Pages for hosting, and deterministic (non-AI) scoring.
Claude is used only manually/on-demand at zero incremental cost (via a free
Claude.ai chat, or your own Claude Code/API usage you're already paying for).

If you outgrow that later — more sources than a flat file can comfortably
hold, need multi-device saved-opportunity sync, want true real-time push
updates, or want Claude wired into an always-on automated pipeline — this
document is the upgrade path. Everything below is optional and **will incur
real cost** (Claude API billing at minimum; likely Supabase's paid tier at
higher volume). Do not build this unless you've deliberately decided the
tradeoff is worth it.

## What changes vs. the default system

| Concern | Default ($0) system | Scale-up (paid) system |
|---|---|---|
| Data store | `data/*.json` in git | Supabase Postgres (`supabase/schema.sql` in this repo) |
| Hosting | GitHub Pages (static export) | Vercel/Next.js server (SSR, API routes) |
| Scheduling | GitHub Actions cron | Vercel Cron / Supabase `pg_cron` |
| Realtime | Rebuild-and-redeploy on each pipeline run | Supabase Realtime (websocket push) |
| Classification/scoring | Deterministic heuristics (`lib/scoring/heuristics.ts`) | Claude API (forced structured JSON output) |
| Dedup | Hash + in-process string similarity | Hash + Postgres trigram + pgvector embeddings + Claude tie-break |
| Search | Client-side keyword filter | Claude-parsed natural-language filters |
| Multi-user / saved items | Browser localStorage (single device) | Supabase Auth + RLS, synced across devices |

## Database schema

The full relational schema for the scale-up path is in `supabase/schema.sql`
(with taxonomy/example-source seed data in `supabase/seed.sql`). It was
designed first and is more thorough than the flat-file store: canonical
`opportunities` with many-to-one `opportunity_sources`, append-only
`opportunity_updates` history, per-`(opportunity, student_profile)`
`opportunity_scores`, a `source_registry` + `discovery_queue` cost-control
gate, and RLS on every user-owned table. Read the comments in that file —
they explain each table's relationships. Apply it to a Supabase project via
the SQL editor or CLI when you're ready to migrate off the flat-file store;
the shapes in `lib/types.ts` were deliberately kept close to these tables so
migrating the JSON records over is closer to a data migration than a
rewrite.

## Claude I/O contracts

`lib/claude/schemas.ts` and `lib/claude/prompts.ts` already define the two
production call types for this path:

1. **Extraction** — raw posting text → structured `OpportunityExtraction`
   JSON (title, org, dates, eligibility, compensation, etc.), with an
   explicit "never fabricate, null when unknown" rule and a per-field
   confidence map.
2. **Scoring** — a structured opportunity + one student profile → six
   sub-scores (relevance, career value, organization, student fit,
   accessibility, urgency), a weighted `overall_score`, `significance_flags`
   (prestigious/selective/hard-to-discover/time-sensitive), and a 1-3
   sentence human-readable `reasoning`. The weighting (15/25/20/20/10/10)
   and the "don't rank easy-to-get above genuinely valuable" instruction are
   fixed in `SCORING_SYSTEM_PROMPT` so scores stay comparable across calls.

Both are forced tool-use calls (`lib/claude/client.ts`) — never freeform
prose parsed with regex — and both are wired up but **not invoked
automatically** by the default pipeline (`lib/pipeline/*`). To turn on
automated Claude analysis, swap the heuristic calls in
`lib/pipeline/analyze.ts` and `lib/pipeline/extract.ts` for the
`extractOpportunity` / `scoreOpportunityForProfile` functions already
exported from `lib/claude/client.ts`.

## Cost control (if you do wire Claude into the automated pipeline)

Everything in the default pipeline's discovery/dedup/status stages already
functions as the cost-control layer for this path too — nothing there needs
to change:

1. Hash-gate unchanged content before it ever reaches extraction.
2. Resolve exact/near-duplicates deterministically before analysis; escalate
   only the ambiguous similarity band to a (tiny) Claude tie-break call.
3. Re-score only on a materially-changed diff, not on every check-in.
4. Cache scores per `(opportunity, profile)` — never recompute on page load.
5. Batch same-run new items into the Claude Batches API (~50% discount) when
   latency isn't critical.
6. Mark the (large, static) scoring rubric as a cached prompt block so
   repeat calls only pay full input price once per cache TTL.

### Cost estimate (assumptions stated explicitly)

Using Claude Sonnet-tier pricing as of this writing (~$3/MTok input,
~$15/MTok output — re-check current pricing before treating this as
current) and ≈1,200/250 input/output tokens for extraction, ≈900/300 for
scoring, with one student profile:

| Volume/mo | Est. Claude cost/mo | Supabase | Total |
|---|---|---|---|
| 100 opportunities | ~$1–2 | Free tier | ~$1–2/mo |
| 1,000 opportunities | ~$10–15 | Free tier likely sufficient | ~$10–40/mo |
| 10,000 opportunities | ~$100–150 (scales with active profile count for scoring only; extraction is profile-independent) | Supabase Pro (~$25/mo base) | ~$130–250/mo |

## Hardest parts (unchanged by which path you're on)

- Deduplicating differently-worded postings of the same opportunity, without
  incorrectly merging different cohort-years of a recurring program.
- Sites that require JS rendering or login are not reliably scrapable by a
  lightweight fetcher or GitHub Actions runner; they need a real fetch
  worker (headless browser) regardless of which data/hosting stack you use.
- "Significance"/prestige scoring is inherently subjective and will be
  biased toward well-known global brands, whether scored by a hand-written
  heuristic or by Claude — needs a feedback loop from real user behavior
  (saves/applications) to calibrate over time, not a one-shot prompt or
  rule set.
- Deadline text that doesn't reduce to a single date ("rolling basis",
  "until filled") — both paths must represent this as `null` + a free-text
  note rather than fabricating a date.
