/// <reference lib="deno.ns" />

import { assertEquals } from "./assert.ts";
import {
  createCacheEntry,
  finalizeCacheEntry,
  getCacheDownloadUrl,
  uploadCacheArchive,
} from "./cache-service.ts";

Deno.test("uses Cache Service v2 Twirp endpoints", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const responses = [
    { ok: true, signed_download_url: "https://blob.example.test/download" },
    { ok: true, signed_upload_url: "https://blob.example.test/upload" },
    { ok: true, entry_id: "1" },
  ];
  const fetcher = ((input: URL | RequestInfo, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return Promise.resolve(Response.json(responses.at(requests.length - 1)));
  }) as typeof fetch;
  const options = {
    base: "https://results.example.test/base/",
    token: "token",
    fetcher,
  };

  assertEquals(
    await getCacheDownloadUrl("key", "version", options),
    "https://blob.example.test/download",
  );
  assertEquals(
    await createCacheEntry("key", "version", options),
    "https://blob.example.test/upload",
  );
  await finalizeCacheEntry("key", "version", 123, options);

  assertEquals(
    requests.at(0)?.url,
    "https://results.example.test/twirp/github.actions.results.api.v1.CacheService/GetCacheEntryDownloadURL",
  );
  assertEquals(requests.at(1)?.url.endsWith("/CreateCacheEntry"), true);
  assertEquals(
    requests.at(2)?.url.endsWith("/FinalizeCacheEntryUpload"),
    true,
  );
  assertEquals(
    new Headers(requests.at(0)?.init?.headers).get("authorization"),
    "Bearer token",
  );
  assertEquals(
    requests.at(0)?.init?.body,
    JSON.stringify({ key: "key", restore_keys: [], version: "version" }),
  );
  assertEquals(
    requests.at(2)?.init?.body,
    JSON.stringify({ key: "key", version: "version", size_bytes: "123" }),
  );
});

Deno.test("uploads a small cache as an Azure block blob", async () => {
  let request: { url: string; init?: RequestInit } | undefined;
  const fetcher = ((input: URL | RequestInfo, init?: RequestInit) => {
    request = { url: String(input), init };
    return Promise.resolve(new Response(null, { status: 201 }));
  }) as typeof fetch;

  await uploadCacheArchive(
    "https://blob.example.test/cache?sig=secret",
    new Uint8Array([1, 2, 3]),
    fetcher,
  );

  assertEquals(request?.url, "https://blob.example.test/cache?sig=secret");
  assertEquals(request?.init?.method, "PUT");
  assertEquals(
    new Headers(request?.init?.headers).get("x-ms-blob-type"),
    "BlockBlob",
  );
});
