import { promises as fs } from "fs";
import path from "path";

// The dashboard is a static export (next.config.mjs: output: 'export') and
// fetches data/*.json as plain static assets rather than importing
// lib/store/jsonStore.ts (which is Node-only). This script copies the
// current data files into public/data/ so `next build`/`next dev` picks
// them up. Run automatically via the predev/prebuild npm scripts.

const SRC_DIR = path.join(process.cwd(), "data");
const DEST_DIR = path.join(process.cwd(), "public", "data");

async function main() {
  await fs.mkdir(DEST_DIR, { recursive: true });
  const files = await fs.readdir(SRC_DIR);

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    await fs.copyFile(path.join(SRC_DIR, file), path.join(DEST_DIR, file));
  }

  // eslint-disable-next-line no-console
  console.log(`Copied ${files.length} data file(s) to public/data/`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
