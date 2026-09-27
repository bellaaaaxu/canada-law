import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { BcClient } from '../sources/bc.js';
import { FEDERAL_NOT_YET, READ_ONLY, fail, jurisdiction, run } from './shared.js';

export function registerFindAct(server: McpServer, bc: BcClient) {
  server.registerTool(
    'find_act',
    {
      title: 'Find an act or regulation',
      description:
        'Find acts and regulations by title. Returns candidates with act_id (pass it to get_toc and get_section), the official title, citation (e.g. "RSBC 1996, c. 113" or "B.C. Reg. 396/95"), source_url, and for acts whether they are current or repealed/replaced. Exact title matches and current acts come first.',
      inputSchema: {
        name: z
          .string()
          .min(1)
          .describe('Official English title or distinctive words from it, e.g. "Employment Standards Act". Abbreviations such as "ESA" are not recognised.'),
        jurisdiction,
      },
      annotations: READ_ONLY,
    },
    async ({ name, jurisdiction: j }) => (j === 'federal' ? fail(FEDERAL_NOT_YET) : run(() => bc.findAct(name))),
  );
}
