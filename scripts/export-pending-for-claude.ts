import { promises as fs } from "fs";
import path from "path";
import { getOpportunities, getOrganizations, getProfiles } from "../lib/store/jsonStore";
import { SCORING_SYSTEM_PROMPT, buildScoringUserPrompt } from "../lib/claude/prompts";
import { opportunityToExtractionDraft } from "../lib/scoring/adapters";
import { scoringToolSchema } from "../lib/claude/schemas";

// Path A (ARCHITECTURE.md §8): zero-cost manual Claude enrichment. This
// script never calls any API — it writes a copy-paste-ready markdown file
// with the exact prompt + schema a free Claude.ai chat needs to produce a
// better score than the heuristic scorer. Run `npm run pipeline:ingest-claude`
// afterwards to merge the response back in.

const OUTPUT_PATH = path.join(process.cwd(), "data", "claude-outbox.md");

function daysUntil(dateIso: string | null): number | null {
  if (!dateIso) return null;
  return Math.ceil((new Date(dateIso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

async function main() {
  const [opportunities, organizations, profiles] = await Promise.all([
    getOpportunities(),
    getOrganizations(),
    getProfiles(),
  ]);

  const pending = opportunities.filter((opp) =>
    profiles.some((p) => {
      const score = opp.scores.find((s) => s.profile_id === p.id);
      return !score || score.scoring_method === "heuristic";
    })
  );

  if (pending.length === 0) {
    // eslint-disable-next-line no-console
    console.log("Nothing pending — every opportunity already has a Claude-produced score for every profile.");
    return;
  }

  const sections: string[] = [
    "# Claude enrichment batch",
    "",
    "For each block below: paste the system + user prompt into a Claude.ai chat,",
    "ask it to respond with only the tool-call JSON matching the given schema,",
    "collect all responses into an array, save that array to",
    "`data/claude-inbox.json`, then run `npm run pipeline:ingest-claude`.",
    "",
    "Each entry in claude-inbox.json should look like:",
    "```json",
    '{ "opportunity_id": "<id from the block below>", "profile_id": "<id from the block below>", "scoring": { ...tool JSON... } }',
    "```",
    "",
    "## Tool schema (give this to Claude alongside each prompt)",
    "```json",
    JSON.stringify(scoringToolSchema, null, 2),
    "```",
  ];

  for (const opp of pending) {
    const organization = organizations.find((o) => o.id === opp.organization_id);
    const draft = opportunityToExtractionDraft(opp);

    for (const profile of profiles) {
      const existingScore = opp.scores.find((s) => s.profile_id === profile.id);
      if (existingScore && existingScore.scoring_method === "claude") continue;

      sections.push(
        "",
        "---",
        `## ${opp.title} — ${organization?.name ?? "unknown organization"}`,
        `opportunity_id: \`${opp.id}\``,
        `profile_id: \`${profile.id}\``,
        "",
        "### System prompt",
        "```",
        SCORING_SYSTEM_PROMPT,
        "```",
        "",
        "### User prompt",
        "```",
        buildScoringUserPrompt({
          opportunity: draft,
          organizationName: organization?.name ?? "unknown",
          profile,
          daysUntilDeadline: daysUntil(opp.application_deadline),
        }),
        "```"
      );
    }
  }

  await fs.writeFile(OUTPUT_PATH, sections.join("\n") + "\n", "utf-8");
  // eslint-disable-next-line no-console
  console.log(`Wrote ${pending.length} pending opportunit${pending.length === 1 ? "y" : "ies"} to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
