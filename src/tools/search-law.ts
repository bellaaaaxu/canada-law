import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BC_LAWS_NOTICE, FEDERAL_NOTICE } from '../notice.js';
import { ToolError } from '../tool-error.js';
import { READ_ONLY, run, type Sources } from './shared.js';

type Scored = Awaited<ReturnType<Sources['federal']['searchScored']>>;
const EMPTY: Scored = { output: { query: '', documents_searched: 0, results: [], warnings: [], notes: [], notice: '' }, scored: [] };

export function registerSearchLaw(server: McpServer, { bc, federal }: Sources) {
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
        jurisdiction: z
          .enum(['bc', 'federal', 'all'])
          .describe('"bc" (all BC statutes and regulations), "federal" (the Canada Labour Code and the regulations made under it) or "all" (both, ranked together).'),
        limit: z.number().int().min(1).max(20).default(10).describe('Maximum number of sections to return (default 10).'),
      },
      annotations: READ_ONLY,
    },
    async ({ query, jurisdiction, limit }) =>
      run(async () => {
        if (jurisdiction === 'bc') return bc.search(query, limit);
        if (jurisdiction === 'federal') return federal.search(query, limit);
        // One side failing (BC Laws or Justice Laws down) still returns the other side, with a warning.
        const [bs, fs] = await Promise.allSettled([bc.searchScored(query, limit), federal.searchScored(query, limit)]);
        const failed = [bs, fs].filter((s): s is PromiseRejectedResult => s.status === 'rejected');
        if (failed.length === 2) throw failed[0].reason;
        for (const f of failed) if (!(f.reason instanceof ToolError)) throw f.reason;
        const b = bs.status === 'fulfilled' ? bs.value : EMPTY;
        const f = fs.status === 'fulfilled' ? fs.value : EMPTY;
        const lost = [
          ...(bs.status === 'rejected' ? [`BC search failed, so only federal results are shown: ${(bs.reason as Error).message}`] : []),
          ...(fs.status === 'rejected' ? [`Federal search failed, so only BC results are shown: ${(fs.reason as Error).message}`] : []),
        ];
        const results = [...b.scored, ...f.scored] // BC first among equal scores
          .map((s, order) => ({ ...s, order }))
          .sort((x, y) => y.score - x.score || x.order - y.order)
          .slice(0, limit)
          .map((s) => s.result);
        return {
          query,
          documents_searched: b.output.documents_searched + f.output.documents_searched,
          results,
          warnings: [...lost, ...b.output.warnings, ...f.output.warnings],
          notes: ['BC and federal results, ranked together by the same scoring.', ...new Set([...b.output.notes, ...f.output.notes])],
          notice: `${BC_LAWS_NOTICE}\n\n${FEDERAL_NOTICE}`,
        };
      }),
  );
}
