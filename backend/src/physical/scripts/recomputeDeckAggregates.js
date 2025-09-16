import { recomputeAllDeckAggregates } from "../aggregates.js";

async function main() {
  const processed = await recomputeAllDeckAggregates();
  console.log(`[recomputeDeckAggregates] processed ${processed.length} decks`);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("[recomputeDeckAggregates] failed", err);
    process.exit(1);
  });
