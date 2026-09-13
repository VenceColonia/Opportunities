import type { Opportunity, OpportunityFilters, Organization } from "../types";
import { getScoreForProfile } from "../scoring/helpers";

const METRO_MANILA_PATTERN =
  /manila|philippines|\bph\b|\bncr\b|quezon city|makati|taguig|bgc|pasig|mandaluyong|paranaque|pasay|caloocan|marikina|muntinlupa/i;

/**
 * The dashboard is scoped to opportunities workable from Metro Manila:
 * anything explicitly based there, plus anything fully remote (workable
 * from anywhere, Manila included). An opportunity is only excluded when
 * it's explicitly onsite/hybrid in a *known*, non-Manila location — most
 * heuristic extractions leave location/work_arrangement unresolved, and
 * an unresolved field isn't evidence the opportunity is irrelevant, so
 * those are kept rather than guessed away.
 */
export function isMetroManilaRelevant(opportunity: Opportunity): boolean {
  const haystack = `${opportunity.location ?? ""} ${opportunity.country ?? ""}`;
  if (METRO_MANILA_PATTERN.test(haystack)) return true;
  if (opportunity.work_arrangement === "remote") return true;

  const isKnownOtherLocation = haystack.trim().length > 0;
  if ((opportunity.work_arrangement === "onsite" || opportunity.work_arrangement === "hybrid") && isKnownOtherLocation) {
    return false;
  }

  return true;
}

/**
 * Deterministic, client-side keyword filtering — the $0 substitute for
 * Claude-parsed natural-language search (ARCHITECTURE.md §9). Structured
 * filters (type/arrangement/score) are applied exactly; `query` does a
 * plain substring match across title/organization/tags/location.
 */
export function applyFilters(
  opportunities: Opportunity[],
  organizations: Organization[],
  profileId: string,
  filters: OpportunityFilters
): Opportunity[] {
  const orgById = new Map(organizations.map((o) => [o.id, o]));

  return opportunities.filter((opp) => {
    if (filters.opportunity_types?.length && !filters.opportunity_types.includes(opp.opportunity_type)) {
      return false;
    }
    if (filters.work_arrangements?.length && !filters.work_arrangements.includes(opp.work_arrangement)) {
      return false;
    }
    if (filters.status?.length && !filters.status.includes(opp.status)) {
      return false;
    }
    if (filters.min_score !== undefined) {
      const score = getScoreForProfile(opp, profileId)?.overall_score ?? 0;
      if (score < filters.min_score) return false;
    }
    if (filters.locations?.length) {
      const matchesLocation = filters.locations.some((loc) => opp.location?.toLowerCase().includes(loc.toLowerCase()));
      if (!matchesLocation) return false;
    }
    if (filters.year_levels?.length) {
      const matches =
        opp.year_level_requirements.length === 0 ||
        opp.year_level_requirements.some((yr) => filters.year_levels!.some((fy) => yr.toLowerCase().includes(fy.toLowerCase())));
      if (!matches) return false;
    }
    if (filters.organization) {
      const org = orgById.get(opp.organization_id);
      if (!org?.name.toLowerCase().includes(filters.organization.toLowerCase())) return false;
    }
    if (filters.deadline_before) {
      if (!opp.application_deadline || opp.application_deadline > filters.deadline_before) return false;
    }
    if (filters.query) {
      const org = orgById.get(opp.organization_id);
      const haystack = [opp.title, org?.name ?? "", opp.location ?? "", ...opp.tags].join(" ").toLowerCase();
      if (!haystack.includes(filters.query.toLowerCase())) return false;
    }

    return true;
  });
}
