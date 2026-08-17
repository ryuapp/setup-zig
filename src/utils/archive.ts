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
  await mkdir(destination, { recursive: true });
  if (archive.endsWith(".zip")) {
    if (process.platform === "win32") {
      const quote = (value: string) => value.replaceAll("'", "''");
      await exec("powershell", [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Add-Type -AssemblyName System.IO.Compression.FileSystem; " +
        `[IO.Compression.ZipFile]::ExtractToDirectory('${quote(archive)}', ` +
        `'${quote(destination)}')`,
      ]);
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
