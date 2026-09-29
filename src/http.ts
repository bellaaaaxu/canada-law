import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { unreachable } from './tool-error.js';
import { VERSION } from './version.js';

export const USER_AGENT = `canada-law-mcp/${VERSION} (+https://github.com/bellaaaaxu/canada-law)`;
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

  return async (url) => {
    const file = join(opts.cacheDir, createHash('sha256').update(url).digest('hex') + '.json');
    const cached = readCache(file);
    if (cached && cached.url === url && now().getTime() - Date.parse(cached.fetchedAt) < ttl) {
      return cached;
    }

    let res: Response;
    let body: string;
    try {
      res = await doFetch(url, { headers: { 'User-Agent': USER_AGENT } });
      body = await res.text();
    } catch (e) {
      // No HTTP response at all (DNS, no route, refused, timeout, TLS): say so plainly, with what to do instead.
      throw unreachable(url, e);
    }
    const result: FetchResult = {
      url,
      status: res.status,
      contentType: res.headers.get('content-type') ?? '',
      body,
      fetchedAt: now().toISOString(),
    };
    if (result.status === 200) saveCache(opts.cacheDir, file, result);
    return result;
  };
}

/** Best effort: remakes the folder if something deleted it (an OS temp cleanup); a failed write only costs the cache. */
function saveCache(dir: string, file: string, result: FetchResult) {
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(result));
  } catch {
    // Not cached this time; the response itself is fine.
  }
}

function readCache(file: string): FetchResult | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as FetchResult;
  } catch {
    return null;
  }
}
