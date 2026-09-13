import type { OpportunityStatus } from "./types";

const DEFAULT_CLOSING_SOON_DAYS = Number(
  process.env.CLOSING_SOON_THRESHOLD_DAYS ?? 7
);

export interface StatusInput {
  isNewRecord: boolean;
  hadMaterialFieldChange: boolean;
  deadlineChanged: boolean;
  applicationDeadline: string | null; // ISO date
  applicationsOpen: boolean | null;
  now?: Date;
  closingSoonThresholdDays?: number;
}

/**
 * Pure function: (previous state signals, now) -> status.
 * Claude never sets this directly — see ARCHITECTURE.md §8.
 */
export function computeOpportunityStatus(input: StatusInput): OpportunityStatus {
  const now = input.now ?? new Date();
  const thresholdDays = input.closingSoonThresholdDays ?? DEFAULT_CLOSING_SOON_DAYS;

  if (input.applicationsOpen === false) return "closed";

  if (input.applicationDeadline) {
    const deadline = new Date(input.applicationDeadline);
    if (deadline.getTime() < now.getTime()) return "closed";

    const msUntilDeadline = deadline.getTime() - now.getTime();
    const daysUntilDeadline = msUntilDeadline / (1000 * 60 * 60 * 24);
    if (daysUntilDeadline <= thresholdDays) return "closing_soon";
  }

  if (input.isNewRecord) return "new";
  if (input.deadlineChanged) return "deadline_changed";
  if (input.hadMaterialFieldChange) return "updated";

  return "active";
}

/** Fields whose change is material enough to trigger re-scoring and an
 * opportunity_updates row. Cosmetic diffs (description whitespace, etc.)
 * are intentionally excluded — see ARCHITECTURE.md §4. */
export const MATERIAL_FIELDS = [
  "application_deadline",
  "applications_open",
  "eligibility_text",
  "degree_requirements",
  "year_level_requirements",
  "citizenship_requirements",
  "gpa_requirement",
  "location",
  "work_arrangement",
  "compensation_amount",
  "compensation_currency",
  "compensation_period",
  "application_url",
] as const;

export type MaterialField = (typeof MATERIAL_FIELDS)[number];

export function isMaterialField(field: string): field is MaterialField {
  return (MATERIAL_FIELDS as readonly string[]).includes(field);
}
