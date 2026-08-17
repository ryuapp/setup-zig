import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import process from "node:process";
import { cacheDirectories } from "./zig.ts";

const exec = promisify(execFile);

function cacheBase(): string {
  const value = process.env.ACTIONS_CACHE_URL;
  if (!value || !process.env.ACTIONS_RUNTIME_TOKEN) {
    throw new Error("GitHub Actions cache service is unavailable");
  }
  return value.endsWith("/") ? value : `${value}/`;
}

function versionFor(paths: string[]): string {
  return createHash("sha256").update(`${paths.join("\0")}\0gzip`).digest("hex");
}

function headers(): Record<string, string> {
  return {
    authorization: `Bearer ${process.env.ACTIONS_RUNTIME_TOKEN}`,
    accept: "application/json",
  };
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
  const paths = cacheDirectories();
  const version = versionFor(paths);
  const response = await fetch(
    `${cacheBase()}_apis/artifactcache/cache?keys=${
      encodeURIComponent(key)
    }&version=${version}`,
    { headers: headers() },
  );
  if (response.status === 204 || response.status === 404) return false;
  if (!response.ok) {
    throw new Error(`Cache restore failed (${response.status})`);
  }
  const result = await response.json() as { archiveLocation?: string };
  if (!result.archiveLocation) return false;
  const archive = join(
    await mkdtemp(join(tmpdir(), "setup-zig-cache-")),
    "cache.tgz",
  );
  try {
    const archiveResponse = await fetch(result.archiveLocation, {
      headers: headers(),
    });
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
    const reserve = await fetch(`${cacheBase()}_apis/artifactcache/caches`, {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ key, version }),
    });
    if (reserve.status === 409) return;
    if (!reserve.ok) {
      throw new Error(`Cache reservation failed (${reserve.status})`);
    }
    const { cacheId } = await reserve.json() as { cacheId: number };
    const upload = await fetch(
      `${cacheBase()}_apis/artifactcache/caches/${cacheId}`,
      {
        method: "PATCH",
        headers: {
          ...headers(),
          "content-type": "application/octet-stream",
          "content-range": `bytes 0-${body.byteLength - 1}/*`,
        },
        body,
      },
    );
    if (!upload.ok) throw new Error(`Cache upload failed (${upload.status})`);
    const commit = await fetch(
      `${cacheBase()}_apis/artifactcache/caches/${cacheId}`,
      { method: "POST", headers: headers() },
    );
    if (!commit.ok) throw new Error(`Cache commit failed (${commit.status})`);
  } finally {
    await rm(staging, { recursive: true, force: true });
    await rm(archive, { force: true });
  }
}
