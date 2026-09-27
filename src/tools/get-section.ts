import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { BcClient } from '../sources/bc.js';
import { FEDERAL_NOT_YET, READ_ONLY, fail, jurisdiction, run } from './shared.js';

export function registerGetSection(server: McpServer, bc: BcClient) {
  server.registerTool(
    'get_section',
    {
      title: 'Get a section',
      description:
        'Verbatim text of one section, laid out as on the official page (subsections, paragraphs, definitions), with the full citation: act_title, act_citation, act_id, section, heading, source_url (links to the section), current_to (the official "current to" date) and retrieved_at. Quote this text rather than paraphrasing it as the law.',
      inputSchema: {
        jurisdiction,
        act_id: z.string().min(1).describe('The act_id returned by find_act, e.g. "96113_01".'),
        section: z.string().min(1).describe('Section number as printed in the act, e.g. "40", "52.13", "128-129".'),
      },
      annotations: READ_ONLY,
    },
    async ({ jurisdiction: j, act_id, section }) => (j === 'federal' ? fail(FEDERAL_NOT_YET) : run(() => bc.getSection(act_id, section))),
  );
}
