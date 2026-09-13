import { getOpportunities, getOrganizations, getProfiles, saveOpportunity } from "../lib/store/jsonStore";
import { scoreOpportunityForProfile } from "../lib/claude/client";
import { opportunityToExtractionDraft } from "../lib/scoring/adapters";
import type { OpportunityScore } from "../lib/types";

// Path B (ARCHITECTURE.md §8): opt-in, uses your own ANTHROPIC_API_KEY, and
// WILL incur a small real cost. This script is never invoked by
// .github/workflows/pipeline.yml — only run it yourself, deliberately, when
// you've decided that tradeoff is worth it. See OPTIONAL_SCALE_UP.md for
// cost estimates at higher volume than a manual run implies.

function daysUntil(dateIso: string | null): number | null {
  if (!dateIso) return null;
  return Math.ceil((new Date(dateIso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    // eslint-disable-next-line no-console
    console.error(
      "ANTHROPIC_API_KEY is not set. This script is opt-in and will call the metered Claude API — set the key only if you've decided to accept that cost."
    );
    process.exit(1);
    return;
  }

  const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 10);

  const [opportunities, organizations, profiles] = await Promise.all([
    getOpportunities(),
    getOrganizations(),
    getProfiles(),
  ]);

  const pending = opportunities.filter((opp) =>
    profiles.some((p) => {
      const score = opp.scores.find((s) => s.profile_id === p.id);
      return !score || score.scoring_method === "heuristic";
    })
  );

  let callsMade = 0;

  for (const opp of pending) {
    if (callsMade >= limit) break;

    const organization = organizations.find((o) => o.id === opp.organization_id);
    const draft = opportunityToExtractionDraft(opp);

    const newScores: OpportunityScore[] = [...opp.scores];

    for (const profile of profiles) {
      if (callsMade >= limit) break;
      const existing = newScores.find((s) => s.profile_id === profile.id);
      if (existing && existing.scoring_method === "claude") continue;

      const result = await scoreOpportunityForProfile({
        opportunity: draft,
        organizationName: organization?.name ?? "unknown",
        profile,
        daysUntilDeadline: daysUntil(opp.application_deadline),
      });
      callsMade++;

      const scoreEntry: OpportunityScore = {
        profile_id: profile.id,
        relevance_score: result.relevance_score,
        career_value_score: result.career_value_score,
        organization_score: result.organization_score,
        student_fit_score: result.student_fit_score,
        accessibility_score: result.accessibility_score,
        urgency_score: result.urgency_score,
        overall_score: result.overall_score,
        is_prestigious: result.significance_flags.is_prestigious,
        is_selective: result.significance_flags.is_selective,
        is_hard_to_discover: result.significance_flags.is_hard_to_discover,
        is_time_sensitive: result.significance_flags.is_time_sensitive,
        reasoning: result.reasoning,
        scoring_method: "claude",
        scored_at: new Date().toISOString(),
      };

      const idx = newScores.findIndex((s) => s.profile_id === profile.id);
      if (idx >= 0) newScores[idx] = scoreEntry;
      else newScores.push(scoreEntry);
    }

    opp.scores = newScores;
    await saveOpportunity(opp);
  }

  // eslint-disable-next-line no-console
  console.log(`Made ${callsMade} Claude API call(s) (limit was ${limit}). This incurred real, metered cost.`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
