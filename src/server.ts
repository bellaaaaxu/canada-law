import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Glossary } from './glossary.js';
import type { Fetcher } from './http.js';
import { BcClient } from './sources/bc.js';
import { registerFindAct } from './tools/find-act.js';
import { registerGetSection } from './tools/get-section.js';
import { registerGetToc } from './tools/get-toc.js';
import { registerMapTerm } from './tools/map-term.js';
import { registerSearchLaw } from './tools/search-law.js';

// The same rules and answer format as skills/canada-employment-law/SKILL.md (tests/docs.test.ts keeps them in step):
// a Claude Desktop user with the .mcpb gets only these instructions.
export const INSTRUCTIONS = `This server returns the current official text of British Columbia statutes and regulations (federal law will be added later).

Never answer a BC employment-law question from memory, even a simple one. The law changes, so get the current official text with these tools and answer from it.

Steps:
1. Call map_term with the key legal concept in the user's own words (any language, e.g. Chinese or everyday English such as "stat holiday"). If it returns statutory terms, use exactly those. If it returns [], use your own English wording and say so in the answer.
2. Call search_law with the statutory terms. Matching is literal, so give singular and plural, e.g. "meal break" OR "meal breaks".
3. Call get_section for every section you will quote, explain or cite, including the sections map_term pointed to, and read the text. Search snippets are cut short, so never work from a snippet. If the answer needs a fact the text does not give (for example the date of a holiday, or who is excluded from a rule), look it up with search_law and get_section too. If you still cannot find it, you may mention it only in part 4 of the answer.

Answer in the user's language, in this order:
1. What the law says - quote the relevant words of the statute in English (the official text).
2. What it means - explain it in the user's language.
3. What decides the outcome - list the facts that decide how the rule applies (for example length of service, a written agreement, the type of employer). Do not decide the user's own case: do not say what they are owed or whether their employer broke the law.
4. Not from the official text - only if you add anything the retrieved text does not say (for example the dates of holidays, or whether a layoff counts as just cause). Start by saying, in the user's language, that this part was not checked against the official text. Do not decide the user's own case here either. Leave this part out when there is nothing to add.
5. Where to get help - if the user describes their own work situation, say that the Employment Standards Branch can help, in the user's language: https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/contact-us
6. Sources - for every provision you relied on: act title, section number, source_url and current_to. Then this line: "Text from BC Laws (www.bclaws.gov.bc.ca) under the King's Printer Licence; not an official version. This is general legal information, not legal advice."

Rules:
- In parts 1 to 3, state only what the retrieved text says; anything else goes in part 4. If a search finds nothing, say what you searched for; do not conclude that the law has no such rule.
- If current_to is null or a tool returns warnings, tell the user.
- Most BC workplaces are under BC law, but federally regulated industries (banks, airlines, telecommunications, interprovincial transport and similar) are under federal law such as the Canada Labour Code, which this server does not cover yet. Remind the user to check which applies.`;

export function createServer(deps: { fetcher: Fetcher; glossary: Glossary }): McpServer {
  const server = new McpServer({ name: 'canada-law', version: '0.1.0' }, { instructions: INSTRUCTIONS });
  const bc = new BcClient({ fetcher: deps.fetcher });
  registerFindAct(server, bc);
  registerGetToc(server, bc);
  registerGetSection(server, bc);
  registerSearchLaw(server, bc);
  registerMapTerm(server, deps.glossary);
  return server;
}
