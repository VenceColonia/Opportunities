"use client";

import { useEffect, useState } from "react";
import type { Opportunity, Organization, StudentProfile, SearchRunRecord } from "../types";
import { dataUrl } from "./dataUrl";

export interface DashboardData {
  opportunities: Opportunity[];
  organizations: Organization[];
  profiles: StudentProfile[];
  runs: SearchRunRecord[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetches the pipeline's static JSON output. There is no realtime
 * websocket here (ARCHITECTURE.md §9) — the dashboard reflects whatever
 * was committed and deployed as of the last pipeline run + redeploy.
 */
export function useDashboardData(): DashboardData {
  const [state, setState] = useState<DashboardData>({
    opportunities: [],
    organizations: [],
    profiles: [],
    runs: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [opportunities, organizations, profiles, runs] = await Promise.all([
          fetch(dataUrl("opportunities.json")).then((r) => r.json()),
          fetch(dataUrl("organizations.json")).then((r) => r.json()),
          fetch(dataUrl("profile.json")).then((r) => r.json()),
          fetch(dataUrl("runs.json")).then((r) => r.json()),
        ]);

        if (!cancelled) {
          setState({ opportunities, organizations, profiles, runs, loading: false, error: null });
        }
      } catch (err) {
        if (!cancelled) {
          setState((prev) => ({ ...prev, loading: false, error: err instanceof Error ? err.message : String(err) }));
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
