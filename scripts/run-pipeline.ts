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

  // rss-parser's http.get/https.get calls can leave keep-alive sockets
  // open in Node's global agent even after every response has been fully
  // read, which keeps the event loop alive indefinitely. The pipeline
  // itself has finished by this point (summary is populated) — force exit
  // so the CI step (and any local run) actually terminates instead of
  // hanging until something else times it out.
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Pipeline run failed:", err);
  process.exit(1);
});
