"use client";

import { useEffect, useState } from "react";
import { useDashboardData } from "../../lib/client/useOpportunities";
import { getSavedIds } from "../../lib/client/savedStore";
import OpportunityCard from "../../components/OpportunityCard";

export default function SavedPage() {
  const { opportunities, organizations, profiles, loading } = useDashboardData();
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const profile = profiles.find((p) => p.is_primary) ?? profiles[0];

  useEffect(() => {
    setSavedIds(getSavedIds());
  }, []);

  if (loading) return <p className="text-slate-500">Loading…</p>;

  const saved = opportunities.filter((o) => savedIds.includes(o.id));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-slate-900">Saved opportunities</h1>
      <p className="text-sm text-slate-500">
        Saved items are stored in this browser only (no account/sync backend in the $0 MVP — see ARCHITECTURE.md §9).
      </p>
      {saved.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
          Nothing saved yet — click "Save" on any opportunity card.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {saved.map((opp) => (
            <OpportunityCard
              key={opp.id}
              opportunity={opp}
              organization={organizations.find((o) => o.id === opp.organization_id)}
              profileId={profile?.id ?? ""}
            />
          ))}
        </div>
      )}
    </div>
  );
}
