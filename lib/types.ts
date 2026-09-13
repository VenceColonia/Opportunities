// Shared TypeScript types for the $0 flat-file architecture.
// These mirror data/*.json record shapes 1:1 — lib/store/jsonStore.ts is the
// only module that reads/writes the files themselves; every other module
// works with these types. Kept close in shape to the optional Supabase
// schema (see OPTIONAL_SCALE_UP.md) so migrating later is a data migration,
// not a rewrite.

export type WorkArrangement = "onsite" | "hybrid" | "remote" | "unknown";

export type OpportunityType =
  | "internship"
  | "leadership_program"
  | "fellowship"
  | "scholarship"
  | "competition"
  | "case_competition"
  | "consulting"
  | "finance"
  | "marketing"
  | "operations"
  | "data_analytics"
  | "strategy"
  | "technology"
  | "entrepreneurship"
  | "management_trainee"
  | "graduate_program"
  | "conference"
  | "other";

export type OpportunityStatus =
  | "new"
  | "active"
  | "updated"
  | "deadline_changed"
  | "closing_soon"
  | "closed"
  | "needs_review"; // ambiguous-dedup-candidate holding state, see ARCHITECTURE.md §5

export type ChangeType =
  | "deadline_changed"
  | "application_opened"
  | "application_closed"
  | "eligibility_changed"
  | "location_changed"
  | "work_arrangement_changed"
  | "compensation_changed"
  | "url_changed"
  | "description_changed"
  | "new";

export type SourceType =
  | "company_career_page"
  | "university_career_page"
  | "internship_platform"
  | "government"
  | "corporate_leadership_program"
  | "consulting_firm"
  | "bank"
  | "fmcg"
  | "technology_company"
  | "startup"
  | "ngo"
  | "international_org"
  | "scholarship_org"
  | "competition_site"
  | "other";

export type SearchMethod = "rss" | "api" | "manual";

export type ApplicationStatus =
  | "interested"
  | "saved"
  | "planning_to_apply"
  | "applied"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn"
  | "closed";

export interface Organization {
  id: string;
  name: string;
  normalized_name: string;
  industry: string | null;
  website: string | null;
  logo_url: string | null;
  description: string | null;
  /** Hand-maintained tier used by the organization_score heuristic — see
   * ARCHITECTURE.md §7. Free-text, e.g. "global_top_tier" | "regional_leader"
   * | "notable" | "unknown". */
  reputation_tier: string | null;
}

export interface CompensationInfo {
  amount: number | null;
  currency: string | null;
  period: string | null;
  notes: string | null;
}

export interface OpportunityUpdateEntry {
  change_type: ChangeType;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  detected_at: string; // ISO datetime
}

export interface OpportunitySourceRef {
  source_id: string; // references SourceRegistryEntry.id
  source_url: string;
  first_seen_at: string;
  last_seen_at: string;
}

export interface OpportunityScore {
  profile_id: string;
  relevance_score: number;
  career_value_score: number;
  organization_score: number;
  student_fit_score: number;
  accessibility_score: number;
  urgency_score: number;
  overall_score: number;
  is_prestigious: boolean;
  is_selective: boolean;
  is_hard_to_discover: boolean;
  is_time_sensitive: boolean;
  reasoning: string;
  scoring_method: "heuristic" | "claude";
  scored_at: string;
}

export interface Opportunity {
  id: string;
  organization_id: string;

  title: string;
  normalized_title: string;
  opportunity_type: OpportunityType;
  tags: string[];
  description: string | null;

  location: string | null;
  country: string | null;
  work_arrangement: WorkArrangement;

  application_url: string | null;
  primary_source_url: string | null;

  application_deadline: string | null; // ISO date
  deadline_note: string | null;
  start_date: string | null;
  end_date: string | null;

  eligibility_text: string | null;
  degree_requirements: string[];
  year_level_requirements: string[];
  citizenship_requirements: string[];
  gpa_requirement: number | null;
  skills_required: string[];

  compensation: CompensationInfo;

  program_duration: string | null;
  sponsorship_available: boolean | null;

  applications_open: boolean | null;
  status: OpportunityStatus;

  dedup_hash: string;
  raw_content_hash: string;

  date_discovered: string;
  date_last_checked: string;
  date_last_updated: string;

  sources: OpportunitySourceRef[];
  updates: OpportunityUpdateEntry[];
  scores: OpportunityScore[]; // one per student profile
}

export interface StudentProfile {
  id: string;
  label: string;
  is_primary: boolean;
  degree: string | null;
  year_level: string | null;
  interests: string[];
  skills: string[];
  preferred_work_arrangement: WorkArrangement;
  geography_priority: string[];
  citizenship: string | null;
  gpa: number | null;
}

export interface SourceRegistryEntry {
  id: string;
  name: string;
  url: string;
  source_type: SourceType;
  search_method: SearchMethod;
  reliability_score: number;
  check_frequency_hours: number;
  active: boolean;
  last_checked_at: string | null;
  notes?: string | null;
}

export interface SearchRunRecord {
  id: string;
  run_type: "scheduled" | "manual";
  started_at: string;
  completed_at: string | null;
  items_found: number;
  items_new: number;
  items_updated: number;
  items_duplicate: number;
  items_needs_review: number;
  status: "running" | "success" | "partial" | "failed";
  error_log: string | null;
}

export interface OpportunityFilters {
  opportunity_types?: OpportunityType[];
  work_arrangements?: WorkArrangement[];
  locations?: string[];
  min_score?: number;
  status?: OpportunityStatus[];
  organization?: string;
  deadline_before?: string;
  year_levels?: string[];
  query?: string;
}
