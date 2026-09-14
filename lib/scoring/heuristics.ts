import type { OpportunityExtractionResult, OpportunityScoringResult } from "../claude/schemas";
import type { Organization, StudentProfile, WorkArrangement } from "../types";
import { SCORE_WEIGHTS } from "./weights";

// Deterministic, $0 substitute for Claude extraction + scoring — see
// ARCHITECTURE.md §7. Intentionally simple and inspectable: every rule here
// is a plain keyword/regex check, not a black box. Anything not confidently
// matched is left null/false/empty rather than guessed, same rule Claude's
// extraction prompt follows.

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

const TYPE_KEYWORDS: [OpportunityExtractionResult["opportunity_type"], RegExp][] = [
  ["case_competition", /case\s+competition/i],
  ["management_trainee", /management\s+trainee|graduate\s+trainee|\bMT\s+program/i],
  ["graduate_program", /graduate\s+program|graduate\s+scheme/i],
  ["leadership_program", /leadership\s+(program|development|academy)/i],
  ["fellowship", /fellowship/i],
  ["scholarship", /scholarship/i],
  ["conference", /conference|summit|forum\b/i],
  ["competition", /competition|hackathon|challenge\b/i],
  ["internship", /internship|intern\b/i],
  ["consulting", /consulting|consultant/i],
  ["finance", /finance|investment\s+banking|financial\s+analyst/i],
  ["marketing", /marketing|brand\s+management/i],
  ["operations", /operations|supply\s+chain|logistics/i],
  ["data_analytics", /data\s+analytics|data\s+analyst|business\s+intelligence/i],
  ["strategy", /strategy|strategic/i],
  ["technology", /software|technology|\bIT\b/i],
  ["entrepreneurship", /entrepreneur|startup/i],
];

const FUNCTION_TAGS: [string, RegExp][] = [
  ["Consulting", /consulting|consultant/i],
  ["Finance", /finance|investment\s+banking/i],
  ["Marketing", /marketing|brand/i],
  ["Operations", /operations|supply\s+chain|logistics/i],
  ["Data Analytics", /data\s+analytics|data\s+analyst/i],
  ["Strategy", /strategy|strategic/i],
  ["Technology", /technology|software/i],
  ["Entrepreneurship", /entrepreneur|startup/i],
  ["Client Management", /client\s+management|account\s+management/i],
  ["Project Management", /project\s+management/i],
];

const DEADLINE_PATTERN =
  /(?:deadline|apply\s+by|closing\s+date|closes\s+on|due\s+date|due)[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i;

const GPA_PATTERN = /(?:gpa|grade\s+point\s+average)[^\d]{0,12}(\d\.\d{1,2})/i;

const CURRENCY_PATTERN = /(PHP|₱|USD|\$)\s?([\d,]{2,})/;

const DURATION_PATTERN = /(\d{1,2})\s*[- ]?(month|months|week|weeks)/i;

const SKILL_KEYWORDS = [
  "Excel",
  "SQL",
  "Python",
  "PowerPoint",
  "Power BI",
  "Tableau",
  "Financial Modeling",
  "Communication",
  "Leadership",
  "R\\b",
];

function toIsoDate(raw: string): string | null {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function extractHeuristically(params: {
  title: string;
  rawContent: string;
}): OpportunityExtractionResult {
  const text = `${params.title}\n${params.rawContent}`;
  const confidence: Record<string, number> = {};
  const unresolved: string[] = [];

  let opportunity_type: OpportunityExtractionResult["opportunity_type"] = "other";
  for (const [type, pattern] of TYPE_KEYWORDS) {
    if (pattern.test(text)) {
      opportunity_type = type;
      confidence.opportunity_type = 0.7;
      break;
    }
  }
  if (opportunity_type === "other") {
    confidence.opportunity_type = 0.3;
    unresolved.push("opportunity_type");
  }

  const tags = FUNCTION_TAGS.filter(([, pattern]) => pattern.test(text)).map(([tag]) => tag);

  let work_arrangement: WorkArrangement = "unknown";
  if (/\bremote\b/i.test(text)) work_arrangement = "remote";
  else if (/\bhybrid\b/i.test(text)) work_arrangement = "hybrid";
  else if (/\bon-?site\b|in[- ]office/i.test(text)) work_arrangement = "onsite";
  else unresolved.push("work_arrangement");

  let application_deadline: string | null = null;
  let deadline_note: string | null = null;
  const deadlineMatch = text.match(DEADLINE_PATTERN);
  if (deadlineMatch) {
    const iso = toIsoDate(deadlineMatch[1] ?? "");
    if (iso) {
      application_deadline = iso;
      confidence.application_deadline = 0.75;
    } else {
      deadline_note = deadlineMatch[0];
      confidence.application_deadline = 0.3;
    }
  } else {
    unresolved.push("application_deadline");
  }

  const degree_requirements: string[] = [];
  if (/\bMBA\b/i.test(text)) degree_requirements.push("MBA");
  if (/master'?s? degree/i.test(text)) degree_requirements.push("Master's degree");
  if (/bachelor'?s? degree|undergraduate/i.test(text)) degree_requirements.push("Bachelor's degree");
  if (degree_requirements.length === 0) unresolved.push("degree_requirements");

  const year_level_requirements: string[] = [];
  const yearPatterns: [RegExp, string][] = [
    [/1st\s*year|freshman/i, "1st year"],
    [/2nd\s*year|sophomore/i, "2nd year"],
    [/3rd\s*year|junior\b/i, "3rd year"],
    [/4th\s*year|senior\b|final\s*year|graduating/i, "4th year"],
  ];
  for (const [pattern, label] of yearPatterns) {
    if (pattern.test(text)) year_level_requirements.push(label);
  }
  if (year_level_requirements.length === 0) unresolved.push("year_level_requirements");

  const citizenship_requirements: string[] = [];
  const citizenshipMatch = text.match(/([A-Za-z]+)\s+citizens?\b/i);
  if (citizenshipMatch) citizenship_requirements.push(`${citizenshipMatch[1]} citizens`);
  else unresolved.push("citizenship_requirements");

  let gpa_requirement: number | null = null;
  const gpaMatch = text.match(GPA_PATTERN);
  if (gpaMatch) {
    gpa_requirement = Number(gpaMatch[1]);
    confidence.gpa_requirement = 0.7;
  } else {
    unresolved.push("gpa_requirement");
  }

  const skills_required = SKILL_KEYWORDS.filter((skill) => new RegExp(`\\b${skill}\\b`, "i").test(text)).map(
    (skill) => skill.replace("\\b", "")
  );

  let compensation_amount: number | null = null;
  let compensation_currency: string | null = null;
  const currencyMatch = text.match(CURRENCY_PATTERN);
  if (currencyMatch) {
    compensation_currency = currencyMatch[1] === "$" ? "USD" : (currencyMatch[1] ?? null);
    compensation_amount = Number((currencyMatch[2] ?? "0").replace(/,/g, ""));
    confidence.compensation = 0.6;
  } else {
    unresolved.push("compensation");
  }
  let compensation_period: string | null = null;
  if (/per\s+month|monthly/i.test(text)) compensation_period = "monthly";
  else if (/stipend/i.test(text)) compensation_period = "stipend";

  let program_duration: string | null = null;
  const durationMatch = text.match(DURATION_PATTERN);
  if (durationMatch) {
    program_duration = `${durationMatch[1]} ${durationMatch[2]}`;
    confidence.program_duration = 0.6;
  } else {
    unresolved.push("program_duration");
  }

  let sponsorship_available: boolean | null = null;
  if (/visa\s+sponsorship\s+(is\s+)?available|will\s+sponsor/i.test(text)) sponsorship_available = true;
  else if (/no\s+(visa\s+)?sponsorship|not\s+able\s+to\s+sponsor/i.test(text)) sponsorship_available = false;
  else unresolved.push("sponsorship_available");

  let applications_open: boolean | null = true;
  if (/no\s+longer\s+accepting|applications?\s+(are\s+)?closed|position\s+filled/i.test(text)) {
    applications_open = false;
  }

  // Includes "-" and "/" so common forms like "Remote - Philippines" or
  // "Manila / Remote" resolve instead of silently matching nothing (a real
  // gap: this pattern is how Greenhouse and many other boards phrase it).
  const locationMatch = text.match(/(?:location|based\s+in)[:\s]+([A-Za-z ,/-]+?)(?:\.|\n|$)/i);

  return {
    title: params.title || null,
    organization_name: null, // filled in by the caller from source metadata — see extract.ts
    opportunity_type,
    tags,
    description: params.rawContent.slice(0, 2000) || null,
    location: locationMatch?.[1] ? locationMatch[1].trim() : null,
    country: null,
    work_arrangement,
    application_url: null, // filled in by the caller (the source URL itself)
    application_deadline,
    deadline_note,
    start_date: null,
    end_date: null,
    eligibility_text: null,
    degree_requirements,
    year_level_requirements,
    citizenship_requirements,
    gpa_requirement,
    skills_required,
    compensation: {
      amount: compensation_amount,
      currency: compensation_currency,
      period: compensation_period,
      notes: null,
    },
    program_duration,
    sponsorship_available,
    applications_open,
    extraction_confidence: confidence,
    unresolved_fields: unresolved,
  };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const REPUTATION_TIER_SCORES: Record<string, number> = {
  global_top_tier: 90,
  regional_leader: 75,
  notable: 60,
  unknown: 40,
};

function daysUntil(dateIso: string | null): number | null {
  if (!dateIso) return null;
  const ms = new Date(dateIso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

export function scoreHeuristically(params: {
  extraction: OpportunityExtractionResult;
  organization: Organization | null;
  profile: StudentProfile;
}): OpportunityScoringResult {
  const { extraction, organization, profile } = params;

  const coreBusinessTypes = new Set([
    "internship",
    "leadership_program",
    "consulting",
    "finance",
    "management_trainee",
    "graduate_program",
  ]);
  const relevance_score = clamp(
    50 + extraction.tags.length * 10 + (coreBusinessTypes.has(extraction.opportunity_type) ? 10 : 0)
  );

  const highValueTypes = new Set(["leadership_program", "fellowship", "management_trainee", "graduate_program", "case_competition"]);
  const career_value_score = clamp(
    40 +
      (highValueTypes.has(extraction.opportunity_type) ? 20 : 0) +
      (extraction.compensation.amount ? 15 : 0) +
      (extraction.program_duration ? 10 : 0) +
      (extraction.sponsorship_available === true ? 10 : 0) -
      (extraction.opportunity_type === "other" ? 10 : 0)
  );

  const organization_score = REPUTATION_TIER_SCORES[organization?.reputation_tier ?? "unknown"] ?? 40;

  const interestOverlap = profile.interests.filter((interest) =>
    extraction.tags.some((tag) => tag.toLowerCase().includes(interest.toLowerCase()))
  ).length;
  const yearMatches =
    extraction.year_level_requirements.length === 0 ||
    extraction.year_level_requirements.some((yr) => profile.year_level && yr.toLowerCase().includes(profile.year_level.toLowerCase()));
  const degreeMatches =
    extraction.degree_requirements.length === 0 ||
    extraction.degree_requirements.some((deg) => profile.degree && deg.toLowerCase().includes("bachelor"));
  const student_fit_score = clamp(
    30 + Math.min(interestOverlap, 4) * 10 + (yearMatches ? 15 : 0) + (degreeMatches ? 15 : 0)
  );

  let accessibility_score = 70;
  if (extraction.citizenship_requirements.length > 0 && profile.citizenship) {
    const matches = extraction.citizenship_requirements.some((req) =>
      req.toLowerCase().includes(profile.citizenship!.toLowerCase())
    );
    if (!matches) accessibility_score -= 30;
  }
  if (
    extraction.work_arrangement !== "unknown" &&
    profile.preferred_work_arrangement !== "unknown" &&
    extraction.work_arrangement !== profile.preferred_work_arrangement
  ) {
    accessibility_score -= 20;
  }
  if (extraction.gpa_requirement !== null && profile.gpa !== null && profile.gpa < extraction.gpa_requirement) {
    accessibility_score -= 20;
  }
  if (
    profile.geography_priority.length > 0 &&
    extraction.country &&
    !profile.geography_priority.some((geo) => extraction.country!.toLowerCase().includes(geo.toLowerCase()))
  ) {
    accessibility_score -= 15;
  }
  accessibility_score = clamp(accessibility_score);

  const days = daysUntil(extraction.application_deadline);
  let urgency_score: number;
  if (days === null) urgency_score = 20;
  else if (days <= 3) urgency_score = 100;
  else if (days <= 7) urgency_score = 85;
  else if (days <= 14) urgency_score = 65;
  else if (days <= 30) urgency_score = 45;
  else urgency_score = 25;

  const overall_score = Math.round(
    relevance_score * SCORE_WEIGHTS.relevance +
      career_value_score * SCORE_WEIGHTS.career_value +
      organization_score * SCORE_WEIGHTS.organization +
      student_fit_score * SCORE_WEIGHTS.student_fit +
      accessibility_score * SCORE_WEIGHTS.accessibility +
      urgency_score * SCORE_WEIGHTS.urgency
  );

  const is_prestigious = organization_score >= 75 && highValueTypes.has(extraction.opportunity_type);
  const is_selective = highValueTypes.has(extraction.opportunity_type);
  const is_hard_to_discover = organization_score >= 60 && extraction.tags.length <= 1;
  const is_time_sensitive = urgency_score >= 65;

  const reasoning = buildReasoning({
    profile,
    extraction,
    organizationScore: organization_score,
    accessibilityScore: accessibility_score,
    urgencyScore: urgency_score,
  });

  return {
    relevance_score,
    career_value_score,
    organization_score,
    student_fit_score,
    accessibility_score,
    urgency_score,
    overall_score,
    significance_flags: { is_prestigious, is_selective, is_hard_to_discover, is_time_sensitive },
    reasoning,
  };
}

function buildReasoning(params: {
  profile: StudentProfile;
  extraction: OpportunityExtractionResult;
  organizationScore: number;
  accessibilityScore: number;
  urgencyScore: number;
}): string {
  const { profile, extraction, organizationScore, accessibilityScore, urgencyScore } = params;
  const parts: string[] = [];

  const matchedInterests = profile.interests.filter((interest) =>
    extraction.tags.some((tag) => tag.toLowerCase().includes(interest.toLowerCase()))
  );
  if (matchedInterests.length > 0) {
    parts.push(`Matches your interest in ${matchedInterests.slice(0, 2).join(" and ")}.`);
  }

  if (organizationScore >= 75) parts.push("Recognized employer.");
  if (accessibilityScore < 50) parts.push("Eligibility or location may limit access.");
  if (urgencyScore >= 85) parts.push("Deadline is approaching.");

  return parts.length > 0 ? parts.join(" ") : "General fit based on role and location.";
}
