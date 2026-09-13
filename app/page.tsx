"use client";

import { useEffect, useMemo, useState } from "react";
import { useDashboardData } from "../lib/client/useOpportunities";
import { applyFilters } from "../lib/client/filterOpportunities";
import { sortByOverallScoreDesc } from "../lib/scoring/helpers";
import { getSavedIds, setLastVisitNow } from "../lib/client/savedStore";
import type { OpportunityFilters } from "../lib/types";
import OverviewStats from "../components/OverviewStats";
import FilterBar from "../components/FilterBar";
import OpportunityCard from "../components/OpportunityCard";

export default function DashboardPage() {
  const { opportunities, organizations, profiles, loading, error } = useDashboardData();
  const [filters, setFilters] = useState<OpportunityFilters>({});
  const [savedCount, setSavedCount] = useState(0);

  const profile = profiles.find((p) => p.is_primary) ?? profiles[0];

  useEffect(() => {
    setSavedCount(getSavedIds().length);
    setLastVisitNow();
  }, []);

  const filtered = useMemo(() => {
    if (!profile) return [];
    return applyFilters(opportunities, organizations, profile.id, filters);
  }, [opportunities, organizations, profile, filters]);

  const ranked = useMemo(() => (profile ? sortByOverallScoreDesc(filtered, profile.id) : []), [filtered, profile]);

  if (loading) return <p className="text-slate-500">Loading opportunities…</p>;
  if (error) return <p className="text-red-600">Failed to load dashboard data: {error}</p>;
  if (!profile) {
    return (
      <p className="text-slate-500">
        No student profile found. Add one to <code>data/profile.json</code> and re-run the pipeline / rebuild.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="mb-3 text-xl font-bold text-slate-900">Overview</h1>
        <OverviewStats opportunities={opportunities} profileId={profile.id} savedCount={savedCount} />
      </section>

      <section>
        <FilterBar filters={filters} onChange={setFilters} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          Top opportunities for {profile.label} ({ranked.length})
        </h2>
        {ranked.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
            No opportunities match yet. Run the pipeline (<code>npm run pipeline:run</code>) after enabling sources in{" "}
            <code>data/sources.json</code>.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ranked.map((opp) => (
              <OpportunityCard
                key={opp.id}
                opportunity={opp}
                organization={organizations.find((o) => o.id === opp.organization_id)}
                profileId={profile.id}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
