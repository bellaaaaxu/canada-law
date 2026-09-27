# Canada Law — BC employment law for your AI assistant

[中文说明](README.zh.md)

Ask your AI assistant about employment law in British Columbia — overtime, breaks, statutory holidays, pay, leaves, termination — in English or Chinese. Answers come from the **current official text** on BC Laws, with the act, section number, a link to the section, and the official "current to" date.

It plugs into most AI coding assistants through two open standards, [Agent Skills](https://agentskills.io) and [MCP](https://modelcontextprotocol.io): Claude, OpenAI Codex / ChatGPT desktop, GitHub Copilot, Cursor, Gemini CLI, Google Antigravity, Kiro, Qwen Code, Kimi Code, and more.

> **Please read**
> - This is general legal information, **not legal advice**.
> - **BC law only for now.** Federally regulated workplaces (banks, airlines, telecommunications, interprovincial transport and similar) are covered by federal law, which is not included yet.
> - The statute text is **not an official version** (see [Licence](#licence)).
> - The AI may add things that are not in the official text (such as the dates of holidays). It is told to put them in a separate part marked as not checked, but it does not always manage. **Rely on the quoted sections and their links.**

## Install

You need [Node.js](https://nodejs.org) 20 or newer. Then run:

```bash
npx https://github.com/bellaaaaxu/canada-law/releases/download/v0.1.0/canada-law-0.1.0.tgz install
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

(`…` stands for `npx https://github.com/bellaaaaxu/canada-law/releases/download/v0.1.0/canada-law-0.1.0.tgz`.)

### Claude Desktop, without Node.js

Download `canada-law-0.1.0.mcpb` from the [release page](https://github.com/bellaaaaxu/canada-law/releases) and double-click it. You can also drag it into the Claude Desktop window, or use Settings → Extensions → Advanced settings → Install Extension…. Claude Desktop brings its own Node.js.

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
- **Glossary:** 52 everyday words, in Chinese and in plain English (such as 加班费, "stat holiday", "severance"), mapped to the words the statute actually uses. Each entry is checked against the official text.
- **Citations:** every result carries the act, the section, a link to the section, and the official "current to" date, read from the official page. Acts and regulations are updated on different dates.
- **Privacy:** everything runs on your computer. Your questions go only to the AI assistant you already use. This package only asks BC Laws (www.bclaws.gov.bc.ca) for statute text, and collects nothing.

## A real problem at work?

The **Employment Standards Branch** can help, in the language of your choice: <https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/contact-us>

## Licence

The code is MIT-licensed (see [LICENSE](LICENSE)). The statute text comes from BC Laws under the King's Printer Licence – British Columbia, which requires this statement:

> These materials contain information that has been derived from information originally made available by the Province of British Columbia at: http://www.bclaws.gov.bc.ca and this information is being used in accordance with the King's Printer Licence – British Columbia available at: https://www.bclaws.gov.bc.ca/standards/Licence.html. They have not, however, been produced in affiliation with, or with the endorsement of, the Province of British Columbia and THESE MATERIALS ARE NOT AN OFFICIAL VERSION.

This project is not affiliated with or endorsed by the Province of British Columbia.

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

The design notes are in Chinese: [SPEC.md](SPEC.md) (tools, citations, how BC Laws behaves) and [SPEC-开源分发.md](SPEC-开源分发.md) (packaging and installer).

**Roadmap:** federal law (Canada Labour Code) is next.
