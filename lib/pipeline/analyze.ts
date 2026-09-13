import type { OpportunityExtractionResult } from "../claude/schemas";
import type { Organization, OpportunityScore, StudentProfile } from "../types";
import { scoreHeuristically } from "../scoring/heuristics";

/**
 * Stage 6: score one opportunity against every profile in
 * data/profile.json using the deterministic heuristic scorer — no LLM call
 * on the automated path. See ARCHITECTURE.md §7 and §1 for the optional
 * manual/opt-in Claude alternative (lib/claude/client.ts::scoreOpportunityForProfile).
 */
export function scoreForAllProfiles(
  extraction: OpportunityExtractionResult,
  organization: Organization | null,
  profiles: StudentProfile[]
): OpportunityScore[] {
  return profiles.map((profile) => {
    const result = scoreHeuristically({ extraction, organization, profile });
    return {
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
      scoring_method: "heuristic",
      scored_at: new Date().toISOString(),
    };
  });
}
