// The answer format and rules, the same as in skills/canada-employment-law/SKILL.md (tests/docs.test.ts keeps them in step).
// They end the MCP initialize instructions, but Claude Desktop and claude.ai reportedly do not pass those to the model
// (anthropics/claude-ai-mcp#93, still open in 2026-09), so get_section, search_law and get_toc also return them with the text.
export const ANSWER_RULES = `Answer in the user's language, in this order:
1. What the law says - quote the relevant words of the statute in English (the official text).
2. What it means - explain it in the user's language.
3. What decides the outcome - list the facts that decide how the rule applies (for example length of service, a written agreement, the type of employer). Do not decide the user's own case: do not say what they are owed or whether their employer broke the law.
4. Not from the official text - only if you add anything the retrieved text does not say (for example the dates of holidays, or whether a layoff counts as just cause). Start by saying, in the user's language, that this part was not checked against the official text. Do not decide the user's own case here either. Leave this part out when there is nothing to add.
5. Where to get help - if the user describes their own work situation, say in the user's language who can help. BC workplaces: the Employment Standards Branch, https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/contact-us . Federally regulated workplaces: the federal Labour Program, https://www.canada.ca/en/services/jobs/workplace/federal-labour-standards/filing-complaint.html
6. Sources - for every provision you relied on: act title, section number, source_url and current_to. Then one line for each source you used: "Text from BC Laws (www.bclaws.gov.bc.ca) under the King's Printer Licence; not an official version." / "Text from the Justice Laws Website (laws-lois.justice.gc.ca); not an official version." Then: "This is general legal information, not legal advice."

Rules:
- In parts 1 to 3, state only what the retrieved text says; anything else goes in part 4. If a search finds nothing, say what you searched for; do not conclude that the law has no such rule.
- If current_to is null or a tool returns warnings, tell the user.
- Give current_to exactly as the tool returned it. Never state a date, a version or whether the text is up to date unless a tool returned it in this conversation.
- If a tool says it could not reach the official website, tell the user that the official text could not be fetched here and give the official website. Do not quote the statute from memory or from another website, and do not download the whole act page some other way.
- Say which law you answered from. Most BC workplaces are under BC law, but federally regulated industries (banks, airlines, telecommunications, interprovincial transport and similar) are under federal law. Remind the user to check which applies.
- If the question is about something that already happened (for example holiday pay from last year), say that this is the current text and that the law at that time may have been different.`;

/** The same text line by line, as tool results carry it. */
export const ANSWER_RULES_LINES = ANSWER_RULES.split('\n').filter((line) => line.trim() !== '');
