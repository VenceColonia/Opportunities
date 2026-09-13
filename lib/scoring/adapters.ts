import type { Opportunity } from "../types";
import type { OpportunityExtractionResult } from "../claude/schemas";

/**
 * Converts an already-persisted Opportunity back into the
 * OpportunityExtractionResult shape, so re-scoring code (heuristic
 * re-runs, or the optional manual/opt-in Claude paths in
 * scripts/export-pending-for-claude.ts and scripts/enrich-with-claude.ts)
 * can reuse the exact same scoring function the initial pipeline run used.
 */
export function opportunityToExtractionDraft(opportunity: Opportunity): OpportunityExtractionResult {
  return {
    title: opportunity.title,
    organization_name: null, // caller supplies organization name separately (see organizationName param on scoring calls)
    opportunity_type: opportunity.opportunity_type,
    tags: opportunity.tags,
    description: opportunity.description,
    location: opportunity.location,
    country: opportunity.country,
    work_arrangement: opportunity.work_arrangement,
    application_url: opportunity.application_url,
    application_deadline: opportunity.application_deadline,
    deadline_note: opportunity.deadline_note,
    start_date: opportunity.start_date,
    end_date: opportunity.end_date,
    eligibility_text: opportunity.eligibility_text,
    degree_requirements: opportunity.degree_requirements,
    year_level_requirements: opportunity.year_level_requirements,
    citizenship_requirements: opportunity.citizenship_requirements,
    gpa_requirement: opportunity.gpa_requirement,
    skills_required: opportunity.skills_required,
    compensation: opportunity.compensation,
    program_duration: opportunity.program_duration,
    sponsorship_available: opportunity.sponsorship_available,
    applications_open: opportunity.applications_open,
    extraction_confidence: {},
    unresolved_fields: [],
  };
}
