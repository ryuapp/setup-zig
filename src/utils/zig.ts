import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";
import { info } from "./actions.ts";
import { verifyMinisign } from "./minisign.ts";

export type Artifact = { tarball: string; shasum: string; size?: number };
export type DownloadIndex = Record<
  string,
  Record<string, Artifact> & { date?: string }
>;

const INDEX_URL = "https://ziglang.org/download/index.json";
const MIRRORS_URL = "https://ziglang.org/download/community-mirrors.txt";
export function getPlatformKey(): string {
  const os = process.platform === "win32"
    ? "windows"
    : process.platform === "darwin"
    ? "macos"
    : process.platform === "linux"
    ? "linux"
    : undefined;
  const cpu = process.arch === "x64"
    ? "x86_64"
    : process.arch === "arm64"
    ? "aarch64"
    : process.arch === "arm"
    ? "arm"
    : undefined;
  if (!os || !cpu) {
    throw new Error(
      `Unsupported runner platform: ${process.platform}/${process.arch}`,
    );
  }
  return `${cpu}-${os}`;
}

export async function readIndex(
  fetcher: typeof fetch = fetch,
): Promise<DownloadIndex> {
  const response = await fetcher(INDEX_URL, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Unable to read Zig download index (${response.status})`);
  }
  return await response.json() as DownloadIndex;
}

export function artifactFor(
  index: DownloadIndex,
  version: string,
  key = getPlatformKey(),
): Artifact {
  const artifact = index[version]?.[key];
  if (!artifact?.tarball || !artifact.shasum) {
    throw new Error(`Zig ${version} has no artifact for ${key}`);
  }
  return artifact;
}

export function cacheDirectories(workspace = process.cwd()): string[] {
  const home = homedir();
  const global = process.platform === "win32"
    ? join(process.env.LOCALAPPDATA || join(home, "AppData", "Local"), "zig")
    : join(process.env.XDG_CACHE_HOME || join(home, ".cache"), "zig");
  return [global, resolve(workspace, ".zig-cache")];
}

export async function downloadVerified(
  url: string,
  expectedSha256: string,
  destination: string,
  fetcher: typeof fetch = fetch,
  signatureUrl?: string,
): Promise<void> {
  const started = performance.now();
  info(`Downloading Zig archive: ${new URL(url).origin}`);
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`Unable to download Zig (${response.status}): ${url}`);
  }
  const bytes = await readDownload(response);
  info(
    `Downloaded Zig archive in ${(performance.now() - started).toFixed(1)}ms`,
  );
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new Error(
      `SHA-256 mismatch for ${url}: expected ${expectedSha256}, got ${actual}`,
    );
  }
  if (signatureUrl) {
    info("Downloading Zig minisign signature");
    const signature = await fetcher(signatureUrl);
    if (!signature.ok) {
      throw new Error(`Unable to download Zig signature (${signature.status})`);
    }
    info("Verifying Zig minisign signature");
    verifyMinisign(bytes, await signature.text(), archiveName(url));
    info("Zig minisign signature verified");
  }
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
}

async function readDownload(response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array(await response.arrayBuffer());
  const total = Number(response.headers.get("content-length"));
  const chunks: Uint8Array[] = [];
  let received = 0;
  let nextProgress = 5;
  if (Number.isFinite(total) && total > 0) info("Download progress: 0%");
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    received += value.byteLength;
    if (Number.isFinite(total) && total > 0) {
      const progress = Math.floor((received * 100) / total);
      if (progress >= nextProgress) {
        info(`Download progress: ${progress}%`);
        nextProgress = progress + 5;
      }
    }
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (Number.isFinite(total) && total > 0) info("Download progress: 100%");
  return bytes;
}

export async function downloadUrls(original: string): Promise<string[]> {
  const filename = basename(new URL(original).pathname);
  const official = `${original}?source=ryuapp-setup-zig`;
  try {
    const response = await fetch(MIRRORS_URL);
    if (!response.ok) {
      throw new Error(`mirror list request failed (${response.status})`);
    }
    const mirrors = (await response.text()).split("\n").map((line) =>
      line.trim()
    ).filter(Boolean);
    for (let index = mirrors.length - 1; index > 0; index--) {
      const swap = Math.floor(Math.random() * (index + 1));
      const current = mirrors.at(index)!;
      const replacement = mirrors.at(swap)!;
      mirrors.splice(index, 1, replacement);
      mirrors.splice(swap, 1, current);
    }
    return [
      ...mirrors.map((base) => `${base}/${filename}?source=ryuapp-setup-zig`),
      official,
    ];
  } catch {
    return [official];
  }
}

export async function cleanDirectory(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

export function archiveName(url: string): string {
  return basename(new URL(url).pathname);
}
export function tempArchive(version: string, url: string): string {
  return join(tmpdir(), `setup-zig-${version}-${archiveName(url)}`);
}
