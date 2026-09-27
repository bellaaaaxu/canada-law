import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ANSWER_RULES } from './answer-rules.js';
import type { Glossary } from './glossary.js';
import type { Fetcher } from './http.js';
import { BcClient } from './sources/bc.js';
import { FederalClient } from './sources/federal.js';
import { registerFindAct } from './tools/find-act.js';
import { registerGetSection } from './tools/get-section.js';
import { registerGetToc } from './tools/get-toc.js';
import { registerMapTerm } from './tools/map-term.js';
import { registerSearchLaw } from './tools/search-law.js';
import { VERSION } from './version.js';

// The same rules and answer format as skills/canada-employment-law/SKILL.md (tests/docs.test.ts keeps them in step).
// Claude Code passes these to the model; Claude Desktop and claude.ai reportedly do not (anthropics/claude-ai-mcp#93), so the
// answer format and rules (src/answer-rules.ts) also come back with the text from get_section, search_law and get_toc.
export const INSTRUCTIONS = `This server returns the current official text of British Columbia and federal (Canada) statutes and regulations.

Never answer a BC or federal employment-law question from memory, even a simple one. The law changes, so get the current official text with these tools and answer from it.

Which law applies:
- Most workplaces in BC are under BC law: the Employment Standards Act (jurisdiction "bc", act_id 96113_01) and its regulations.
- Federally regulated workplaces are under the Canada Labour Code (jurisdiction "federal", act_id L-2) and its regulations, such as the Canada Labour Standards Regulations (act_id C.R.C.,_c._986). To tell whether a particular business is federally regulated, read the definition of "federal work, undertaking or business" in section 2 of the Code (get_section, federal, L-2, 2) rather than relying on memory.
- If you cannot tell which law applies, search both (jurisdiction "all") and say so.
- Federal search covers the Canada Labour Code and its regulations only. Federal benefits law, such as Employment Insurance (EI) and the Canada Pension Plan (CPP), is not covered: say so instead of answering from memory.

Steps:
1. Call map_term with the key legal concept in the user's own words (any language, e.g. Chinese or everyday English such as "stat holiday"). It returns the statutory terms of each jurisdiction: use exactly those of the jurisdiction you search. If it returns [], use your own English wording and say so in the answer.
2. Decide which law applies (see above).
3. Call search_law with the jurisdiction and its statutory terms. Matching is literal, so give singular and plural, e.g. "meal break" OR "meal breaks". For "all", give the terms of both jurisdictions, e.g. "statutory holiday" OR "general holiday", or search "bc" and "federal" separately.
4. Call get_section for every section you will quote, explain or cite, including the sections map_term pointed to, and read the text. Search snippets are cut short, so never work from a snippet. If the answer needs a fact the text does not give (for example the date of a holiday, or who is excluded from a rule), look it up with search_law and get_section too. If you still cannot find it, you may mention it only in part 4 of the answer.

${ANSWER_RULES}`;

export function createServer(deps: { fetcher: Fetcher; glossary: Glossary }): McpServer {
  const server = new McpServer({ name: 'canada-law', version: VERSION }, { instructions: INSTRUCTIONS });
  const sources = { bc: new BcClient({ fetcher: deps.fetcher }), federal: new FederalClient({ fetcher: deps.fetcher }) };
  registerFindAct(server, sources);
  registerGetToc(server, sources);
  registerGetSection(server, sources);
  registerSearchLaw(server, sources);
  registerMapTerm(server, deps.glossary);
  return server;
}
