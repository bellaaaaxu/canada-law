# Canada Law — BC and federal employment law for your AI assistant

[![CI](https://github.com/bellaaaaxu/canada-law/actions/workflows/ci.yml/badge.svg)](https://github.com/bellaaaaxu/canada-law/actions/workflows/ci.yml) [![Release](https://img.shields.io/github/v/release/bellaaaaxu/canada-law)](https://github.com/bellaaaaxu/canada-law/releases) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[中文说明](README.zh.md)

Ask your AI assistant about employment law in British Columbia and in federally regulated workplaces — overtime, breaks, statutory holidays, pay, leaves, termination — in English or Chinese. Answers come from the **current official text** on BC Laws and the Justice Laws Website, with the act, section number, a link to the section, and the official "current to" date.

It plugs into most AI coding assistants through two open standards, [Agent Skills](https://agentskills.io) and [MCP](https://modelcontextprotocol.io): Claude, OpenAI Codex / ChatGPT desktop, GitHub Copilot, Cursor, Gemini CLI, Google Antigravity, Kiro, Qwen Code, Kimi Code, and more.

> **Please read**
> - This is general legal information, **not legal advice**.
> - **BC law, and federal labour law.** Most BC workplaces are under BC law. Federally regulated workplaces (banks, airlines, telecommunications, interprovincial transport and similar) are under the *Canada Labour Code*, which is included with its regulations. Other federal law, such as Employment Insurance (EI) or the Canada Pension Plan (CPP), is not searched.
> - The statute text is **not an official version** (see [Licence](#licence)).
> - The AI may add things that are not in the official text (such as the dates of holidays). It is told to put them in a separate part marked as not checked, but it does not always manage. **Rely on the quoted sections and their links.**

## What an answer looks like

A real answer from our tests (Claude Code with this skill, 26 September 2026), word for word; only the headings are shown in bold here. More answers are in [docs/acceptance](docs/acceptance).

> **Q: How long can I work in BC before my employer has to give me a lunch break?**
>
> **What the law says**
>
> > **32 (1)** An employer must ensure
> > (a) that no employee works more than **5 consecutive hours** without a meal break, and
> > (b) that each meal break lasts at least a **1/2 hour**.
> >
> > **(2)** An employer who requires an employee to work or be available for work during a meal break must count the meal break as time worked by the employee.
>
> **What it means**
>
> Your employer must give you a meal break of at least 30 minutes before you've worked 5 consecutive hours. If your employer makes you work or stay available during that break, they have to pay you for it — it counts as time worked.
>
> **What decides the outcome**
>
> - Whether you have worked **5 consecutive hours** without a break.
> - Whether your employer requires you to **work or be available** during the meal break (which determines whether it's paid time).
> - Whether your workplace is **provincially regulated**. Federally regulated industries (banks, airlines, telecommunications, interprovincial transport, etc.) fall under federal law, not the BC *Employment Standards Act*.
>
> **Sources**
>
> - *Employment Standards Act*, RSBC 1996, c. 113, **s. 32** — [source](https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/96113_01#section32) (current to 2026-09-22)
>
> Text from BC Laws (www.bclaws.gov.bc.ca) under the King's Printer Licence; not an official version. This is general legal information, not legal advice.

(This answer is from version 0.1, before federal law was added. The answer format has not changed.)

## Install

You need [Node.js](https://nodejs.org) 20 or newer. Then run:

```bash
npx https://github.com/bellaaaaxu/canada-law/releases/download/v0.2.1/canada-law-0.2.1.tgz install
```

The installer finds the AI tools on your computer, **shows exactly what it will change, and asks before changing anything**. It backs up every config file it edits, and it never overwrites your own settings.

| Command | What it does |
|---|---|
| `… install` | install for every supported tool found on this computer |
| `… install cursor codex` | install for the tools you name (see `list`) |
| `… install --print` | only show what would change |
| `… install --yes` | apply without asking |
| `… status` | show what is installed |
| `… list` | show the supported tools |
| `… uninstall` | remove everything the installer added |

(`…` stands for `npx https://github.com/bellaaaaxu/canada-law/releases/download/v0.2.1/canada-law-0.2.1.tgz`.)

### Claude Desktop, without Node.js

Download `canada-law-0.2.1.mcpb` from the [release page](https://github.com/bellaaaaxu/canada-law/releases) and double-click it. You can also drag it into the Claude Desktop window, or use Settings → Extensions → Advanced settings → Install Extension…. Claude Desktop brings its own Node.js.

## Supported AI tools

| Tool | Skill folder | MCP server | Tested |
|---|---|---|---|
| Claude Code | `~/.claude/skills/` | `claude mcp add` | ✅ |
| Claude Desktop | (its Code tab reads Claude Code's skills) | config file, or the `.mcpb` above | — |
| OpenAI Codex (CLI, IDE extension, ChatGPT desktop app) | `~/.agents/skills/` | `~/.codex/config.toml` | — |
| VS Code / GitHub Copilot | `~/.agents/skills/` | run `code --add-mcp` yourself (the installer prints it) | — |
| Cursor | `~/.agents/skills/` | `~/.cursor/mcp.json` | — |
| Gemini CLI | `~/.agents/skills/` | `~/.gemini/settings.json` | — |
| GitHub Copilot CLI | `~/.agents/skills/` | `~/.copilot/mcp-config.json` | — |
| Google Antigravity | `~/.gemini/config/skills/`, `~/.gemini/antigravity-cli/skills/` | `~/.gemini/config/mcp_config.json` | — |
| Kiro | `~/.kiro/skills/` | `~/.kiro/settings/mcp.json` | — |
| Qwen Code | `~/.qwen/skills/` | `~/.qwen/settings.json` | — |
| OpenCode | `~/.agents/skills/` | `~/.config/opencode/opencode.json` | — |
| Kimi Code CLI | `~/.agents/skills/` | `~/.kimi-code/mcp.json` | — |
| Cline | `~/.cline/skills/` | add it with `cline mcp` | — |
| DeepSeek Harness | `~/.agents/skills/` | skill only (developer preview) | — |

✅ = checked on a real installation. The others follow each tool's official documentation; if you try one, please tell us how it went.

The Claude Desktop extension (`.mcpb`) was also checked on a real installation (Windows, Microsoft Store build, September 2026): it installs, starts with Claude Desktop's own Node.js, and its tools work in chats and in Claude Code sessions. The installer's config-file route for Claude Desktop has not been checked in the real app.

**Not supported:** chat apps that run only in a browser (for example ChatGPT on the web), because they cannot run programs on your computer. Trae is not officially available in Canada. Free Gemini CLI users were moved to Google Antigravity in June 2026.

## Install by hand

- **Skill:** copy the folder `skills/canada-employment-law` into your tool's skill folder (table above).
- **MCP server:** save `mcp/canada-law-mcp.mjs` somewhere permanent and add a local (stdio) server named `canada-law` that runs `node /full/path/to/canada-law-mcp.mjs`. For most tools that is:

```json
{ "mcpServers": { "canada-law": { "command": "node", "args": ["/full/path/to/canada-law-mcp.mjs"] } } }
```

- **Claude Desktop from the Microsoft Store (Windows):** if the folder `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc` exists, Claude Desktop reads `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json` and ignores the file under `%APPDATA%\Claude`. Edit that one (the installer does this for you), then quit and restart Claude Desktop.

## How it works

- **Five tools:** `find_act`, `get_toc`, `get_section`, `search_law` and `map_term`. The skill runs the same functions as the commands `find`, `toc`, `section`, `search` and `term`.
- **Glossary:** 58 everyday words, in Chinese and in plain English (such as 加班费, "stat holiday", "severance"), mapped to the words each statute actually uses: BC law says "statutory holiday" where federal law says "general holiday". Each of its 104 entries is checked against the official text.
- **What is searched:** all of BC's statutes and regulations; for federal law, the *Canada Labour Code* and the regulations made under it (32 on the official list in September 2026, four of them wholly repealed or revoked). Any other federal act or regulation can still be read section by section.
- **Citations:** every result carries the act, the section, a link to the section, and the official "current to" date, read from the official page.
- **Privacy:** everything runs on your computer. Your questions go only to the AI assistant you already use. This package only asks BC Laws (www.bclaws.gov.bc.ca) and the Justice Laws Website (laws-lois.justice.gc.ca) for statute text, and collects nothing.

## A real problem at work?

- **BC workplaces:** the **Employment Standards Branch** can help, in the language of your choice: <https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/contact-us>
- **Federally regulated workplaces:** the federal **Labour Program** takes complaints: <https://www.canada.ca/en/services/jobs/workplace/federal-labour-standards/filing-complaint.html>

## Feedback

Found a wrong or incomplete answer? Please [open an issue](https://github.com/bellaaaaxu/canada-law/issues/new/choose) with your question, the AI tool and the answer (remove personal details first). The project is provided as is: issues and pull requests are welcome, but replies are not guaranteed.

## Licence

The code is MIT-licensed (see [LICENSE](LICENSE)). The statute text comes from BC Laws under the King's Printer Licence – British Columbia, which requires this statement:

> These materials contain information that has been derived from information originally made available by the Province of British Columbia at: http://www.bclaws.gov.bc.ca and this information is being used in accordance with the King's Printer Licence – British Columbia available at: https://www.bclaws.gov.bc.ca/standards/Licence.html. They have not, however, been produced in affiliation with, or with the endorsement of, the Province of British Columbia and THESE MATERIALS ARE NOT AN OFFICIAL VERSION.

Federal statute text comes from the Justice Laws Website. The Reproduction of Federal Law Order (SI/97-5) lets anyone reproduce federal law without charge or permission, provided the reproduction is accurate and is not represented as an official version:

> These materials reproduce the consolidated Acts and regulations of Canada from the Justice Laws Website (https://laws-lois.justice.gc.ca), as permitted by the Reproduction of Federal Law Order (SI/97-5). They have not been produced in affiliation with, or with the endorsement of, the Government of Canada, and THESE MATERIALS ARE NOT AN OFFICIAL VERSION.

This project is not affiliated with or endorsed by the Province of British Columbia or the Government of Canada.

## Development

```bash
npm install
npm test                 # unit tests (offline)
npm run bundle           # build the skill, the MCP server, the installer and the .mcpb
npm run smoke            # run the built files from an empty folder
npm run smoke:install    # installer end to end, in an isolated fake home folder
npm run golden           # golden questions, through the skill and through MCP (online)
npm run verify-glossary  # check every glossary entry against the official text (online)
```

The design notes are in Chinese: [SPEC.md](SPEC.md) (tools, citations, how BC Laws and the Justice Laws Website behave) and [SPEC-开源分发.md](SPEC-开源分发.md) (packaging and installer).

**Not covered yet:** federal benefits law, such as Employment Insurance (EI) and the Canada Pension Plan (CPP).
