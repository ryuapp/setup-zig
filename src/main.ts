import {
  addPath,
  booleanInput,
  info,
  input,
  setOutput,
  setState,
} from "./utils/actions.ts";
import { installZig } from "./utils/install.ts";
import process from "node:process";
import { cacheKey, restoreCache } from "./utils/cache.ts";
import {
  artifactFor,
  downloadUrls,
  getPlatformKey,
  readIndex,
} from "./utils/zig.ts";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getMinimumVersion } from "./utils/zon.ts";
import { resolveVersion } from "./utils/version.ts";

export async function run(): Promise<void> {
  const zon = await readFile(join(process.cwd(), "build.zig.zon"), "utf8")
    .catch(() => "");
  const requested = input("version") || getMinimumVersion(zon) || "latest";
  info(`Resolving Zig version: ${requested}`);
  const index = await readIndex();
  const version = await resolveVersion(requested, index);
  const platform = getPlatformKey();
  const artifact = artifactFor(index, version, platform);
  info(`Selected Zig ${version} for ${platform}`);
  const zigPath = await installZig(
    version,
    platform,
    await downloadUrls(artifact.tarball),
    artifact.shasum,
  );
  addPath(zigPath);
  setOutput("version", version);
  setOutput("path", zigPath);
  setState("version", version);
  setState("platform", platform);
  const cacheEnabled = booleanInput("cache", true);
  setState("cache-enabled", String(cacheEnabled));
  const key = cacheKey(version, platform, input("cache-key"));
  setState("cache-key", key);
  if (cacheEnabled) {
    const restored = await restoreCache(key).catch((error) => {
      info(
        `Cache restore skipped: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    });
    info(restored ? "Cache restored" : "Cache miss");
  } else {
    info("Cache disabled");
  }
  info(`Zig ${version} (${platform}) is ready at ${zigPath}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
