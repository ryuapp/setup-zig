/// <reference lib="deno.ns" />

import { artifactFor, type DownloadIndex } from "./zig.ts";
/// <reference lib="deno.unstable" />

Deno.test("reports missing platform artifacts", () => {
  try {
    artifactFor({ "0.15.1": {} } as DownloadIndex, "0.15.1", "x86_64-linux");
    throw new Error("expected artifactFor to throw");
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("no artifact")) {
      throw error;
    }
  }
});
