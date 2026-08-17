import { execFile } from "node:child_process";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export async function extractArchive(
  archive: string,
  destination: string,
): Promise<string> {
  await mkdir(destination, { recursive: true });
  if (archive.endsWith(".zip")) {
    if (process.platform === "win32") {
      await exec("powershell", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Expand-Archive",
        "-LiteralPath",
        archive,
        "-DestinationPath",
        destination,
        "-Force",
      ]);
    } else {
      await exec("unzip", ["-q", archive, "-d", destination]);
    }
  } else {
    await exec("tar", ["-xJf", archive, "-C", destination]);
  }
  const entries = await readdir(destination);
  return entries.length === 1 ? join(destination, entries[0]) : destination;
}
