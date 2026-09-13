import type { OpportunityStatus } from "../lib/types";

const STATUS_STYLES: Record<OpportunityStatus, { label: string; className: string }> = {
  new: { label: "NEW", className: "bg-emerald-100 text-emerald-800" },
  active: { label: "ACTIVE", className: "bg-slate-100 text-slate-700" },
  updated: { label: "UPDATED", className: "bg-blue-100 text-blue-800" },
  deadline_changed: { label: "DEADLINE CHANGED", className: "bg-amber-100 text-amber-800" },
  closing_soon: { label: "CLOSING SOON", className: "bg-orange-100 text-orange-800" },
  closed: { label: "CLOSED", className: "bg-gray-200 text-gray-600" },
  needs_review: { label: "NEEDS REVIEW", className: "bg-purple-100 text-purple-800" },
};

export default function StatusBadge({ status }: { status: OpportunityStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.className}`}>
      {style.label}
    </span>
  );
}
