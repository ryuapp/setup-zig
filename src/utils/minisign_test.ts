/// <reference lib="deno.ns" />

import { verifyMinisign } from "./minisign.ts";
import { assertThrows } from "./assert.ts";

function signature(primary: Uint8Array, trustedComment = "file:zig.tar.xz") {
  return [
    "untrusted comment: signature from minisign secret key",
    btoa(String.fromCharCode(...primary)),
    `trusted comment: ${trustedComment}`,
    btoa(String.fromCharCode(...new Uint8Array(64))),
  ].join("\n");
}

Deno.test("rejects an invalid minisign envelope", () => {
  assertThrows(
    () => verifyMinisign(new Uint8Array(), "not a signature", "zig.tar.xz"),
    "expected invalid envelope to be rejected",
  );
});

Deno.test("rejects unsupported signature types", () => {
  const primary = new Uint8Array(74);
  primary.set(new TextEncoder().encode("ZZ"));
  assertThrows(
    () => verifyMinisign(new Uint8Array(), signature(primary), "zig.tar.xz"),
    "expected unsupported signature type to be rejected",
  );
});

Deno.test("rejects signatures with a different key id", () => {
  const primary = new Uint8Array(74);
  primary.set(new TextEncoder().encode("ED"));
  primary.set(new Uint8Array(8).fill(1), 2);
  assertThrows(
    () => verifyMinisign(new Uint8Array(), signature(primary), "zig.tar.xz"),
    "expected key id mismatch to be rejected",
  );
});

Deno.test("rejects invalid primary signatures", () => {
  const primary = new Uint8Array(74);
  primary.set(new TextEncoder().encode("ED"));
  const key = Uint8Array.from(
    atob("RWSGOq2NVecA2UPNdBUZykf1CCb147pkmdtYxgb3Ti+JO/wCYvhbAb/U"),
    (character) => character.charCodeAt(0),
  );
  primary.set(key.slice(2, 10), 2);
  assertThrows(
    () => verifyMinisign(new Uint8Array(), signature(primary), "zig.tar.xz"),
    "expected invalid primary signature to be rejected",
  );
});
