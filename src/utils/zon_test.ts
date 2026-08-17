/// <reference lib="deno.ns" />

import { assertEquals } from "./assert.ts";
import { getMinimumVersion } from "./zon.ts";

Deno.test("reads minimum_zig_version while ignoring comments", () => {
  assertEquals(
    getMinimumVersion(
      '// .minimum_zig_version = "0.15.0"\n.{\n    .minimum_zig_version = "0.16.0", // supported version\n}',
    ),
    "0.16.0",
  );
});
