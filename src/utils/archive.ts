import { execFile } from "node:child_process";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { info } from "./actions.ts";

const exec = promisify(execFile);

export async function extractArchive(
  archive: string,
  destination: string,
): Promise<string> {
  const started = performance.now();
  const format = archive.endsWith(".zip") ? "ZIP" : "tar.xz";
  info(`Extracting ${format} archive`);
  await mkdir(destination, { recursive: true });
  if (archive.endsWith(".zip")) {
    if (process.platform === "win32") {
      try {
        info("Extracting ZIP with 7-Zip");
        await exec("7z", ["x", "-y", `-o${destination}`, archive]);
      } catch (error) {
        const code = typeof error === "object" && error && "code" in error
          ? error.code
          : undefined;
        if (code !== "ENOENT") throw error;
        info("7-Zip is unavailable; extracting ZIP with tar");
        await exec("tar", ["-xf", archive, "-C", destination]);
      }
    } else {
      await exec("unzip", ["-q", archive, "-d", destination]);
    }
  } else {
    await exec("tar", ["-xJf", archive, "-C", destination]);
  }
  info(`Archive extracted in ${(performance.now() - started).toFixed(1)}ms`);
  const entries = await readdir(destination);
  return entries.length === 1 ? join(destination, entries[0]) : destination;
}
