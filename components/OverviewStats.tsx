import type { Opportunity } from "../lib/types";
import { getScoreForProfile } from "../lib/scoring/helpers";

function isClosingSoon(opportunity: Opportunity): boolean {
  return opportunity.status === "closing_soon";
}

export default function OverviewStats({ opportunities, profileId, savedCount }: { opportunities: Opportunity[]; profileId: string; savedCount: number }) {
  const active = opportunities.filter((o) => o.status !== "closed");
  const newCount = opportunities.filter((o) => o.status === "new").length;
  const closingSoon = opportunities.filter(isClosingSoon).length;
  const highlyRelevant = opportunities.filter((o) => (getScoreForProfile(o, profileId)?.overall_score ?? 0) >= 75).length;
  const recentlyUpdated = opportunities.filter((o) => o.status === "updated" || o.status === "deadline_changed").length;

  const stats = [
    { label: "Active opportunities", value: active.length },
    { label: "New", value: newCount },
    { label: "Closing soon", value: closingSoon },
    { label: "Highly relevant", value: highlyRelevant },
    { label: "Saved", value: savedCount },
    { label: "Recently updated", value: recentlyUpdated },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
          <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
          <div className="mt-1 text-xs text-slate-500">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}
