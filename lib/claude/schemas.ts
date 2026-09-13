// JSON Schemas for Claude's structured outputs (used as tool-use input
// schemas — see client.ts). Keeping these as plain JSON Schema objects
// (rather than e.g. zod-only) means they can be handed directly to the
// Anthropic SDK's tool definition.

export const OPPORTUNITY_TYPES = [
  "internship",
  "leadership_program",
  "fellowship",
  "scholarship",
  "competition",
  "case_competition",
  "consulting",
  "finance",
  "marketing",
  "operations",
  "data_analytics",
  "strategy",
  "technology",
  "entrepreneurship",
  "management_trainee",
  "graduate_program",
  "conference",
  "other",
] as const;

export const extractionToolSchema = {
  name: "record_opportunity_extraction",
  description:
    "Record structured fields extracted from a raw opportunity posting. Use null for any field not explicitly stated in the source text — never infer or fabricate a value.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: ["string", "null"] },
      organization_name: { type: ["string", "null"] },
      opportunity_type: { type: "string", enum: OPPORTUNITY_TYPES },
      tags: { type: "array", items: { type: "string" } },
      description: { type: ["string", "null"] },
      location: { type: ["string", "null"] },
      country: { type: ["string", "null"] },
      work_arrangement: {
        type: "string",
        enum: ["onsite", "hybrid", "remote", "unknown"],
      },
      application_url: { type: ["string", "null"] },
      application_deadline: {
        type: ["string", "null"],
        description: "ISO date YYYY-MM-DD, or null if no fixed date is stated",
      },
      deadline_note: {
        type: ["string", "null"],
        description: "Free-text note when the deadline isn't a fixed date, e.g. 'rolling basis'",
      },
      start_date: { type: ["string", "null"] },
      end_date: { type: ["string", "null"] },
      eligibility_text: { type: ["string", "null"] },
      degree_requirements: { type: "array", items: { type: "string" } },
      year_level_requirements: { type: "array", items: { type: "string" } },
      citizenship_requirements: { type: "array", items: { type: "string" } },
      gpa_requirement: { type: ["number", "null"] },
      skills_required: { type: "array", items: { type: "string" } },
      compensation: {
        type: "object",
        properties: {
          amount: { type: ["number", "null"] },
          currency: { type: ["string", "null"] },
          period: { type: ["string", "null"] },
          notes: { type: ["string", "null"] },
        },
        required: ["amount", "currency", "period", "notes"],
      },
      program_duration: { type: ["string", "null"] },
      sponsorship_available: { type: ["boolean", "null"] },
      applications_open: { type: ["boolean", "null"] },
      extraction_confidence: {
        type: "object",
        description: "Map of field name -> confidence 0.0-1.0 for fields you populated",
        additionalProperties: { type: "number" },
      },
      unresolved_fields: {
        type: "array",
        items: { type: "string" },
        description: "Names of fields the source text did not state, left null",
      },
    },
    required: [
      "title",
      "organization_name",
      "opportunity_type",
      "tags",
      "description",
      "location",
      "country",
      "work_arrangement",
      "application_url",
      "application_deadline",
      "deadline_note",
      "start_date",
      "end_date",
      "eligibility_text",
      "degree_requirements",
      "year_level_requirements",
      "citizenship_requirements",
      "gpa_requirement",
      "skills_required",
      "compensation",
      "program_duration",
      "sponsorship_available",
      "applications_open",
      "extraction_confidence",
      "unresolved_fields",
    ],
  },
} as const;

export const scoringToolSchema = {
  name: "record_opportunity_score",
  description:
    "Record the six sub-scores, the weighted overall score, significance flags, and a short human-readable justification for an opportunity evaluated against one student profile.",
  input_schema: {
    type: "object",
    properties: {
      relevance_score: { type: "integer", minimum: 0, maximum: 100 },
      career_value_score: { type: "integer", minimum: 0, maximum: 100 },
      organization_score: { type: "integer", minimum: 0, maximum: 100 },
      student_fit_score: { type: "integer", minimum: 0, maximum: 100 },
      accessibility_score: { type: "integer", minimum: 0, maximum: 100 },
      urgency_score: { type: "integer", minimum: 0, maximum: 100 },
      overall_score: { type: "integer", minimum: 0, maximum: 100 },
      significance_flags: {
        type: "object",
        properties: {
          is_prestigious: { type: "boolean" },
          is_selective: { type: "boolean" },
          is_hard_to_discover: { type: "boolean" },
          is_time_sensitive: { type: "boolean" },
        },
        required: ["is_prestigious", "is_selective", "is_hard_to_discover", "is_time_sensitive"],
      },
      reasoning: {
        type: "string",
        description: "1-3 sentences, human-readable, specific to this student and this opportunity",
      },
    },
    required: [
      "relevance_score",
      "career_value_score",
      "organization_score",
      "student_fit_score",
      "accessibility_score",
      "urgency_score",
      "overall_score",
      "significance_flags",
      "reasoning",
    ],
  },
} as const;

export const dedupTieBreakToolSchema = {
  name: "record_dedup_decision",
  description: "Decide whether two opportunity summaries refer to the same real-world opportunity.",
  input_schema: {
    type: "object",
    properties: {
      same_opportunity: { type: "boolean" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      reason: { type: "string" },
    },
    required: ["same_opportunity", "confidence", "reason"],
  },
} as const;

export const searchFilterToolSchema = {
  name: "record_search_filters",
  description:
    "Translate a natural-language opportunity search query into structured filters. Only populate fields the query actually implies; leave everything else absent.",
  input_schema: {
    type: "object",
    properties: {
      opportunity_types: { type: "array", items: { type: "string", enum: OPPORTUNITY_TYPES } },
      work_arrangements: {
        type: "array",
        items: { type: "string", enum: ["onsite", "hybrid", "remote"] },
      },
      locations: { type: "array", items: { type: "string" } },
      year_levels: { type: "array", items: { type: "string" } },
      min_score: { type: ["integer", "null"] },
      keywords: {
        type: "array",
        items: { type: "string" },
        description: "Residual free-text keywords not captured by the structured fields above",
      },
    },
    required: ["opportunity_types", "work_arrangements", "locations", "year_levels", "min_score", "keywords"],
  },
} as const;

export interface CompensationDraft {
  amount: number | null;
  currency: string | null;
  period: string | null;
  notes: string | null;
}

export interface OpportunityExtractionResult {
  title: string | null;
  organization_name: string | null;
  opportunity_type: (typeof OPPORTUNITY_TYPES)[number];
  tags: string[];
  description: string | null;
  location: string | null;
  country: string | null;
  work_arrangement: "onsite" | "hybrid" | "remote" | "unknown";
  application_url: string | null;
  application_deadline: string | null;
  deadline_note: string | null;
  start_date: string | null;
  end_date: string | null;
  eligibility_text: string | null;
  degree_requirements: string[];
  year_level_requirements: string[];
  citizenship_requirements: string[];
  gpa_requirement: number | null;
  skills_required: string[];
  compensation: CompensationDraft;
  program_duration: string | null;
  sponsorship_available: boolean | null;
  applications_open: boolean | null;
  extraction_confidence: Record<string, number>;
  unresolved_fields: string[];
}

export interface OpportunityScoringResult {
  relevance_score: number;
  career_value_score: number;
  organization_score: number;
  student_fit_score: number;
  accessibility_score: number;
  urgency_score: number;
  overall_score: number;
  significance_flags: {
    is_prestigious: boolean;
    is_selective: boolean;
    is_hard_to_discover: boolean;
    is_time_sensitive: boolean;
  };
  reasoning: string;
}

export interface DedupTieBreakResult {
  same_opportunity: boolean;
  confidence: number;
  reason: string;
}

export interface SearchFilterResult {
  opportunity_types: string[];
  work_arrangements: string[];
  locations: string[];
  year_levels: string[];
  min_score: number | null;
  keywords: string[];
}
