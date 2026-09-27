import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { READ_ONLY, jurisdiction, run, withAnswerRules, type Sources } from './shared.js';

export function registerGetToc(server: McpServer, { bc, federal }: Sources) {
  server.registerTool(
    'get_toc',
    {
      title: 'Table of contents',
      description:
        "Table of contents of an act or regulation: Parts, Divisions and Schedules with every section number and heading, plus the act's citation, source_url and official current_to date. Use it to pick the right section number before calling get_section.",
      inputSchema: {
        jurisdiction,
        act_id: z.string().min(1).describe('The act_id returned by find_act, e.g. "96113_01" (BC Employment Standards Act) or "L-2" (Canada Labour Code).'),
      },
      annotations: READ_ONLY,
    },
    async ({ jurisdiction: j, act_id }) => run(async () => withAnswerRules(await (j === 'federal' ? federal.getToc(act_id) : bc.getToc(act_id)))),
  );
}
