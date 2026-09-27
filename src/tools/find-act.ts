import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { READ_ONLY, jurisdiction, run, type Sources } from './shared.js';

export function registerFindAct(server: McpServer, { bc, federal }: Sources) {
  server.registerTool(
    'find_act',
    {
      title: 'Find an act or regulation',
      description:
        'Find acts and regulations by title. Returns candidates with act_id (pass it to get_toc and get_section), the official title, citation (e.g. "RSBC 1996, c. 113" or "B.C. Reg. 396/95"; federal "R.S.C., 1985, c. L-2" or "C.R.C., c. 986"), source_url, and for BC acts whether they are current or repealed/replaced. Exact title matches come first. Federal titles come from the official list of acts and regulations, which does not mark repealed acts: get_toc and get_section say when an act is repealed.',
      inputSchema: {
        name: z
          .string()
          .min(1)
          .describe('Official English title or distinctive words from it, e.g. "Employment Standards Act" or "Canada Labour Code". Abbreviations such as "ESA" are not recognised.'),
        jurisdiction,
      },
      annotations: READ_ONLY,
    },
    async ({ name, jurisdiction: j }) => run(() => (j === 'federal' ? federal.findAct(name) : bc.findAct(name))),
  );
}
