/// <reference lib="deno.ns" />

import { assertEquals } from "./assert.ts";
import { resolveVersion } from "./version.ts";

Deno.test("resolves latest, master, and a v-prefixed version", () => {
  const index = { "0.15.1": {}, "0.16.0": {}, "0.16.1": {}, master: {} };
  assertEquals(resolveVersion("latest", index), "0.16.1");
  assertEquals(resolveVersion("v0.16.0", index), "0.16.0");
  assertEquals(resolveVersion("master", index), "master");
});

Deno.test("accepts an explicit development version", () => {
  const version = "0.17.0-dev.813+2153f8143";
  assertEquals(resolveVersion(version, {}), version);
});

Deno.test("rejects Zig versions older than 0.16.0", () => {
  try {
    resolveVersion("0.15.1", {});
    throw new Error("expected resolveVersion to throw");
  } catch (error) {
    if (
      !(error instanceof Error) || !error.message.includes("0.16.0 or newer")
    ) throw error;
  }
});
