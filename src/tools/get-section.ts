import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { READ_ONLY, jurisdiction, run, withAnswerRules, type Sources } from './shared.js';

export function registerGetSection(server: McpServer, { bc, federal }: Sources) {
  server.registerTool(
    'get_section',
    {
      title: 'Get a section',
      description:
        'Verbatim text of one section, laid out as on the official page (subsections, paragraphs, definitions), with the full citation: act_title, act_citation, act_id, section, heading, source_url (links to the section), current_to (the official "current to" date) and retrieved_at. Quote this text rather than paraphrasing it as the law. The result also carries answer_rules, the answer format and rules for using this text: follow them when you answer.',
      inputSchema: {
        jurisdiction,
        act_id: z.string().min(1).describe('The act_id returned by find_act, e.g. "96113_01" (BC Employment Standards Act) or "L-2" (Canada Labour Code).'),
        section: z.string().min(1).describe('Section number as printed in the act, e.g. "40", "52.13", "169.1", "128-129".'),
      },
      annotations: READ_ONLY,
    },
    async ({ jurisdiction: j, act_id, section }) =>
      run(async () => withAnswerRules(await (j === 'federal' ? federal.getSection(act_id, section) : bc.getSection(act_id, section)))),
  );
}
