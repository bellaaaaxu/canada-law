import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { BcClient } from '../sources/bc.js';
import { FEDERAL_NOT_YET, READ_ONLY, fail, run } from './shared.js';

export function registerSearchLaw(server: McpServer, bc: BcClient) {
  server.registerTool(
    'search_law',
    {
      title: 'Search legislation',
      description:
        'Search current legislation for English statutory wording and get the matching sections, best first, each with citation fields (act, section, heading, source_url, current_to) and a snippet. The query must use the statutory English of the jurisdiction: if the question is in Chinese or uses everyday words, call map_term first (for example BC says "statutory holiday" where federal law says "general holiday"). Then read the full text with get_section before answering.',
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe('English statutory wording. Use "double quotes" for phrases and OR for variants, e.g. "meal break" OR "meal breaks". Matching is literal: no plurals or stemming.'),
        jurisdiction: z.enum(['bc', 'federal', 'all']).describe('"bc", "federal" (available from M2) or "all".'),
        limit: z.number().int().min(1).max(20).default(10).describe('Maximum number of sections to return (default 10).'),
      },
      annotations: READ_ONLY,
    },
    async ({ query, jurisdiction, limit }) => {
      if (jurisdiction === 'federal') return fail(FEDERAL_NOT_YET);
      return run(async () => {
        const r = await bc.search(query, limit);
        if (jurisdiction === 'all') r.notes.push(`${FEDERAL_NOT_YET} These results are BC only.`);
        return r;
      });
    },
  );
}
