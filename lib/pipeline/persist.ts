import { randomUUID } from "crypto";
import { normalize } from "../dedup";
import { computeOpportunityStatus, isMaterialField } from "../status";
import type { OpportunityExtractionResult } from "../claude/schemas";
import type { Opportunity, OpportunityScore, Organization, OpportunitySourceRef } from "../types";
import {
  createOrganization,
  findOrganizationByNormalizedName,
  saveOpportunity,
} from "../store/jsonStore";

export async function resolveOrganization(name: string): Promise<Organization> {
  const normalizedName = normalize(name);
  const existing = await findOrganizationByNormalizedName(normalizedName);
  if (existing) return existing;

  const created: Organization = {
    id: randomUUID(),
    name,
    normalized_name: normalizedName,
    industry: null,
    website: null,
    logo_url: null,
    description: null,
    reputation_tier: "unknown",
  };
  await createOrganization(created);
  return created;
}

function extractionToOpportunityFields(extraction: OpportunityExtractionResult) {
  return {
    title: extraction.title ?? "Untitled opportunity",
    normalized_title: normalize(extraction.title ?? ""),
    opportunity_type: extraction.opportunity_type,
    tags: extraction.tags,
    description: extraction.description,
    location: extraction.location,
    country: extraction.country,
    work_arrangement: extraction.work_arrangement,
    application_url: extraction.application_url,
    application_deadline: extraction.application_deadline,
    deadline_note: extraction.deadline_note,
    start_date: extraction.start_date,
    end_date: extraction.end_date,
    eligibility_text: extraction.eligibility_text,
    degree_requirements: extraction.degree_requirements,
    year_level_requirements: extraction.year_level_requirements,
    citizenship_requirements: extraction.citizenship_requirements,
    gpa_requirement: extraction.gpa_requirement,
    skills_required: extraction.skills_required,
    compensation: extraction.compensation,
    program_duration: extraction.program_duration,
    sponsorship_available: extraction.sponsorship_available,
    applications_open: extraction.applications_open,
  };
}

const DIFF_FIELDS = [
  "application_deadline",
  "applications_open",
  "eligibility_text",
  "location",
  "work_arrangement",
  "program_duration",
] as const;

function diffFields(existing: Opportunity, incoming: ReturnType<typeof extractionToOpportunityFields>) {
  const changes: { field_name: string; old_value: string | null; new_value: string | null }[] = [];

  for (const field of DIFF_FIELDS) {
    const oldValue = (existing as unknown as Record<string, unknown>)[field];
    const newValue = (incoming as unknown as Record<string, unknown>)[field];
    const oldStr = oldValue === null || oldValue === undefined ? null : String(oldValue);
    const newStr = newValue === null || newValue === undefined ? null : String(newValue);
    if (oldStr !== newStr) changes.push({ field_name: field, old_value: oldStr, new_value: newStr });
  }

  const oldCompensation = JSON.stringify(existing.compensation);
  const newCompensation = JSON.stringify(incoming.compensation);
  if (oldCompensation !== newCompensation) {
    changes.push({ field_name: "compensation", old_value: oldCompensation, new_value: newCompensation });
  }

  return changes;
}

function mapFieldToChangeType(field: string, newValue: string | null): Opportunity["updates"][number]["change_type"] {
  switch (field) {
    case "application_deadline":
      return "deadline_changed";
    case "applications_open":
      return newValue === "true" ? "application_opened" : "application_closed";
    case "eligibility_text":
      return "eligibility_changed";
    case "location":
      return "location_changed";
    case "work_arrangement":
      return "work_arrangement_changed";
    case "compensation":
      return "compensation_changed";
    case "application_url":
      return "url_changed";
    default:
      return "description_changed";
  }
}

export interface PersistNewParams {
  extraction: OpportunityExtractionResult;
  dedupHash: string;
  contentHash: string;
  organizationId: string;
  sourceId: string;
  sourceUrl: string;
  scores: OpportunityScore[];
  needsReview?: boolean;
}

export async function persistNewOpportunity(params: PersistNewParams): Promise<string> {
  const fields = extractionToOpportunityFields(params.extraction);
  const now = new Date().toISOString();

  const status = params.needsReview
    ? "needs_review"
    : computeOpportunityStatus({
        isNewRecord: true,
        hadMaterialFieldChange: false,
        deadlineChanged: false,
        applicationDeadline: fields.application_deadline,
        applicationsOpen: fields.applications_open,
      });

  const sourceRef: OpportunitySourceRef = {
    source_id: params.sourceId,
    source_url: params.sourceUrl,
    first_seen_at: now,
    last_seen_at: now,
  };

  const opportunity: Opportunity = {
    id: randomUUID(),
    organization_id: params.organizationId,
    ...fields,
    primary_source_url: params.sourceUrl,
    dedup_hash: params.dedupHash,
    raw_content_hash: params.contentHash,
    status,
    date_discovered: now,
    date_last_checked: now,
    date_last_updated: now,
    sources: [sourceRef],
    updates: [{ change_type: "new", field_name: null, old_value: null, new_value: null, detected_at: now }],
    scores: params.scores,
  };

  await saveOpportunity(opportunity);
  return opportunity.id;
}

export interface PersistUpdateParams {
  existing: Opportunity;
  extraction: OpportunityExtractionResult;
  contentHash: string;
  sourceId: string;
  sourceUrl: string;
  scores: OpportunityScore[] | null; // null when the diff wasn't material -> no re-score
}

export async function persistOpportunityUpdate(params: PersistUpdateParams): Promise<void> {
  const fields = extractionToOpportunityFields(params.extraction);
  const changes = diffFields(params.existing, fields);
  const now = new Date().toISOString();

  const deadlineChanged = changes.some((c) => c.field_name === "application_deadline");
  const hasMaterialChange = changes.some((c) => isMaterialField(c.field_name) || c.field_name === "compensation");

  const status = computeOpportunityStatus({
    isNewRecord: false,
    hadMaterialFieldChange: hasMaterialChange,
    deadlineChanged,
    applicationDeadline: fields.application_deadline,
    applicationsOpen: fields.applications_open,
  });

  const sources = [...params.existing.sources];
  const existingSourceIdx = sources.findIndex((s) => s.source_url === params.sourceUrl);
  if (existingSourceIdx >= 0) {
    const existingRef = sources[existingSourceIdx]!;
    sources[existingSourceIdx] = { ...existingRef, last_seen_at: now };
  } else {
    sources.push({ source_id: params.sourceId, source_url: params.sourceUrl, first_seen_at: now, last_seen_at: now });
  }

  const newUpdateEntries = changes.map((change) => ({
    change_type: mapFieldToChangeType(change.field_name, change.new_value),
    field_name: change.field_name,
    old_value: change.old_value,
    new_value: change.new_value,
    detected_at: now,
  }));

  const updated: Opportunity = {
    ...params.existing,
    ...fields,
    raw_content_hash: params.contentHash,
    status,
    date_last_checked: now,
    date_last_updated: newUpdateEntries.length > 0 ? now : params.existing.date_last_updated,
    sources,
    updates: [...params.existing.updates, ...newUpdateEntries],
    scores: params.scores ?? params.existing.scores,
  };

  await saveOpportunity(updated);
}
