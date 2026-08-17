import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { extractArchive } from "./archive.ts";
import { info } from "./actions.ts";
import {
  cleanDirectory,
  DOWNLOAD_SOURCE,
  downloadVerified,
  tempArchive,
} from "./zig.ts";

export function installationPath(version: string, platform: string): string {
  return join(
    process.env.RUNNER_TOOL_CACHE || join(process.cwd(), ".zig-tool-cache"),
    "setup-zig",
    version,
    platform,
  );
}

export async function installZig(
  version: string,
  platform: string,
  urls: string[],
  sha256: string,
): Promise<string> {
  const destination = installationPath(version, platform);
  const executable = join(
    destination,
    "zig" + (process.platform === "win32" ? ".exe" : ""),
  );
  if (existsSync(executable)) return destination;
  info(`Installing Zig ${version} (${platform})`);
  await cleanDirectory(destination);
  await mkdir(destination, { recursive: true });
  for (const [index, url] of urls.entries()) {
    const archive = tempArchive(version, url);
    info(
      `Trying Zig download (${index + 1}/${urls.length}): ${
        new URL(url).origin
      }`,
    );
    try {
      const signature = new URL(url);
      signature.search = "";
      signature.pathname += ".minisig";
      signature.searchParams.set("source", DOWNLOAD_SOURCE);
      await downloadVerified(url, sha256, archive, fetch, signature.toString());
      const extracted = await extractArchive(archive, destination);
      if (extracted !== destination) {
        info("Flattening extracted Zig directory");
        for (const entry of await readdir(extracted)) {
          await rename(join(extracted, entry), join(destination, entry));
        }
        await rm(extracted, { recursive: true, force: true });
      }
      info(`Installed Zig ${version} at ${destination}`);
      return destination;
    } catch (error) {
      info(
        `Zig download failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await cleanDirectory(destination);
      if (url === urls.at(-1)) throw error;
      info(`Retrying Zig download (${index + 2}/${urls.length})`);
    } finally {
      await rm(archive, { force: true });
    }
  }
  throw new Error("Unable to download Zig");
}
