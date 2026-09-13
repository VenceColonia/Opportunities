import type { Opportunity, OpportunityScore } from "../types";

export function getScoreForProfile(opportunity: Opportunity, profileId: string): OpportunityScore | null {
  return opportunity.scores.find((s) => s.profile_id === profileId) ?? null;
}

export function sortByOverallScoreDesc(opportunities: Opportunity[], profileId: string): Opportunity[] {
  return [...opportunities].sort((a, b) => {
    const scoreA = getScoreForProfile(a, profileId)?.overall_score ?? -1;
    const scoreB = getScoreForProfile(b, profileId)?.overall_score ?? -1;
    return scoreB - scoreA;
  });
}
