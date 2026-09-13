import { promises as fs } from "fs";
import path from "path";
import { getOpportunities, saveOpportunity } from "../lib/store/jsonStore";
import type { OpportunityScoringResult } from "../lib/claude/schemas";
import type { OpportunityScore } from "../lib/types";

// Path A, step 2 (ARCHITECTURE.md §8): merges the JSON you pasted back from
// a free Claude.ai chat into data/opportunities.json, through the same
// validation a real API response would get. No API key, no network call.

const INBOX_PATH = path.join(process.cwd(), "data", "claude-inbox.json");

interface InboxEntry {
  opportunity_id: string;
  profile_id: string;
  scoring: OpportunityScoringResult;
}

function isValidScoring(scoring: unknown): scoring is OpportunityScoringResult {
  if (!scoring || typeof scoring !== "object") return false;
  const s = scoring as Record<string, unknown>;
  const scoreFields = [
    "relevance_score",
    "career_value_score",
    "organization_score",
    "student_fit_score",
    "accessibility_score",
    "urgency_score",
    "overall_score",
  ];
  return (
    scoreFields.every((field) => typeof s[field] === "number" && (s[field] as number) >= 0 && (s[field] as number) <= 100) &&
    typeof s.reasoning === "string" &&
    typeof s.significance_flags === "object"
  );
}

async function main() {
  let raw: string;
  try {
    raw = await fs.readFile(INBOX_PATH, "utf-8");
  } catch {
    // eslint-disable-next-line no-console
    console.error(`No ${INBOX_PATH} found. Run 'npm run pipeline:export-pending' first, then paste Claude's responses there.`);
    process.exit(1);
    return;
  }

  const entries = JSON.parse(raw) as InboxEntry[];
  const opportunities = await getOpportunities();
  let applied = 0;
  let skipped = 0;

  for (const entry of entries) {
    const opportunity = opportunities.find((o) => o.id === entry.opportunity_id);
    if (!opportunity) {
      // eslint-disable-next-line no-console
      console.warn(`Skipping unknown opportunity_id ${entry.opportunity_id}`);
      skipped++;
      continue;
    }

    if (!isValidScoring(entry.scoring)) {
      // eslint-disable-next-line no-console
      console.warn(`Skipping malformed scoring for ${entry.opportunity_id} — Claude's output is untrusted input and must validate before it touches the store.`);
      skipped++;
      continue;
    }

    const newScore: OpportunityScore = {
      profile_id: entry.profile_id,
      relevance_score: entry.scoring.relevance_score,
      career_value_score: entry.scoring.career_value_score,
      organization_score: entry.scoring.organization_score,
      student_fit_score: entry.scoring.student_fit_score,
      accessibility_score: entry.scoring.accessibility_score,
      urgency_score: entry.scoring.urgency_score,
      overall_score: entry.scoring.overall_score,
      is_prestigious: entry.scoring.significance_flags.is_prestigious,
      is_selective: entry.scoring.significance_flags.is_selective,
      is_hard_to_discover: entry.scoring.significance_flags.is_hard_to_discover,
      is_time_sensitive: entry.scoring.significance_flags.is_time_sensitive,
      reasoning: entry.scoring.reasoning,
      scoring_method: "claude",
      scored_at: new Date().toISOString(),
    };

    const otherScores = opportunity.scores.filter((s) => s.profile_id !== entry.profile_id);
    opportunity.scores = [...otherScores, newScore];
    await saveOpportunity(opportunity);
    applied++;
  }

  // eslint-disable-next-line no-console
  console.log(`Applied ${applied} score(s), skipped ${skipped}.`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
