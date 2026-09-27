import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { lookupTerm, type Glossary } from '../glossary.js';
import { READ_ONLY, run } from './shared.js';

export function registerMapTerm(server: McpServer, glossary: Glossary) {
  server.registerTool(
    'map_term',
    {
      title: 'Map a term to statutory wording',
      description:
        'Map a Chinese (or English) employment-law concept to the statutory English each jurisdiction uses, and where it appears (act_id and sections). Call this before search_law when the question is in Chinese. Returns [] when the term is not in the curated glossary: then do not present your own translation as the statutory term; try a more basic term, or search with your own English wording and say that you did.',
      inputSchema: {
        term: z.string().min(1).describe('A concept such as 法定假日, 加班, 餐休, or an English term such as "statutory holiday".'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ term }) => run(async () => lookupTerm(glossary, term)),
  );
}
