import process from "node:process";

const SERVICE = "github.actions.results.api.v1.CacheService";
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);
const MAX_ATTEMPTS = 5;
const BLOCK_SIZE = 64 * 1024 * 1024;
const SINGLE_UPLOAD_LIMIT = 128 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 8;

type Fetcher = typeof fetch;

interface ServiceOptions {
  base?: string;
  token?: string;
  fetcher?: Fetcher;
}

interface CreateResponse {
  ok: boolean;
  signed_upload_url?: string;
  signedUploadUrl?: string;
  message?: string;
}

interface DownloadResponse {
  ok: boolean;
  signed_download_url?: string;
  signedDownloadUrl?: string;
  matched_key?: string;
  matchedKey?: string;
}

interface FinalizeResponse {
  ok: boolean;
  message?: string;
}

function serviceCredentials(
  options: ServiceOptions,
): { base: string; token: string } {
  const base = options.base ?? process.env.ACTIONS_RESULTS_URL;
  const token = options.token ?? process.env.ACTIONS_RUNTIME_TOKEN;
  if (!base || !token) {
    throw new Error("GitHub Actions cache service v2 is unavailable");
  }
  return { base, token };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestWithRetry(
  operation: () => Promise<Response>,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await operation();
      if (!RETRYABLE_STATUSES.has(response.status)) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt + 1 < MAX_ATTEMPTS) {
      await delay(3000 * 1.5 ** attempt);
    }
  }
  throw lastError;
}

async function twirp<T>(
  method: string,
  body: object,
  options: ServiceOptions = {},
): Promise<T> {
  const { base, token } = serviceCredentials(options);
  const fetcher = options.fetcher ?? fetch;
  const url = new URL(`/twirp/${SERVICE}/${method}`, base);
  const response = await requestWithRetry(() =>
    fetcher(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    })
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `${method} failed (${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }
  return await response.json() as T;
}

export async function getCacheDownloadUrl(
  key: string,
  version: string,
  options: ServiceOptions = {},
): Promise<string | undefined> {
  const response = await twirp<DownloadResponse>(
    "GetCacheEntryDownloadURL",
    { key, restore_keys: [], version },
    options,
  );
  if (!response.ok) return undefined;
  return response.signed_download_url ?? response.signedDownloadUrl;
}

export async function createCacheEntry(
  key: string,
  version: string,
  options: ServiceOptions = {},
): Promise<string | undefined> {
  const response = await twirp<CreateResponse>(
    "CreateCacheEntry",
    { key, version },
    options,
  );
  if (!response.ok) {
    if (response.message) throw new Error(response.message);
    return undefined;
  }
  const url = response.signed_upload_url ?? response.signedUploadUrl;
  if (!url) throw new Error("Cache service did not return an upload URL");
  return url;
}

export async function finalizeCacheEntry(
  key: string,
  version: string,
  size: number,
  options: ServiceOptions = {},
): Promise<void> {
  const response = await twirp<FinalizeResponse>(
    "FinalizeCacheEntryUpload",
    { key, version, size_bytes: String(size) },
    options,
  );
  if (!response.ok) {
    throw new Error(response.message || "Cache finalization failed");
  }
}

async function put(
  url: URL,
  body: BodyInit | Uint8Array<ArrayBufferLike>,
  headers: Record<string, string>,
  fetcher: Fetcher,
): Promise<void> {
  const response = await requestWithRetry(() =>
    fetcher(url, { method: "PUT", headers, body: body as BodyInit })
  );
  if (!response.ok) {
    throw new Error(`Cache upload failed (${response.status})`);
  }
}

function blockUrl(signedUrl: string, operation: string): URL {
  const url = new URL(signedUrl);
  url.searchParams.set("comp", operation);
  return url;
}

function blockId(index: number): string {
  return Buffer.from(String(index).padStart(8, "0")).toString("base64");
}

export async function uploadCacheArchive(
  signedUrl: string,
  archive: Uint8Array,
  fetcher: Fetcher = fetch,
): Promise<void> {
  if (archive.byteLength <= SINGLE_UPLOAD_LIMIT) {
    await put(
      new URL(signedUrl),
      archive,
      {
        "content-type": "application/octet-stream",
        "x-ms-blob-type": "BlockBlob",
      },
      fetcher,
    );
    return;
  }

  const count = Math.ceil(archive.byteLength / BLOCK_SIZE);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(UPLOAD_CONCURRENCY, count) }, async () => {
      while (next < count) {
        const index = next++;
        const id = blockId(index);
        const url = blockUrl(signedUrl, "block");
        url.searchParams.set("blockid", id);
        const start = index * BLOCK_SIZE;
        await put(
          url,
          archive.slice(
            start,
            Math.min(start + BLOCK_SIZE, archive.byteLength),
          ),
          { "content-type": "application/octet-stream" },
          fetcher,
        );
      }
    }),
  );

  const blocks = Array.from(
    { length: count },
    (_, index) => `<Latest>${blockId(index)}</Latest>`,
  ).join("");
  await put(
    blockUrl(signedUrl, "blocklist"),
    `<?xml version="1.0" encoding="utf-8"?><BlockList>${blocks}</BlockList>`,
    { "content-type": "application/xml" },
    fetcher,
  );
}
