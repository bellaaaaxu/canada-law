// The skill's command-line script (bundled as skills/canada-employment-law/scripts/bclaw.mjs).
// Same results as the MCP tools, printed as ASCII-only JSON.
import { asciiJson } from './ascii-json.js';
import { lookupTerm, type Glossary } from './glossary.js';
import { ToolError, type BcClient } from './sources/bc.js';

export const USAGE = `Usage: node bclaw.mjs <command> [arguments]

  term <words>                    statutory English for a Chinese or everyday-English term, and where it appears
  search <phrase> [<phrase> ...]  sections matching any of the phrases (each phrase is quoted; joined with OR)
  section <act_id> <section>      verbatim text of one section, with its citation
  toc <act_id>                    parts, and every section number and heading
  find <act name>                 acts and regulations by title, with their act_id

Output is JSON; non-ASCII characters are \\u-escaped. BC law only (federal law is not covered yet).`;

export type CliDeps = { bc: BcClient; glossary: Glossary };
export type CliResult = { code: number; stdout: string; stderr: string };

const ok = (value: unknown): CliResult => ({ code: 0, stdout: asciiJson(value), stderr: '' });
const usage = (): CliResult => ({ code: 2, stdout: '', stderr: USAGE });

export async function runCli(argv: string[], { bc, glossary }: CliDeps): Promise<CliResult> {
  const [cmd, ...args] = argv;
  try {
    switch (cmd) {
      case 'help':
      case '--help':
      case '-h':
        return { code: 0, stdout: USAGE, stderr: '' };
      case 'term':
        return args.length > 0 ? ok(lookupTerm(glossary, args.join(' '))) : usage();
      case 'search':
        return args.length > 0 ? ok(await bc.search(args.map((p) => `"${p.replace(/"/g, '')}"`).join(' OR '), 10)) : usage();
      case 'section':
        return args.length === 2 ? ok(await bc.getSection(args[0], args[1])) : usage();
      case 'toc':
        return args.length === 1 ? ok(await bc.getToc(args[0])) : usage();
      case 'find':
        return args.length > 0 ? ok(await bc.findAct(args.join(' '))) : usage();
      default:
        return usage();
    }
  } catch (e) {
    const message = e instanceof ToolError ? e.message : `Unexpected error while reading BC Laws: ${e instanceof Error ? e.message : String(e)}`;
    return { code: 1, stdout: '', stderr: message };
  }
}
