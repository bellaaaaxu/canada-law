import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import type { Glossary } from '../src/glossary.js';
import type { FetchResult, Fetcher } from '../src/http.js';
import { createServer } from '../src/server.js';
import { VERSION } from '../src/version.js';

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const DOC = 'https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/';

const fetcher: Fetcher = async (url): Promise<FetchResult> => {
  const u = decodeURIComponent(url);
  const body =
    u === `${DOC}96113_01/xml` ? fx('doc-96113_01.xml')
    : u === `${DOC}96113_01` ? fx('page-96113_01.head.html')
    : u.includes('/search/complete/fullsearch?') ? fx('fullsearch-overtime.xml')
    : u.startsWith(`${DOC}96113_01/xml/search/`) ? fx('insearch-96113_01-overtime.xml')
    : null;
  return { url, status: body === null ? 500 : 200, body: body ?? 'HTTP Status 500', contentType: 'text/xml', fetchedAt: '2026-09-24T19:00:00.000Z' };
};

const glossary: Glossary = {
  法定假日: [{ jurisdiction: 'bc', en_terms: ['statutory holiday', 'statutory holidays'], acts: [{ act_id: '96113_01', where: 's.1 definition; Part 5' }] }],
};

async function connect() {
  const server = createServer({ fetcher, glossary });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

const textOf = (r: Awaited<ReturnType<Client['callTool']>>) => (r.content as { type: string; text: string }[])[0].text;

describe('MCP server', () => {
  it('offers exactly the five SPEC tools, described in English', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['find_act', 'get_section', 'get_toc', 'map_term', 'search_law']);
    for (const t of tools) expect(t.description, t.name).toMatch(/^[A-Z][a-z]/);
    const search = tools.find((t) => t.name === 'search_law')!;
    expect(search.description).toMatch(/map_term/);
  });

  it('reports the package version', async () => {
    const client = await connect();
    expect(client.getServerVersion()).toMatchObject({ name: 'canada-law', version: VERSION });
  });

  it('sends the usage rules as initialize instructions', async () => {
    const client = await connect();
    const instructions = client.getInstructions() ?? '';
    expect(instructions).toMatch(/Never answer .* from memory/);
    expect(instructions).toMatch(/current_to/);
    expect(instructions).toMatch(/federally regulated/);
    expect(instructions).toMatch(/not legal advice/);
  });

  it('get_section returns the citation contract and the text as JSON', async () => {
    const client = await connect();
    const r = await client.callTool({ name: 'get_section', arguments: { jurisdiction: 'bc', act_id: '96113_01', section: '40' } });
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(textOf(r));
    expect(Object.keys(body.citation).sort()).toEqual(
      ['act_citation', 'act_id', 'act_title', 'current_to', 'heading', 'jurisdiction', 'retrieved_at', 'section', 'source_url'].sort(),
    );
    expect(body.text).toMatch(/^40 \(1\) An employer must pay/);
  });

  it('turns a missing section into a readable tool error', async () => {
    const client = await connect();
    const r = await client.callTool({ name: 'get_section', arguments: { jurisdiction: 'bc', act_id: '96113_01', section: '999' } });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/No section 999/);
  });

  it('says federal law is not available yet instead of failing silently', async () => {
    const client = await connect();
    const r = await client.callTool({ name: 'get_toc', arguments: { jurisdiction: 'federal', act_id: 'L-2' } });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/M2/);
  });

  it('search_law with jurisdiction "all" searches BC and notes that federal is not there yet', async () => {
    const client = await connect();
    const r = await client.callTool({ name: 'search_law', arguments: { query: 'overtime', jurisdiction: 'all' } });
    const body = JSON.parse(textOf(r));
    expect(body.results.some((x: { section: string }) => x.section === '40')).toBe(true);
    expect(body.notes.join(' ')).toMatch(/[Ff]ederal .*not available yet/);
  });

  it('map_term returns glossary entries, or [] when the term is unknown', async () => {
    const client = await connect();
    const hit = JSON.parse(textOf(await client.callTool({ name: 'map_term', arguments: { term: '法定假日' } })));
    expect(hit[0]).toMatchObject({ term: '法定假日', jurisdiction: 'bc', en_terms: ['statutory holiday', 'statutory holidays'] });
    const miss = JSON.parse(textOf(await client.callTool({ name: 'map_term', arguments: { term: '育儿假' } })));
    expect(miss).toEqual([]);
  });
});
