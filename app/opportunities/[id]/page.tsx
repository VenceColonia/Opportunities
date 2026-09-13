import { promises as fs } from "fs";
import path from "path";
import type { Opportunity, Organization, StudentProfile } from "../../../lib/types";
import StatusBadge from "../../../components/StatusBadge";
import ScoreBadge from "../../../components/ScoreBadge";

// Server component, prerendered at build time (output: 'export'). Reads
// data/*.json directly via fs rather than fetching — this runs during
// `next build`, the same as any static-site generator, not per-request.

async function loadJson<T>(fileName: string): Promise<T[]> {
  const filePath = path.join(process.cwd(), "data", fileName);
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as T[];
}

export async function generateStaticParams() {
  const opportunities = await loadJson<Opportunity>("opportunities.json");
  return opportunities.map((opp) => ({ id: opp.id }));
}

export default async function OpportunityDetailPage({ params }: { params: { id: string } }) {
  const [opportunities, organizations, profiles] = await Promise.all([
    loadJson<Opportunity>("opportunities.json"),
    loadJson<Organization>("organizations.json"),
    loadJson<StudentProfile>("profile.json"),
  ]);

  const opportunity = opportunities.find((o) => o.id === params.id);
  if (!opportunity) {
    return <p className="text-slate-500">Opportunity not found — it may have been merged as a duplicate or removed.</p>;
  }

  const organization = organizations.find((o) => o.id === opportunity.organization_id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <StatusBadge status={opportunity.status} />
          <span className="text-sm capitalize text-slate-500">{opportunity.opportunity_type.replace(/_/g, " ")}</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">{opportunity.title}</h1>
        <p className="text-slate-600">{organization?.name ?? "Unknown organization"}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="md:col-span-2 flex flex-col gap-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 font-semibold">Description</h2>
            <p className="whitespace-pre-line text-sm text-slate-700">{opportunity.description ?? "No description extracted."}</p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 font-semibold">Requirements</h2>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-slate-500">Degree</dt>
              <dd>{opportunity.degree_requirements.join(", ") || "Not specified"}</dd>
              <dt className="text-slate-500">Year level</dt>
              <dd>{opportunity.year_level_requirements.join(", ") || "Not specified"}</dd>
              <dt className="text-slate-500">Citizenship</dt>
              <dd>{opportunity.citizenship_requirements.join(", ") || "Not specified"}</dd>
              <dt className="text-slate-500">GPA</dt>
              <dd>{opportunity.gpa_requirement ?? "Not specified"}</dd>
              <dt className="text-slate-500">Skills</dt>
              <dd>{opportunity.skills_required.join(", ") || "Not specified"}</dd>
              <dt className="text-slate-500">Eligibility notes</dt>
              <dd>{opportunity.eligibility_text ?? "Not specified"}</dd>
            </dl>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 font-semibold">Update history</h2>
            <ul className="flex flex-col gap-2 text-sm">
              {opportunity.updates
                .slice()
                .reverse()
                .map((update, i) => (
                  <li key={i} className="border-b border-slate-100 pb-2 last:border-0">
                    <span className="font-medium capitalize">{update.change_type.replace(/_/g, " ")}</span>
                    {update.field_name ? <span className="text-slate-500"> — {update.field_name}</span> : null}
                    {update.old_value || update.new_value ? (
                      <span className="text-slate-500">
                        {" "}
                        ({update.old_value ?? "unset"} → {update.new_value ?? "unset"})
                      </span>
                    ) : null}
                    <div className="text-xs text-slate-400">{new Date(update.detected_at).toLocaleString()}</div>
                  </li>
                ))}
            </ul>
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 font-semibold">Key facts</h2>
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Location</dt>
                <dd>{opportunity.location ?? "Unknown"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Work arrangement</dt>
                <dd className="capitalize">{opportunity.work_arrangement}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Deadline</dt>
                <dd>{opportunity.application_deadline ?? opportunity.deadline_note ?? "Unknown"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Duration</dt>
                <dd>{opportunity.program_duration ?? "Unknown"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Compensation</dt>
                <dd>
                  {opportunity.compensation.amount
                    ? `${opportunity.compensation.currency ?? ""} ${opportunity.compensation.amount} (${opportunity.compensation.period ?? "unspecified period"})`
                    : "Unknown"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Sponsorship</dt>
                <dd>{opportunity.sponsorship_available === null ? "Unknown" : opportunity.sponsorship_available ? "Yes" : "No"}</dd>
              </div>
            </dl>
            {opportunity.application_url ? (
              <a
                href={opportunity.application_url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block rounded-md bg-brand-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-brand-700"
              >
                Apply / View posting
              </a>
            ) : null}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 font-semibold">Scores</h2>
            {opportunity.scores.map((score) => {
              const profile = profiles.find((p) => p.id === score.profile_id);
              return (
                <div key={score.profile_id} className="mb-3 flex items-start gap-3 border-b border-slate-100 pb-3 last:border-0">
                  <ScoreBadge score={score.overall_score} />
                  <div>
                    <p className="text-sm font-medium">{profile?.label ?? score.profile_id}</p>
                    <p className="text-xs text-slate-500">
                      Relevance {score.relevance_score} · Career value {score.career_value_score} · Org {score.organization_score} · Fit{" "}
                      {score.student_fit_score} · Access {score.accessibility_score} · Urgency {score.urgency_score}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">{score.reasoning}</p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">{score.scoring_method}-scored</p>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
            <p>Discovered: {new Date(opportunity.date_discovered).toLocaleString()}</p>
            <p>Last checked: {new Date(opportunity.date_last_checked).toLocaleString()}</p>
            <p>Last updated: {new Date(opportunity.date_last_updated).toLocaleString()}</p>
            <p className="mt-2">Sources: {opportunity.sources.length}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
