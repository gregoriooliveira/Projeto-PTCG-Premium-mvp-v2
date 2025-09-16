import { recomputeAllDeckAggregates } from "../aggregates.js";

async function main() {
  const processed = await recomputeAllDeckAggregates();
  console.log(`[live recomputeDeckAggregates] processed ${processed.length} decks`);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("[live recomputeDeckAggregates] failed", err);
    process.exit(1);
  });
