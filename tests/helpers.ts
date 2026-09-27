// Shared test helpers: captured 2026-09-24 BC Laws responses, and a fake fetcher that serves them by URL.
import { readFileSync } from 'node:fs';
import type { FetchResult, Fetcher } from '../src/http.js';

export const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
export const FETCHED_AT = '2026-09-24T19:00:00.000Z';
export const DOC = 'https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/';

export type Route = [test: (decodedUrl: string) => boolean, body: string | { status: number; body: string }];

/** Serves captured responses by URL pattern; anything unrouted is a 500, like CiviX on zero hits. */
export function fakeFetcher(routes: Route[]): Fetcher & { calls: string[] } {
  const calls: string[] = [];
  const f = (async (url: string): Promise<FetchResult> => {
    calls.push(url);
    const decoded = decodeURIComponent(url);
    const hit = routes.find(([t]) => t(decoded));
    const r = hit ? (typeof hit[1] === 'string' ? { status: 200, body: hit[1] } : hit[1]) : { status: 500, body: 'HTTP Status 500' };
    return { url, status: r.status, body: r.body, contentType: 'text/xml', fetchedAt: FETCHED_AT };
  }) as Fetcher & { calls: string[] };
  f.calls = calls;
  return f;
}

export const NO_RESULTS = fx('xpath-no-results.xml');

/** The Employment Standards Act: full XML, official page header, and "not repealed". */
export const esaRoutes: Route[] = [
  [(u) => u === `${DOC}96113_01/xml`, fx('doc-96113_01.xml')],
  [(u) => u === `${DOC}96113_01`, fx('page-96113_01.head.html')],
  [(u) => u.startsWith(`${DOC}96113_01/xml/xpath//act:act[@status]`), NO_RESULTS],
];
