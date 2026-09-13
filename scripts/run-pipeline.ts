import { runPipeline } from "../lib/pipeline/orchestrator";

// CLI entry point run by .github/workflows/pipeline.yml on a schedule, or
// manually via `npm run pipeline:run`. Fully deterministic — no API key
// required. The workflow is responsible for committing the resulting
// data/*.json changes.

async function main() {
  const runType = process.argv.includes("--manual") ? "manual" : "scheduled";
  const summary = await runPipeline(runType);

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));

  if (summary.errors.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`Pipeline run completed with ${summary.errors.length} error(s).`);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Pipeline run failed:", err);
  process.exit(1);
});
