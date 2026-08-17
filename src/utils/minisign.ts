import { createHash, createPublicKey, verify } from "node:crypto";
import { Buffer } from "node:buffer";

export const ZIG_MINISIGN_PUBLIC_KEY =
  "RWSGOq2NVecA2UPNdBUZykf1CCb147pkmdtYxgb3Ti+JO/wCYvhbAb/U";
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function publicKeyBytes(): {
  keyId: Buffer;
  key: ReturnType<typeof createPublicKey>;
} {
  const decoded = Buffer.from(ZIG_MINISIGN_PUBLIC_KEY, "base64");
  if (decoded.length !== 42 || decoded.subarray(0, 2).toString() !== "Ed") {
    throw new Error("Invalid Zig minisign public key");
  }
  return {
    keyId: decoded.subarray(2, 10),
    key: createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, decoded.subarray(10)]),
      format: "der",
      type: "spki",
    }),
  };
}

export function verifyMinisign(
  data: Uint8Array,
  signatureText: string,
  filename: string,
): void {
  const lines = signatureText.trim().split(/\r?\n/);
  if (lines.length < 4 || !lines[2].startsWith("trusted comment: ")) {
    throw new Error("Invalid minisign signature format");
  }
  const primary = Buffer.from(lines[1], "base64");
  const global = Buffer.from(lines[3], "base64");
  if (
    primary.length !== 74 || global.length !== 64 ||
    primary.subarray(0, 2).toString() !== "ED"
  ) throw new Error("Unsupported minisign signature");
  const { keyId, key } = publicKeyBytes();
  if (!primary.subarray(2, 10).equals(keyId)) {
    throw new Error("Minisign key id mismatch");
  }
  const message = createHash("blake2b512").update(data).digest();
  if (!verify(null, message, key, primary.subarray(10))) {
    throw new Error("Minisign tarball signature verification failed");
  }
  const trustedComment = lines[2].slice("trusted comment: ".length);
  if (
    !verify(
      null,
      Buffer.concat([primary.subarray(10), Buffer.from(trustedComment)]),
      key,
      global,
    )
  ) throw new Error("Minisign trusted comment verification failed");
  const match = trustedComment.match(/(?:^|\s)file:([^\s]+)/);
  if (match?.[1] !== filename) {
    throw new Error(`Minisign filename mismatch: expected ${filename}`);
  }
}
