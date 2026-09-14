import type { Opportunity, OpportunityFilters, Organization } from "../types";
import { getScoreForProfile } from "../scoring/helpers";

const PHILIPPINES_PATTERN =
  /manila|philippines|\bph\b|\bncr\b|quezon city|makati|taguig|bgc|pasig|mandaluyong|paranaque|pasay|caloocan|marikina|muntinlupa/i;

// Wording that means "no geographic restriction at all," as opposed to a
// location field that just happens not to say the Philippines — "Remote -
// Worldwide" is genuinely open; "Remote - US" or a bare city name like
// "Dublin" is not.
const OPEN_ANYWHERE_PATTERN = /\b(worldwide|global|anywhere|any\s*location|remote[- ]first)\b/i;

/**
 * The dashboard is scoped to the Philippines specifically, not "remote from
 * anywhere": kept if the opportunity explicitly mentions the Philippines/
 * Manila, or is remote with no location restriction stated at all (an empty
 * location field, or wording like "Remote - Worldwide"). Any other
 * *specific* location text — "Remote - US", "Dublin", "London, UK" — is
 * excluded, since that means the role is tied to that place even when it's
 * technically "remote" within it. This replaced a looser "any remote job
 * counts" rule that let through a lot of country-restricted postings from
 * global companies (Stripe/Airbnb postings scoped to "Remote - US" etc.) —
 * exactly the clutter this is meant to cut.
 */
export function isPhilippinesRelevant(opportunity: Opportunity): boolean {
  const haystack = `${opportunity.location ?? ""} ${opportunity.country ?? ""}`.trim();

  if (PHILIPPINES_PATTERN.test(haystack)) return true;

  const namesASpecificOtherPlace = haystack.length > 0 && !OPEN_ANYWHERE_PATTERN.test(haystack);
  if (namesASpecificOtherPlace) return false;

  // No location text at all (or only "open anywhere" wording) — the only
  // remaining positive signal is an explicitly unrestricted remote role.
  return opportunity.work_arrangement === "remote";
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
