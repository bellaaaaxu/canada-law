import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { searchAll } from '../sources/search-all.js';
import { READ_ONLY, run, withAnswerRules, type Sources } from './shared.js';

export function registerSearchLaw(server: McpServer, sources: Sources) {
  server.registerTool(
    'search_law',
    {
      title: 'Search legislation',
      description:
        'Search current legislation for English statutory wording and get the matching sections, best first, each with citation fields (act, section, heading, source_url, current_to) and a snippet. The query must use the statutory English of the jurisdiction: if the question is in Chinese or uses everyday words, call map_term first (for example BC says "statutory holiday" where federal law says "general holiday"). Then read the full text with get_section before answering. The result also carries answer_rules, the answer format and rules for using this text: follow them when you answer.',
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe('English statutory wording. Use "double quotes" for phrases and OR for variants, e.g. "meal break" OR "meal breaks". Matching is literal: no plurals or stemming.'),
        jurisdiction: z
          .enum(['bc', 'federal', 'all'])
          .describe('"bc" (all BC statutes and regulations), "federal" (the Canada Labour Code and the regulations made under it) or "all" (both, ranked together).'),
        limit: z.number().int().min(1).max(20).default(10).describe('Maximum number of sections to return (default 10).'),
      },
      annotations: READ_ONLY,
    },
    async ({ query, jurisdiction, limit }) =>
      run(async () =>
        withAnswerRules(
          await (jurisdiction === 'bc'
            ? sources.bc.search(query, limit)
            : jurisdiction === 'federal'
              ? sources.federal.search(query, limit)
              : searchAll(sources, query, limit)),
        ),
      ),
  );
}
