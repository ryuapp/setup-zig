import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import process from "node:process";
import { cacheDirectories } from "./zig.ts";
import { info } from "./actions.ts";
import {
  createCacheEntry,
  finalizeCacheEntry,
  getCacheDownloadUrl,
  uploadCacheArchive,
} from "./cache-service.ts";

const exec = promisify(execFile);

function versionFor(paths: string[]): string {
  return createHash("sha256").update(`${paths.join("\0")}\0gzip`).digest("hex");
}

export function cacheKey(
  version: string,
  platform: string,
  extra: string,
): string {
  const runnerOs = process.env.RUNNER_OS || process.platform;
  return `setup-zig-${runnerOs}-${platform}-${version}-${extra || "default"}`;
}

export async function restoreCache(key: string): Promise<boolean> {
  info(`Restoring cache: ${key}`);
  const paths = cacheDirectories();
  const version = versionFor(paths);
  const downloadUrl = await getCacheDownloadUrl(key, version);
  if (!downloadUrl) return false;
  const archive = join(
    await mkdtemp(join(tmpdir(), "setup-zig-cache-")),
    "cache.tgz",
  );
  try {
    const archiveResponse = await fetch(downloadUrl);
    if (!archiveResponse.ok) {
      throw new Error(
        `Cache archive download failed (${archiveResponse.status})`,
      );
    }
    await writeFile(
      archive,
      new Uint8Array(await archiveResponse.arrayBuffer()),
    );
    const staging = await mkdtemp(join(tmpdir(), "setup-zig-cache-extract-"));
    try {
      await exec("tar", ["-xzf", archive, "-C", staging]);
      for (let index = 0; index < paths.length; index++) {
        const path = paths.at(index)!;
        await mkdir(path, { recursive: true });
        await cp(join(staging, String(index)), path, {
          recursive: true,
          force: true,
        }).catch(() => undefined);
      }
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
    return true;
  } finally {
    await rm(archive, { force: true });
  }
}

export async function saveCache(key: string): Promise<void> {
  info(`Saving cache: ${key}`);
  const paths = cacheDirectories();
  const version = versionFor(paths);
  const staging = await mkdtemp(join(tmpdir(), "setup-zig-cache-stage-"));
  const archive = join(
    await mkdtemp(join(tmpdir(), "setup-zig-cache-")),
    "cache.tgz",
  );
  try {
    for (let index = 0; index < paths.length; index++) {
      const path = paths.at(index)!;
      await mkdir(join(staging, String(index)), { recursive: true });
      await cp(path, join(staging, String(index)), {
        recursive: true,
        force: true,
      }).catch(() => undefined);
    }
    await exec("tar", ["-czf", archive, "-C", staging, "."]);
    const body = await readFile(archive);
    const uploadUrl = await createCacheEntry(key, version);
    if (!uploadUrl) return;
    await uploadCacheArchive(uploadUrl, body);
    await finalizeCacheEntry(key, version, body.byteLength);
  } finally {
    await rm(staging, { recursive: true, force: true });
    await rm(archive, { force: true });
  }
}
