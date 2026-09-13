// Fixed scoring weights, shared by the heuristic scorer (lib/scoring/heuristics.ts)
// and, if you enable it, the optional Claude scoring path (lib/claude/prompts.ts
// bakes the same numbers into the rubric it gives Claude) — so scores stay
// comparable regardless of which scorer produced them.
export const SCORE_WEIGHTS = {
  relevance: 0.15,
  career_value: 0.25,
  organization: 0.2,
  student_fit: 0.2,
  accessibility: 0.1,
  urgency: 0.1,
} as const;
