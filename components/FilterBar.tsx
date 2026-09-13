"use client";

import type { OpportunityFilters, OpportunityType, WorkArrangement } from "../lib/types";

const OPPORTUNITY_TYPES: OpportunityType[] = [
  "internship",
  "leadership_program",
  "fellowship",
  "scholarship",
  "competition",
  "case_competition",
  "consulting",
  "finance",
  "marketing",
  "operations",
  "data_analytics",
  "strategy",
  "technology",
  "entrepreneurship",
  "management_trainee",
  "graduate_program",
  "conference",
  "other",
];

const WORK_ARRANGEMENTS: WorkArrangement[] = ["onsite", "hybrid", "remote"];

export default function FilterBar({
  filters,
  onChange,
}: {
  filters: OpportunityFilters;
  onChange: (filters: OpportunityFilters) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <input
        type="search"
        placeholder="Search title, organization, tags…"
        value={filters.query ?? ""}
        onChange={(e) => onChange({ ...filters, query: e.target.value })}
        className="min-w-[220px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
      />

      <select
        multiple={false}
        value={filters.opportunity_types?.[0] ?? ""}
        onChange={(e) => onChange({ ...filters, opportunity_types: e.target.value ? [e.target.value as OpportunityType] : undefined })}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">All types</option>
        {OPPORTUNITY_TYPES.map((type) => (
          <option key={type} value={type}>
            {type.replace(/_/g, " ")}
          </option>
        ))}
      </select>

      <select
        value={filters.work_arrangements?.[0] ?? ""}
        onChange={(e) =>
          onChange({ ...filters, work_arrangements: e.target.value ? [e.target.value as WorkArrangement] : undefined })
        }
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">Any arrangement</option>
        {WORK_ARRANGEMENTS.map((arrangement) => (
          <option key={arrangement} value={arrangement}>
            {arrangement}
          </option>
        ))}
      </select>

      <select
        value={filters.min_score ?? ""}
        onChange={(e) => onChange({ ...filters, min_score: e.target.value ? Number(e.target.value) : undefined })}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">Any score</option>
        <option value="80">80+</option>
        <option value="60">60+</option>
        <option value="40">40+</option>
      </select>

      {(filters.opportunity_types || filters.work_arrangements || filters.min_score || filters.query) && (
        <button onClick={() => onChange({})} className="text-sm font-medium text-slate-500 hover:text-slate-700">
          Clear filters
        </button>
      )}
    </div>
  );
}
