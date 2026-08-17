import { state } from "./utils/actions.ts";
import { saveCache } from "./utils/cache.ts";
import process from "node:process";

export async function run(): Promise<void> {
  // Cache persistence will use the runner cache protocol; state is read here so
  // the post entry point remains independent from the installation entry point.
  if (state("cache-enabled") !== "true") return;
  const key = state("cache-key");
  if (key) {
    await saveCache(key).catch((error) =>
      console.warn(
        `Cache save skipped: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    );
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
