import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const USER_AGENT = 'canada-law-mcp/0.1 (+https://github.com/bellaaaaxu/canada-law)';
const DAY_MS = 24 * 3600_000;

export type FetchResult = {
  url: string;
  status: number;
  contentType: string;
  body: string;
  /** When this copy was retrieved from the official source (ISO). A cache hit keeps the original time. */
  fetchedAt: string;
};

export type Fetcher = (url: string) => Promise<FetchResult>;

export type CachedFetcherOptions = {
  cacheDir: string;
  ttlMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

/** GET with a per-URL disk cache (default 24 hours). Only 200 responses are cached. */
export function createCachedFetcher(opts: CachedFetcherOptions): Fetcher {
  const ttl = opts.ttlMs ?? DAY_MS;
  const doFetch = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => new Date());
  mkdirSync(opts.cacheDir, { recursive: true });

  return async (url) => {
    const file = join(opts.cacheDir, createHash('sha256').update(url).digest('hex') + '.json');
    const cached = readCache(file);
    if (cached && cached.url === url && now().getTime() - Date.parse(cached.fetchedAt) < ttl) {
      return cached;
    }

    const res = await doFetch(url, { headers: { 'User-Agent': USER_AGENT } });
    const result: FetchResult = {
      url,
      status: res.status,
      contentType: res.headers.get('content-type') ?? '',
      body: await res.text(),
      fetchedAt: now().toISOString(),
    };
    if (result.status === 200) writeFileSync(file, JSON.stringify(result));
    return result;
  };
}

function readCache(file: string): FetchResult | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as FetchResult;
  } catch {
    return null;
  }
}
