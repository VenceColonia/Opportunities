import type { OpportunityExtractionResult } from "../claude/schemas";
import type { ExtractedItem } from "./extract";

export interface ValidationResult {
  valid: boolean;
  reasons: string[];
}

const MIN_CORE_FIELD_CONFIDENCE = 0.4;

/**
 * Stage 4: deterministic sanity-checking of Claude's extraction output.
 * A model output is untrusted input — this never trusts it blindly before
 * it touches the database. See ARCHITECTURE.md §9.
 */
export function validateExtraction(extraction: OpportunityExtractionResult): ValidationResult {
  const reasons: string[] = [];

  if (!extraction.title || extraction.title.trim().length < 3) {
    reasons.push("Missing or too-short title.");
  }
  if (!extraction.organization_name || extraction.organization_name.trim().length < 2) {
    reasons.push("Missing organization_name.");
  }
  if (extraction.application_url && !isWellFormedUrl(extraction.application_url)) {
    reasons.push("application_url is not a well-formed URL.");
  }
  if (extraction.application_deadline && !isIsoDate(extraction.application_deadline)) {
    reasons.push("application_deadline is not a valid ISO date.");
  }
  if (extraction.start_date && !isIsoDate(extraction.start_date)) {
    reasons.push("start_date is not a valid ISO date.");
  }
  if (extraction.end_date && !isIsoDate(extraction.end_date)) {
    reasons.push("end_date is not a valid ISO date.");
  }
  if (extraction.gpa_requirement !== null && (extraction.gpa_requirement < 0 || extraction.gpa_requirement > 5)) {
    reasons.push("gpa_requirement is out of plausible range (0-5).");
  }

  const titleConfidence = extraction.extraction_confidence?.title ?? 1;
  const orgConfidence = extraction.extraction_confidence?.organization_name ?? 1;
  if (titleConfidence < MIN_CORE_FIELD_CONFIDENCE || orgConfidence < MIN_CORE_FIELD_CONFIDENCE) {
    reasons.push("Core field extraction confidence too low.");
  }

  return { valid: reasons.length === 0, reasons };
}

export function filterValidExtractions(items: ExtractedItem[]): {
  valid: ExtractedItem[];
  rejected: { item: ExtractedItem; reasons: string[] }[];
} {
  const valid: ExtractedItem[] = [];
  const rejected: { item: ExtractedItem; reasons: string[] }[] = [];

  for (const item of items) {
    const result = validateExtraction(item.extraction);
    if (result.valid) {
      valid.push(item);
    } else {
      rejected.push({ item, reasons: result.reasons });
    }
  }

  return { valid, rejected };
}

function isWellFormedUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime());
}
