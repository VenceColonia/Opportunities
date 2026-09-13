-- Business Student Opportunity Intelligence Dashboard
-- Supabase / PostgreSQL schema
--
-- Design notes:
--   * `opportunities` is the single canonical record; `opportunity_sources`
--     links it to every place it was found (dedup lives here, not in
--     duplicate opportunity rows).
--   * Scores are per (opportunity, student_profile) since "student fit" is
--     inherently personalized.
--   * RLS is enabled on every user-owned table. The opportunity corpus
--     itself is public-read / service-role-write.
--   * All timestamps are `timestamptz`.

create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;
create extension if not exists vector;

-- ============================================================================
-- ENUMS
-- ============================================================================

create type work_arrangement as enum ('onsite', 'hybrid', 'remote', 'unknown');

create type opportunity_type as enum (
  'internship', 'leadership_program', 'fellowship', 'scholarship',
  'competition', 'case_competition', 'consulting', 'finance', 'marketing',
  'operations', 'data_analytics', 'strategy', 'technology',
  'entrepreneurship', 'management_trainee', 'graduate_program',
  'conference', 'other'
);

create type opportunity_status as enum (
  'new', 'active', 'updated', 'deadline_changed', 'closing_soon', 'closed'
);

create type change_type as enum (
  'deadline_changed', 'application_opened', 'application_closed',
  'eligibility_changed', 'location_changed', 'work_arrangement_changed',
  'compensation_changed', 'url_changed', 'description_changed', 'new'
);

create type source_type as enum (
  'company_career_page', 'university_career_page', 'internship_platform',
  'government', 'corporate_leadership_program', 'consulting_firm', 'bank',
  'fmcg', 'technology_company', 'startup', 'ngo', 'international_org',
  'scholarship_org', 'competition_site', 'other'
);

create type search_method as enum ('api', 'rss', 'web_search', 'scrape_permitted', 'manual');

create type application_status as enum (
  'interested', 'saved', 'planning_to_apply', 'applied', 'interview',
  'offer', 'rejected', 'withdrawn', 'closed'
);

create type notification_channel as enum ('email', 'browser', 'telegram', 'discord', 'slack', 'in_app');

create type search_run_status as enum ('running', 'success', 'partial', 'failed');

-- ============================================================================
-- USERS / PROFILES
-- ============================================================================

-- Mirrors auth.users; kept as its own table so the app can add profile
-- fields Supabase Auth doesn't carry, without touching the auth schema.
create table users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);

create table student_profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users (id) on delete cascade,
  label text not null default 'Primary profile',
  is_primary boolean not null default true,
  degree text,
  year_level text,
  interests text[] not null default '{}',
  skills text[] not null default '{}',
  preferred_work_arrangement work_arrangement not null default 'unknown',
  geography_priority text[] not null default '{}', -- e.g. {'Philippines','International'}
  citizenship text,
  gpa numeric(3,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_student_profiles_user on student_profiles (user_id);

-- ============================================================================
-- ORGANIZATIONS
-- ============================================================================

create table organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  normalized_name text not null,
  industry text,
  website text,
  logo_url text,
  description text,
  reputation_tier text, -- free-text label e.g. 'global_top_tier', 'regional_leader'; informs but does not replace Claude's organization_score
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_name)
);

-- ============================================================================
-- OPPORTUNITIES (canonical record)
-- ============================================================================

create table opportunities (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid references organizations (id) on delete set null,

  title text not null,
  normalized_title text not null,
  opportunity_type opportunity_type not null default 'other',
  description text,

  location text,
  country text,
  work_arrangement work_arrangement not null default 'unknown',

  application_url text,
  primary_source_url text,

  application_deadline date,
  deadline_note text, -- e.g. "rolling basis" when no fixed date is extractable
  start_date date,
  end_date date,

  eligibility_text text,
  degree_requirements text[] not null default '{}',
  year_level_requirements text[] not null default '{}',
  citizenship_requirements text[] not null default '{}',
  gpa_requirement numeric(3,2),
  skills_required text[] not null default '{}',

  compensation_amount numeric,
  compensation_currency text,
  compensation_period text, -- e.g. 'monthly', 'total', 'stipend'
  compensation_notes text,

  program_duration text,
  sponsorship_available boolean, -- null = unknown

  applications_open boolean,
  status opportunity_status not null default 'new',

  dedup_hash text not null,
  embedding vector(1536),

  extraction_confidence jsonb, -- {field_name: 0.0-1.0} from the last Claude extraction
  raw_content_hash text, -- hash of the last raw source content that produced this row's fields

  date_discovered timestamptz not null default now(),
  date_last_checked timestamptz not null default now(),
  date_last_updated timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_opportunities_dedup_hash on opportunities (dedup_hash);
create index idx_opportunities_status on opportunities (status);
create index idx_opportunities_deadline on opportunities (application_deadline);
create index idx_opportunities_type on opportunities (opportunity_type);
create index idx_opportunities_title_trgm on opportunities using gin (normalized_title gin_trgm_ops);
create index idx_opportunities_embedding on opportunities using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ============================================================================
-- SOURCE REGISTRY + DISCOVERY STAGING
-- ============================================================================

create table source_registry (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  url text not null,
  source_type source_type not null,
  search_method search_method not null,
  reliability_score numeric(3,2) not null default 0.50, -- 0-1, adjusted over time from search_runs outcomes
  check_frequency_hours integer not null default 24,
  active boolean not null default true,
  last_checked_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

-- Raw items land here before extraction. This is the cost-control gate:
-- unchanged content hashes never reach Claude.
create table discovery_queue (
  id uuid primary key default uuid_generate_v4(),
  source_registry_id uuid not null references source_registry (id) on delete cascade,
  source_url text not null,
  raw_content text not null,
  content_hash text not null,
  status text not null default 'pending', -- pending | extracted | rejected | duplicate | unchanged
  discovered_at timestamptz not null default now(),
  processed_at timestamptz
);

create index idx_discovery_queue_hash on discovery_queue (content_hash);
create index idx_discovery_queue_status on discovery_queue (status);

-- ============================================================================
-- OPPORTUNITY <-> SOURCE (many sources per canonical opportunity)
-- ============================================================================

create table opportunity_sources (
  id uuid primary key default uuid_generate_v4(),
  opportunity_id uuid not null references opportunities (id) on delete cascade,
  source_registry_id uuid references source_registry (id) on delete set null,
  source_url text not null,
  match_confidence numeric(3,2), -- confidence this source refers to the canonical opportunity (1.0 = exact hash match)
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (opportunity_id, source_url)
);

create index idx_opportunity_sources_opportunity on opportunity_sources (opportunity_id);

-- ============================================================================
-- CHANGE HISTORY
-- ============================================================================

create table opportunity_updates (
  id uuid primary key default uuid_generate_v4(),
  opportunity_id uuid not null references opportunities (id) on delete cascade,
  change_type change_type not null,
  field_name text,
  old_value text,
  new_value text,
  detected_at timestamptz not null default now(),
  source_id uuid references opportunity_sources (id) on delete set null
);

create index idx_opportunity_updates_opportunity on opportunity_updates (opportunity_id, detected_at desc);

-- ============================================================================
-- TAGS (taxonomy)
-- ============================================================================

create table tags (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  category text not null default 'general' -- 'type' | 'function' | 'industry' | 'general'
);

create table opportunity_tags (
  opportunity_id uuid not null references opportunities (id) on delete cascade,
  tag_id uuid not null references tags (id) on delete cascade,
  primary key (opportunity_id, tag_id)
);

-- ============================================================================
-- SCORING (per opportunity x student profile)
-- ============================================================================

create table opportunity_scores (
  id uuid primary key default uuid_generate_v4(),
  opportunity_id uuid not null references opportunities (id) on delete cascade,
  student_profile_id uuid not null references student_profiles (id) on delete cascade,

  relevance_score smallint not null check (relevance_score between 0 and 100),
  career_value_score smallint not null check (career_value_score between 0 and 100),
  organization_score smallint not null check (organization_score between 0 and 100),
  student_fit_score smallint not null check (student_fit_score between 0 and 100),
  accessibility_score smallint not null check (accessibility_score between 0 and 100),
  urgency_score smallint not null check (urgency_score between 0 and 100),
  overall_score smallint not null check (overall_score between 0 and 100),

  is_prestigious boolean not null default false,
  is_selective boolean not null default false,
  is_hard_to_discover boolean not null default false,
  is_time_sensitive boolean not null default false,

  reasoning text not null,
  model_version text not null,
  scored_at timestamptz not null default now(),

  unique (opportunity_id, student_profile_id)
);

create index idx_opportunity_scores_profile_overall on opportunity_scores (student_profile_id, overall_score desc);

-- ============================================================================
-- SAVED OPPORTUNITIES + APPLICATION TRACKER
-- ============================================================================

create table saved_opportunities (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users (id) on delete cascade,
  opportunity_id uuid not null references opportunities (id) on delete cascade,
  notes text,
  saved_at timestamptz not null default now(),
  unique (user_id, opportunity_id)
);

create table applications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users (id) on delete cascade,
  opportunity_id uuid not null references opportunities (id) on delete cascade,
  status application_status not null default 'interested',
  notes text,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, opportunity_id)
);

create table application_status_history (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid not null references applications (id) on delete cascade,
  status application_status not null,
  changed_at timestamptz not null default now(),
  note text
);

-- ============================================================================
-- PIPELINE OPERATIONAL TABLES
-- ============================================================================

create table search_runs (
  id uuid primary key default uuid_generate_v4(),
  source_registry_id uuid references source_registry (id) on delete set null,
  run_type text not null default 'scheduled', -- 'scheduled' | 'manual'
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  items_found integer not null default 0,
  items_new integer not null default 0,
  items_updated integer not null default 0,
  items_duplicate integer not null default 0,
  claude_calls_made integer not null default 0,
  status search_run_status not null default 'running',
  error_log text
);

create table notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users (id) on delete cascade,
  type text not null, -- 'new_high_score' | 'deadline_reminder' | 'saved_item_changed' | ...
  channel notification_channel not null default 'in_app',
  title text not null,
  body text not null,
  related_opportunity_id uuid references opportunities (id) on delete set null,
  sent_at timestamptz,
  read_at timestamptz,
  status text not null default 'pending', -- pending | sent | failed
  created_at timestamptz not null default now(),
  unique (user_id, related_opportunity_id, type)
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table users enable row level security;
alter table student_profiles enable row level security;
alter table saved_opportunities enable row level security;
alter table applications enable row level security;
alter table application_status_history enable row level security;
alter table notifications enable row level security;

create policy "users can view own row" on users for select using (auth.uid() = id);
create policy "users can update own row" on users for update using (auth.uid() = id);

create policy "users manage own profiles" on student_profiles for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users manage own saved opportunities" on saved_opportunities for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users manage own applications" on applications for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users view own application history" on application_status_history for select
  using (exists (select 1 from applications a where a.id = application_id and a.user_id = auth.uid()));

create policy "users manage own notifications" on notifications for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Public opportunity corpus: readable by anyone (anon or authenticated),
-- writes only via the service role (the pipeline), so no write policy is
-- defined for these tables — service role bypasses RLS entirely.
alter table organizations enable row level security;
alter table opportunities enable row level security;
alter table opportunity_sources enable row level security;
alter table opportunity_updates enable row level security;
alter table tags enable row level security;
alter table opportunity_tags enable row level security;
alter table opportunity_scores enable row level security;
alter table source_registry enable row level security;

create policy "public read organizations" on organizations for select using (true);
create policy "public read opportunities" on opportunities for select using (true);
create policy "public read opportunity_sources" on opportunity_sources for select using (true);
create policy "public read opportunity_updates" on opportunity_updates for select using (true);
create policy "public read tags" on tags for select using (true);
create policy "public read opportunity_tags" on opportunity_tags for select using (true);
create policy "public read opportunity_scores" on opportunity_scores for select using (true);
create policy "public read source_registry" on source_registry for select using (true);

-- ============================================================================
-- DEDUP HELPER FUNCTION
-- ============================================================================

-- Trigram-similarity candidate lookup used by lib/pipeline/deduplicate.ts.
-- Returns the id + similarity of the single best-matching existing
-- opportunity above the given threshold, if any (the caller fetches the
-- full row separately). Exact-hash matching is handled in application code
-- (a plain equality lookup); this covers near-identical titles only.
create or replace function match_opportunities_by_trigram(
  query_title text,
  similarity_threshold real default 0.6
)
returns table (id uuid, similarity real)
language sql
stable
as $$
  select o.id, similarity(o.normalized_title, query_title) as similarity
  from opportunities o
  where similarity(o.normalized_title, query_title) >= similarity_threshold
  order by similarity(o.normalized_title, query_title) desc
  limit 1;
$$;

-- ============================================================================
-- REALTIME
-- ============================================================================

alter publication supabase_realtime add table opportunities;
alter publication supabase_realtime add table opportunity_scores;
alter publication supabase_realtime add table opportunity_updates;

-- ============================================================================
-- updated_at maintenance
-- ============================================================================

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_opportunities_updated_at before update on opportunities
  for each row execute function set_updated_at();

create trigger trg_organizations_updated_at before update on organizations
  for each row execute function set_updated_at();

create trigger trg_student_profiles_updated_at before update on student_profiles
  for each row execute function set_updated_at();

create trigger trg_applications_updated_at before update on applications
  for each row execute function set_updated_at();
