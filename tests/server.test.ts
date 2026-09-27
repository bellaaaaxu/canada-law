import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import type { Glossary } from '../src/glossary.js';
import type { Fetcher } from '../src/http.js';
import { BC_LAWS_NOTICE, FEDERAL_NOTICE } from '../src/notice.js';
import { createServer } from '../src/server.js';
import { VERSION } from '../src/version.js';
import { DOC, FED, fakeFetcher, fedRoutes, fx } from './helpers.js';

// BC Laws (the Employment Standards Act, and an "overtime" search) and Justice Laws (the Canada Labour Code and two regulations)
const fetcher = fakeFetcher([
  [(u) => u === `${DOC}96113_01/xml`, fx('doc-96113_01.xml')],
  [(u) => u === `${DOC}96113_01`, fx('page-96113_01.head.html')],
  [(u) => u.includes('/search/complete/fullsearch?'), fx('fullsearch-overtime.xml')],
  [(u) => u.startsWith(`${DOC}96113_01/xml/search/`), fx('insearch-96113_01-overtime.xml')],
  ...fedRoutes,
]);

const glossary: Glossary = {
  法定假日: [
    { jurisdiction: 'bc', en_terms: ['statutory holiday', 'statutory holidays'], acts: [{ act_id: '96113_01', where: 's.1 definition; Part 5' }] },
    { jurisdiction: 'federal', en_terms: ['general holiday', 'general holidays'], acts: [{ act_id: 'L-2', where: 's.166 definition; s.192' }] },
  ],
};

async function connect(using: Fetcher = fetcher) {
  const server = createServer({ fetcher: using, glossary });
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

  it('sends the usage rules as initialize instructions, for BC and federal law', async () => {
    const client = await connect();
    const instructions = client.getInstructions() ?? '';
    expect(instructions).toMatch(/Never answer .* from memory/);
    expect(instructions).toMatch(/current_to/);
    expect(instructions).toMatch(/federally regulated/);
    expect(instructions).toMatch(/Canada Labour Code/);
    expect(instructions).toContain('https://www.canada.ca/en/services/jobs/workplace/federal-labour-standards/filing-complaint.html');
    expect(instructions).toMatch(/not legal advice/);
  });

  // Claude Desktop and claude.ai do not pass the initialize instructions to the model (anthropics/claude-ai-mcp#93),
  // so the answer format and rules also come back with the text.
  it.each([
    ['get_section', { jurisdiction: 'bc', act_id: '96113_01', section: '40' }],
    ['get_section', { jurisdiction: 'federal', act_id: 'L-2', section: '169.1' }],
    ['search_law', { query: 'overtime', jurisdiction: 'bc' }],
    ['search_law', { query: '"general holiday" OR "general holidays"', jurisdiction: 'federal' }],
    ['search_law', { query: 'overtime', jurisdiction: 'all' }],
    ['get_toc', { jurisdiction: 'federal', act_id: 'L-2' }],
  ])('%s %j returns the answer format and rules, word for word as in the instructions', async (name, args) => {
    const client = await connect();
    const rules: unknown = JSON.parse(textOf(await client.callTool({ name, arguments: args }))).answer_rules;
    expect(Array.isArray(rules)).toBe(true);
    const lines = rules as string[];
    expect(lines[0]).toBe("Answer in the user's language, in this order:");
    expect((client.getInstructions() ?? '').replace(/\n{2,}/g, '\n')).toContain(lines.join('\n'));
    for (const part of ['What the law says', 'Not from the official text', 'Where to get help', 'not legal advice', 'Say which law you answered from']) {
      expect(lines.join('\n')).toContain(part);
    }
  });

  // A model may treat directions inside a tool result as untrusted; the tool's own description vouches for them.
  it('get_section, search_law and get_toc say in their descriptions that answer_rules come back and are to be followed', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    for (const name of ['get_section', 'search_law', 'get_toc']) {
      expect(tools.find((t) => t.name === name)!.description, name).toMatch(/answer_rules.*follow/);
    }
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

  it('get_section reads federal law, with the same citation fields', async () => {
    const client = await connect();
    const r = await client.callTool({ name: 'get_section', arguments: { jurisdiction: 'federal', act_id: 'L-2', section: '169.1' } });
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(textOf(r));
    expect(body.citation).toMatchObject({ jurisdiction: 'federal', act_id: 'L-2', section: '169.1', heading: 'Break', current_to: '2026-09-03' });
    expect(body.notice).toBe(FEDERAL_NOTICE);
  });

  it('get_toc and find_act work for federal law', async () => {
    const client = await connect();
    const toc = JSON.parse(textOf(await client.callTool({ name: 'get_toc', arguments: { jurisdiction: 'federal', act_id: 'L-2' } })));
    expect(toc.outline).toContain('DIVISION V — General Holidays');
    const found = JSON.parse(textOf(await client.callTool({ name: 'find_act', arguments: { jurisdiction: 'federal', name: 'Canada Labour Code' } })));
    expect(found[0]).toMatchObject({ act_id: 'L-2', type: 'act' });
  });

  it('search_law with jurisdiction "all" ranks BC and federal results together', async () => {
    const client = await connect();
    const r = await client.callTool({ name: 'search_law', arguments: { query: 'overtime', jurisdiction: 'all', limit: 20 } });
    const body = JSON.parse(textOf(r));
    expect(body.results.some((x: { jurisdiction: string; section: string }) => x.jurisdiction === 'bc' && x.section === '40')).toBe(true);
    expect(body.results.some((x: { jurisdiction: string; section: string }) => x.jurisdiction === 'federal' && x.section === '174')).toBe(true);
    const scores = body.results.map((x: { jurisdiction: string }) => x.jurisdiction);
    expect(new Set(scores)).toEqual(new Set(['bc', 'federal']));
    expect(body.notes.join(' ')).not.toMatch(/not available/);
    expect(body.notice).toContain(BC_LAWS_NOTICE);
    expect(body.notice).toContain(FEDERAL_NOTICE);
  });

  it('search_law "all" still returns federal results when BC Laws fails, and says so', async () => {
    const client = await connect(fakeFetcher(fedRoutes)); // every BC Laws request answers 500
    const r = await client.callTool({ name: 'search_law', arguments: { query: 'overtime', jurisdiction: 'all' } });
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(textOf(r));
    expect(body.results.some((x: { jurisdiction: string; section: string }) => x.jurisdiction === 'federal' && x.section === '174')).toBe(true);
    expect(body.warnings.join(' ')).toMatch(/BC search failed, so only federal results are shown/);
  });

  it('search_law "all" still returns BC results when Justice Laws cannot be reached at all', async () => {
    const offline: Fetcher = async (url) => {
      if (url.startsWith(FED)) throw new TypeError('fetch failed');
      return fetcher(url);
    };
    const client = await connect(offline);
    const r = await client.callTool({ name: 'search_law', arguments: { query: 'overtime', jurisdiction: 'all' } });
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(textOf(r));
    expect(body.results.some((x: { jurisdiction: string; section: string }) => x.jurisdiction === 'bc' && x.section === '40')).toBe(true);
    expect(body.warnings.join(' ')).toMatch(/Federal search failed, so only BC results are shown: .*fetch failed/);
  });

  it('search_law "all" says what went wrong on both sides when both fail', async () => {
    const client = await connect(async () => {
      throw new TypeError('fetch failed');
    });
    const r = await client.callTool({ name: 'search_law', arguments: { query: 'overtime', jurisdiction: 'all' } });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/BC search failed: .*fetch failed.*Federal search failed: .*fetch failed/);
  });

  it('search_law "federal" searches federal law only', async () => {
    const client = await connect();
    const body = JSON.parse(textOf(await client.callTool({ name: 'search_law', arguments: { query: '"general holiday" OR "general holidays"', jurisdiction: 'federal' } })));
    expect(body.results[0]).toMatchObject({ jurisdiction: 'federal', act_id: 'L-2', section: '166' });
    expect(body.results.every((x: { jurisdiction: string }) => x.jurisdiction === 'federal')).toBe(true);
  });

  it('map_term returns glossary entries for each jurisdiction, or [] when the term is unknown', async () => {
    const client = await connect();
    const hit = JSON.parse(textOf(await client.callTool({ name: 'map_term', arguments: { term: '法定假日' } })));
    expect(hit).toMatchObject([
      { term: '法定假日', jurisdiction: 'bc', en_terms: ['statutory holiday', 'statutory holidays'] },
      { term: '法定假日', jurisdiction: 'federal', en_terms: ['general holiday', 'general holidays'] },
    ]);
    const miss = JSON.parse(textOf(await client.callTool({ name: 'map_term', arguments: { term: '育儿假' } })));
    expect(miss).toEqual([]);
  });
});
