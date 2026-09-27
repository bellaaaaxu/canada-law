// The skill's command-line script (bundled as skills/canada-employment-law/scripts/bclaw.mjs).
// Same results as the MCP tools, printed as ASCII-only JSON.
import { asciiJson } from './ascii-json.js';
import { lookupTerm, type Glossary } from './glossary.js';
import type { BcClient } from './sources/bc.js';
import type { FederalClient } from './sources/federal.js';
import { isFederalId } from './sources/federal-meta.js';
import { searchAll } from './sources/search-all.js';
import { ToolError } from './tool-error.js';

export const USAGE = `Usage: node bclaw.mjs <command> [arguments]

  term <words>                               statutory English (BC and federal) for a Chinese or everyday-English term, and where it appears
  search <bc|federal|all> <phrase> [...]     sections matching any of the phrases (each phrase is quoted; joined with OR)
  section <act_id> <section>                 verbatim text of one section, with its citation
  toc <act_id>                               parts, and every section number and heading
  find <bc|federal> <act name>               acts and regulations by title, with their act_id

BC act_ids look like 96113_01; federal ones like L-2 or C.R.C.,_c._986, so section and toc need no jurisdiction.
Federal search covers the Canada Labour Code and its regulations. Output is JSON; non-ASCII characters are \\u-escaped.`;

export type CliDeps = { bc: BcClient; federal: FederalClient; glossary: Glossary };
export type CliResult = { code: number; stdout: string; stderr: string };

const ok = (value: unknown): CliResult => ({ code: 0, stdout: asciiJson(value), stderr: '' });
const usage = (): CliResult => ({ code: 2, stdout: '', stderr: USAGE });
const quoted = (phrases: string[]) => phrases.map((p) => `"${p.replace(/"/g, '')}"`).join(' OR ');

export async function runCli(argv: string[], { bc, federal, glossary }: CliDeps): Promise<CliResult> {
  const [cmd, ...args] = argv;
  const [where, ...rest] = args;
  try {
    switch (cmd) {
      case 'help':
      case '--help':
      case '-h':
        return { code: 0, stdout: USAGE, stderr: '' };
      case 'term':
        return args.length > 0 ? ok(lookupTerm(glossary, args.join(' '))) : usage();
      case 'search':
        if (rest.length === 0) return usage();
        if (where === 'bc') return ok(await bc.search(quoted(rest), 10));
        if (where === 'federal') return ok(await federal.search(quoted(rest), 10));
        if (where === 'all') return ok(await searchAll({ bc, federal }, quoted(rest), 10));
        return usage();
      case 'section':
        if (args.length !== 2) return usage();
        return ok(await (isFederalId(args[0]) ? federal.getSection(args[0], args[1]) : bc.getSection(args[0], args[1])));
      case 'toc':
        if (args.length !== 1) return usage();
        return ok(await (isFederalId(args[0]) ? federal.getToc(args[0]) : bc.getToc(args[0])));
      case 'find':
        if (rest.length === 0) return usage();
        if (where === 'bc') return ok(await bc.findAct(rest.join(' ')));
        if (where === 'federal') return ok(await federal.findAct(rest.join(' ')));
        return usage();
      default:
        return usage();
    }
  } catch (e) {
    const message = e instanceof ToolError ? e.message : `Unexpected error while reading the official source: ${e instanceof Error ? e.message : String(e)}`;
    return { code: 1, stdout: '', stderr: message };
  }
}
