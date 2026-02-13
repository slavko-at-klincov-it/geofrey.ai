import { runIndexer } from "./index.js";

async function main() {
  const rootDir = process.cwd();
  console.log("Indexing project...");

  const { stats } = await runIndexer(rootDir);

  console.log(`Done in ${stats.durationMs}ms`);
  console.log(`  Files: ${stats.totalFiles}`);
  console.log(`  Parsed: ${stats.parsedFiles}`);
  console.log(`  Cached: ${stats.cachedFiles}`);
  if (stats.removedFiles > 0) {
    console.log(`  Removed: ${stats.removedFiles}`);
  }
  console.log(`Output: .geofrey/project-map.json`);
}

main().catch((err) => {
  console.error("Index failed:", err);
  process.exit(1);
});
