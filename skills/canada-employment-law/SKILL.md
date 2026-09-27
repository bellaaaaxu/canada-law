---
name: canada-employment-law
description: BC (Canada) and federal employment law from the current official text - overtime, breaks, holidays, pay, leaves, termination. Use for any BC or federal work question; never answer from memory.
license: MIT
compatibility: Requires Node.js 20+ and internet access to www.bclaws.gov.bc.ca and laws-lois.justice.gc.ca
---

# Canada employment law (BC and federal) from the official text

Never answer a BC or federal employment-law question from memory, even a simple one. The law changes, so get the current official text with [scripts/bclaw.mjs](scripts/bclaw.mjs) and answer from it.

## Which law applies

- Most workplaces in BC are under BC law: the Employment Standards Act (act_id `96113_01`) and its regulations.
- Federally regulated workplaces are under the Canada Labour Code (act_id `L-2`) and its regulations, such as the Canada Labour Standards Regulations (act_id `C.R.C.,_c._986`). To tell whether a particular business is federally regulated, read the definition of "federal work, undertaking or business" in section 2 of the Code (`section L-2 2`) rather than relying on memory.
- If you cannot tell which law applies, search both (`search all ...`) and say so.
- Federal search covers the Canada Labour Code and its regulations only. Federal benefits law, such as Employment Insurance (EI) and the Canada Pension Plan (CPP), is not covered: say so instead of answering from memory.

## Script

Run it with Node.js 20+ from this skill's folder. It prints JSON; non-ASCII characters are \u-escaped.

| Command | Returns |
|---|---|
| `node scripts/bclaw.mjs term <words>` | The statutory English for the user's own words (any language, e.g. Chinese or everyday English such as "stat holiday"), for BC and for federal law, and where it appears (act_id, sections). `[]` means the words are not in the glossary. |
| `node scripts/bclaw.mjs search <jurisdiction> <phrase> [<phrase> ...]` | Matching sections, best first, with citation fields and a snippet. `<jurisdiction>` is `bc`, `federal` or `all`. Each phrase is one argument; they are combined with OR. |
| `node scripts/bclaw.mjs section <act_id> <section>` | The verbatim text of one section, with its citation and a licence `notice`. The act_id tells BC from federal. |
| `node scripts/bclaw.mjs toc <act_id>` | Parts, and every section number and heading. |
| `node scripts/bclaw.mjs find <jurisdiction> <act name>` | Acts and regulations by title, with their act_id. `<jurisdiction>` is `bc` or `federal`. |

## Steps

1. Take the key legal concept from the question and run `term` with it, in the user's own words. It gives the statutory terms of each jurisdiction: use exactly those of the jurisdiction you search. If it returns `[]`, use your own English wording and say so in the answer.
2. Decide which law applies (see above).
3. Run `search` with the jurisdiction and its statutory terms. Matching is literal, so pass singular and plural as separate phrases, e.g. `search bc "statutory holiday" "statutory holidays"` or `search federal "general holiday" "general holidays"`. For `all`, give the terms of both jurisdictions, e.g. `search all "statutory holiday" "general holiday"`, or search `bc` and `federal` separately.
4. Run `section` for every section you will quote, explain or cite, including the sections `term` pointed to. Search snippets are cut short, so never work from a snippet. Read the text. If the answer needs a fact the text does not give (for example the date of a holiday, or who is excluded from a rule), look it up with `search` and `section` too. If you still cannot find it, you may mention it only in part 4 of the answer.
5. Answer in the format below.

## Answer format

Answer in the user's language, in this order:

1. **What the law says** - quote the relevant words of the statute in English (the official text).
2. **What it means** - explain it in the user's language.
3. **What decides the outcome** - list the facts that decide how the rule applies (for example length of service, a written agreement, the type of employer). Do not decide the user's own case: do not say what they are owed or whether their employer broke the law.
4. **Not from the official text** - only if you add anything the retrieved text does not say (for example the dates of holidays, or whether a layoff counts as just cause). Start by saying, in the user's language, that this part was not checked against the official text. Do not decide the user's own case here either. Leave this part out when there is nothing to add.
5. **Where to get help** - if the user describes their own situation, say in the user's language who can help. BC workplaces: the Employment Standards Branch, https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/contact-us . Federally regulated workplaces: the federal Labour Program, https://www.canada.ca/en/services/jobs/workplace/federal-labour-standards/filing-complaint.html
6. **Sources** - for every provision you relied on: act title, section number, source_url and current_to. Then one line for each source you used: "Text from BC Laws (www.bclaws.gov.bc.ca) under the King's Printer Licence; not an official version." / "Text from the Justice Laws Website (laws-lois.justice.gc.ca); not an official version." Then: "This is general legal information, not legal advice."

## Rules

- In parts 1 to 3, state only what the retrieved text says; anything else goes in part 4. If a search finds nothing, say what you searched for; do not conclude that the law has no such rule.
- If current_to is null or the output has warnings, tell the user.
- Say which law you answered from. Most BC workplaces are under BC law, but federally regulated industries (banks, airlines, telecommunications, interprovincial transport and similar) are under federal law. Remind the user to check which applies.
