-- Seed data: taxonomy tags + a handful of example sources reachable via
-- RSS/public APIs (no login/JS-rendering scraping), suitable for the MVP.
-- Add real, verified source URLs before running the pipeline against these.

insert into tags (name, slug, category) values
  ('Internship', 'internship', 'type'),
  ('Leadership Program', 'leadership-program', 'type'),
  ('Fellowship', 'fellowship', 'type'),
  ('Scholarship', 'scholarship', 'type'),
  ('Competition', 'competition', 'type'),
  ('Case Competition', 'case-competition', 'type'),
  ('Management Trainee', 'management-trainee', 'type'),
  ('Graduate Program', 'graduate-program', 'type'),
  ('Conference', 'conference', 'type'),

  ('Consulting', 'consulting', 'function'),
  ('Finance', 'finance', 'function'),
  ('Marketing', 'marketing', 'function'),
  ('Operations', 'operations', 'function'),
  ('Data Analytics', 'data-analytics', 'function'),
  ('Strategy', 'strategy', 'function'),
  ('Technology', 'technology', 'function'),
  ('Entrepreneurship', 'entrepreneurship', 'function'),
  ('Client Management', 'client-management', 'function'),
  ('Project Management', 'project-management', 'function')
on conflict (slug) do nothing;

-- Example source registry rows. `search_method` values reflect what is
-- actually reachable without login/JS rendering; anything requiring a
-- headless browser should stay `active = false` until a fetch worker
-- (see ARCHITECTURE.md §1) exists to service it.
insert into source_registry (name, url, source_type, search_method, active, notes) values
  ('Philippine Government Jobs Portal', 'https://www.job.gov.ph', 'government', 'web_search', false, 'Verify official RSS/API availability before enabling.'),
  ('Example Consulting Firm Careers RSS', 'https://example-consulting.com/careers/feed', 'consulting_firm', 'rss', false, 'Placeholder — replace with a verified real feed URL.'),
  ('Example Scholarship Board', 'https://example-scholarships.org/feed', 'scholarship_org', 'rss', false, 'Placeholder — replace with a verified real feed URL.')
on conflict do nothing;
