import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCachedFetcher } from '../src/http.js';
import { ToolError } from '../src/tool-error.js';

type Call = { url: string; headers: Record<string, string> };

function fakeFetch(status = 200, body = '<ok/>') {
  const calls: Call[] = [];
  const impl = (async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url, headers: init?.headers ?? {} });
    return new Response(body, { status, headers: { 'content-type': 'text/xml' } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('createCachedFetcher', () => {
  let dir: string;
  let now: Date;
  const clock = () => now;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'clmcp-cache-'));
    now = new Date('2026-09-24T19:00:00.000Z');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('serves a repeat request within 24 hours from cache, keeping the original fetchedAt', async () => {
    const { impl, calls } = fakeFetch();
    const get = createCachedFetcher({ cacheDir: dir, fetchImpl: impl, now: clock });
    const first = await get('https://example.test/a');
    now = new Date(now.getTime() + 23 * 3600_000);
    const second = await get('https://example.test/a');
    expect(calls).toHaveLength(1);
    expect(second.body).toBe('<ok/>');
    expect(second.fetchedAt).toBe('2026-09-24T19:00:00.000Z');
    expect(second.fetchedAt).toBe(first.fetchedAt);
  });

  it('fetches again once the cached copy is older than 24 hours', async () => {
    const { impl, calls } = fakeFetch();
    const get = createCachedFetcher({ cacheDir: dir, fetchImpl: impl, now: clock });
    await get('https://example.test/a');
    now = new Date(now.getTime() + 24 * 3600_000 + 1);
    const again = await get('https://example.test/a');
    expect(calls).toHaveLength(2);
    expect(again.fetchedAt).toBe(now.toISOString());
  });

  it('does not cache non-200 responses', async () => {
    const { impl, calls } = fakeFetch(500, 'boom');
    const get = createCachedFetcher({ cacheDir: dir, fetchImpl: impl, now: clock });
    const r = await get('https://example.test/a');
    await get('https://example.test/a');
    expect(r.status).toBe(500);
    expect(calls).toHaveLength(2);
  });

  it('keeps the cache on disk, so a new fetcher instance reuses it', async () => {
    const first = fakeFetch();
    await createCachedFetcher({ cacheDir: dir, fetchImpl: first.impl, now: clock })('https://example.test/a');
    const second = fakeFetch();
    const r = await createCachedFetcher({ cacheDir: dir, fetchImpl: second.impl, now: clock })('https://example.test/a');
    expect(second.calls).toHaveLength(0);
    expect(r.body).toBe('<ok/>');
  });

  it('recreates the cache folder when it is deleted while the server runs (an OS temp cleanup)', async () => {
    const { impl, calls } = fakeFetch();
    const get = createCachedFetcher({ cacheDir: dir, fetchImpl: impl, now: clock });
    await get('https://example.test/a');
    rmSync(dir, { recursive: true, force: true });
    const r = await get('https://example.test/b');
    await get('https://example.test/b');
    expect(r.body).toBe('<ok/>');
    expect(calls).toHaveLength(2);
  });

  it('still returns what it fetched when the cache cannot be written', async () => {
    const { impl } = fakeFetch();
    const get = createCachedFetcher({ cacheDir: dir, fetchImpl: impl, now: clock });
    rmSync(dir, { recursive: true, force: true });
    writeFileSync(dir, 'a file where the cache folder should be');
    const r = await get('https://example.test/a');
    expect(r.status).toBe(200);
    expect(r.body).toBe('<ok/>');
  });

  it('starts even when the cache folder cannot be made', async () => {
    const { impl } = fakeFetch();
    rmSync(dir, { recursive: true, force: true });
    writeFileSync(dir, 'a file where the cache folder should be');
    const get = createCachedFetcher({ cacheDir: dir, fetchImpl: impl, now: clock });
    const r = await get('https://example.test/a');
    expect(r.body).toBe('<ok/>');
  });

  it('sends an explicit User-Agent', async () => {
    const { impl, calls } = fakeFetch();
    await createCachedFetcher({ cacheDir: dir, fetchImpl: impl, now: clock })('https://example.test/a');
    expect(calls[0].headers['User-Agent']).toMatch(/^canada-law-mcp\//);
  });

  // 2026-09-29, claude.ai: the sandbox could not reach BC Laws, the script said only "fetch failed", and the answer then
  // reported a "current to" date the tool never returned. A network failure now says what happened and what to do.
  it('turns a network failure into a plain message: which site, and not to fill in text or dates from elsewhere', async () => {
    const offline = (async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('getaddrinfo ENOTFOUND www.bclaws.gov.bc.ca'), { code: 'ENOTFOUND' }) });
    }) as unknown as typeof fetch;
    const get = createCachedFetcher({ cacheDir: dir, fetchImpl: offline, now: clock });
    const err = await get('https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/96113_01/xml').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ToolError);
    const msg = (err as Error).message;
    expect(msg).toContain('Could not reach www.bclaws.gov.bc.ca from this environment (ENOTFOUND)');
    expect(msg).toContain('Do not supply the wording, a "current to" date or a version from another website or from memory');
    expect(msg).toContain('Official website: https://www.bclaws.gov.bc.ca/');
  });

  it('a network failure is not cached, so the next call tries again', async () => {
    let fail = true;
    const flaky = (async () => {
      if (fail) throw new TypeError('fetch failed');
      return new Response('<ok/>', { status: 200 });
    }) as unknown as typeof fetch;
    const get = createCachedFetcher({ cacheDir: dir, fetchImpl: flaky, now: clock });
    await expect(get('https://example.test/a')).rejects.toBeInstanceOf(ToolError);
    fail = false;
    expect((await get('https://example.test/a')).body).toBe('<ok/>');
  });
});
