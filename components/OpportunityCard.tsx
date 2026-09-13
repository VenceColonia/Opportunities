"use client";

import Link from "next/link";
import type { Opportunity, Organization } from "../lib/types";
import { getScoreForProfile } from "../lib/scoring/helpers";
import StatusBadge from "./StatusBadge";
import ScoreBadge from "./ScoreBadge";
import { isSaved, toggleSaved } from "../lib/client/savedStore";
import { useState } from "react";

function formatDeadline(deadline: string | null, note: string | null): string {
  if (deadline) {
    return new Date(deadline).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
  return note ?? "No fixed deadline";
}

export default function OpportunityCard({
  opportunity,
  organization,
  profileId,
}: {
  opportunity: Opportunity;
  organization: Organization | undefined;
  profileId: string;
}) {
  const score = getScoreForProfile(opportunity, profileId);
  const [saved, setSaved] = useState(() => isSaved(opportunity.id));

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/opportunities/${opportunity.id}`} className="font-semibold text-slate-900 hover:underline">
            {opportunity.title}
          </Link>
          <p className="truncate text-sm text-slate-500">{organization?.name ?? "Unknown organization"}</p>
        </div>
        {score ? <ScoreBadge score={score.overall_score} /> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <StatusBadge status={opportunity.status} />
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 capitalize">{opportunity.opportunity_type.replace(/_/g, " ")}</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 capitalize">{opportunity.work_arrangement}</span>
        {opportunity.location ? <span className="rounded-full bg-slate-100 px-2.5 py-0.5">{opportunity.location}</span> : null}
      </div>

      <div className="flex flex-wrap gap-1">
        {opportunity.tags.map((tag) => (
          <span key={tag} className="rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
            {tag}
          </span>
        ))}
      </div>

      <p className="text-sm text-slate-500">Deadline: {formatDeadline(opportunity.application_deadline, opportunity.deadline_note)}</p>

      {score ? <p className="text-sm text-slate-700">{score.reasoning}</p> : null}

      <div className="mt-auto flex items-center justify-between pt-2">
        {opportunity.application_url ? (
          <a
            href={opportunity.application_url}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-brand-600 hover:underline"
          >
            View posting →
          </a>
        ) : (
          <span />
        )}
        <button
          onClick={() => setSaved(toggleSaved(opportunity.id).includes(opportunity.id))}
          className={`rounded-md border px-3 py-1 text-sm font-medium transition ${
            saved ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"
          }`}
        >
          {saved ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}
