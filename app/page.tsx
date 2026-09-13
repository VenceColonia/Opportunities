"use client";

import { useEffect, useMemo, useState } from "react";
import { useDashboardData } from "../lib/client/useOpportunities";
import { applyFilters, isMetroManilaRelevant } from "../lib/client/filterOpportunities";
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

  // Scoped to Metro Manila + remote (see isMetroManilaRelevant) — this is
  // a fixed scope for this profile, not one of the adjustable FilterBar
  // filters, so it applies before overview counts and the filter bar too.
  const inScope = useMemo(() => opportunities.filter(isMetroManilaRelevant), [opportunities]);

  const filtered = useMemo(() => {
    if (!profile) return [];
    return applyFilters(inScope, organizations, profile.id, filters);
  }, [inScope, organizations, profile, filters]);

  const ranked = useMemo(() => (profile ? sortByOverallScoreDesc(filtered, profile.id) : []), [filtered, profile]);

  if (loading) return <p className="text-ink-light">Loading opportunities…</p>;
  if (error) return <p className="text-red-600">Failed to load dashboard data: {error}</p>;
  if (!profile) {
    return (
      <p className="text-ink-light">
        No student profile found. Add one to <code>data/profile.json</code> and re-run the pipeline / rebuild.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h1 className="font-serif text-xl font-semibold text-ink">Overview</h1>
          <p className="text-xs text-ink-light">Scoped to Metro Manila + remote opportunities</p>
        </div>
        <OverviewStats opportunities={inScope} profileId={profile.id} savedCount={savedCount} />
      </section>

      <section>
        <FilterBar filters={filters} onChange={setFilters} />
      </section>

      <section>
        <h2 className="mb-3 font-serif text-lg font-semibold text-ink">
          Top opportunities for {profile.label} ({ranked.length})
        </h2>
        {ranked.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-ink-light">
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
