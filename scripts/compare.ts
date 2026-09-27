// Comparison test (npm run compare): how much does this server add over an AI that can search the web, and when
// answers go wrong, is it because the model did not look, or because it looked and still got it wrong?
// Plan, questions and answer keys: docs/plans/2026-09-27-对照测试.md (the questions are read from there).
// Four groups, same model, same questions, one answer each:
//   A  no tools at all (memory only)
//   B  web search and web fetch
//   C  web search and web fetch + this MCP server without its initialize instructions (as in Claude Desktop)
//   D  as C, with the official text fetched by this server before asking (glossary words → search → full text)
// It spends the tester's own Claude usage, so it is not part of npm test.
//
//   npm run compare -- --dry-run                  print the commands and what D would be given; ask nothing
//   npm run compare -- --only 9 --arms A,C        a subset
//   npm run compare -- --model <model> --jobs 3
//
// Everything goes to .local/compare-runs/<time>/ (not published): raw transcripts in runs/, the answers without
// their group in blind/ (grade these first), and mapping.json to reveal the groups afterwards.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { loadGlossary, termsInText } from '../src/glossary.js';
import { findOnPath } from '../src/install/env.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const PLAN = join(root, 'docs', 'plans', '2026-09-27-对照测试.md');
const SERVER = join(root, 'mcp', 'canada-law-mcp.mjs');
const PROXY = join(root, 'scripts', 'strip-instructions.mjs');
// The name Claude Desktop gives the server (mcpb/manifest.json display_name), and the tool names Claude Code derives from it
const SERVER_NAME = 'Canada Law (BC and federal employment law)';
const MCP_TOOLS = ['find_act', 'get_toc', 'get_section', 'search_law', 'map_term'].map((t) => `mcp__${SERVER_NAME.replace(/[^\w-]/g, '_')}__${t}`);
const ARMS = ['A', 'B', 'C', 'D'] as const;
type Arm = (typeof ARMS)[number];
const MAX_TOTAL_USD = 25;

type Question = { n: number; title: string; q: string };

/** The questions of the plan: each "### N. title" heading and the first "> " line under it. */
export function readQuestions(md: string): Question[] {
  const lines = md.split('\n');
  const out: Question[] = [];
  lines.forEach((line, i) => {
    const h = /^### (\d+)\. (.+)$/.exec(line.trim());
    if (!h) return;
    for (let j = i + 1; j < lines.length && !lines[j].startsWith('#'); j++) {
      if (lines[j].startsWith('> ')) {
        out.push({ n: Number(h[1]), title: h[2].trim(), q: lines[j].slice(2).trim() });
        return;
      }
    }
  });
  return out;
}

const args = process.argv.slice(2);
const opt = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const KNOWN = new Set(['--dry-run', '--only', '--arms', '--model', '--jobs']);
const unknown = args.filter((a) => a.startsWith('--') && !KNOWN.has(a));
if (unknown.length) {
  console.error(`Unknown option: ${unknown.join(' ')}`);
  process.exit(2);
}
const today = new Date().toISOString().slice(0, 10);
const model = opt('--model');
// One at a time by default: every `claude` process reads and rewrites ~/.claude.json, and two at once collided
// (2026-09-27 smoke run: "configuration file ... is corrupted", a read in the middle of another process's write;
// Claude Code kept a backup and nothing was lost, but the tester's own config is not the place to race).
const jobs = Number(opt('--jobs') ?? 1);
const questions = readQuestions(readFileSync(PLAN, 'utf8')).filter((x) => !opt('--only') || opt('--only')!.split(',').includes(String(x.n)));
const arms = (opt('--arms')?.split(',') ?? [...ARMS]) as Arm[];
if (questions.length === 0 || arms.some((a) => !ARMS.includes(a))) {
  console.error('Nothing to run: check --only (question numbers) and --arms (A,B,C,D).');
  process.exit(2);
}

// The same short system prompt for every group, instead of Claude Code's own (which is about writing software).
// The second sentence is neutral about which tool: without it, group B answered from memory without searching
// (smoke run 2026-09-27), which would have made B a second memory-only group.
const SYSTEM = `You are Claude, an AI assistant made by Anthropic. Today's date is ${today}. Use the tools you have when they would make your answer more accurate or more up to date.`;

function claudeArgs(arm: Arm, prompt: string, mcpConfig: string): string[] {
  const web = arm !== 'A';
  const mcp = arm === 'C' || arm === 'D';
  return [
    '-p',
    prompt, // before the lists below, which would take it as one more item
    '--system-prompt',
    SYSTEM,
    '--setting-sources',
    'project', // none of the tester's own settings, skills or plugins
    '--strict-mcp-config', // no MCP server but the one given here
    ...(mcp ? ['--mcp-config', mcpConfig] : []),
    '--tools',
    web ? 'WebSearch,WebFetch' : '', // A: no tools at all
    ...(web ? ['--allowedTools', 'WebSearch', 'WebFetch', ...(mcp ? MCP_TOOLS : [])] : []),
    '--no-session-persistence',
    '--max-budget-usd',
    '2',
    '--output-format',
    'stream-json',
    '--verbose',
    ...(model ? ['--model', model] : []),
  ];
}

const text = (r: Awaited<ReturnType<Client['callTool']>>) => (r.content as { type: string; text: string }[])[0]?.text ?? '';

/** Group D: what this server finds for the question's glossary words, read in full, as the model would get it from the tools. */
async function evidenceFor(q: string): Promise<{ words: string[]; sections: string[]; block: string }> {
  const words = termsInText(loadGlossary(), q);
  if (words.length === 0) return { words, sections: [], block: '' };
  const client = new Client({ name: 'compare-evidence', version: '0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER] }));
  try {
    const terms = new Set<string>();
    for (const w of words) {
      for (const hit of JSON.parse(text(await client.callTool({ name: 'map_term', arguments: { term: w } }))) as { en_terms: string[] }[]) {
        hit.en_terms.forEach((t) => terms.add(t));
      }
    }
    const query = [...terms].map((t) => `"${t}"`).join(' OR ');
    const found = JSON.parse(text(await client.callTool({ name: 'search_law', arguments: { query, jurisdiction: 'all', limit: 5 } })));
    const sections: string[] = [];
    const parts: string[] = [];
    let rules: string[] = [];
    let notices = new Set<string>();
    for (const r of found.results as { jurisdiction: string; act_id: string; section: string }[]) {
      const got = await client.callTool({ name: 'get_section', arguments: { jurisdiction: r.jurisdiction, act_id: r.act_id, section: r.section } });
      if (got.isError) continue;
      const s = JSON.parse(text(got));
      const c = s.citation;
      sections.push(`${c.act_id} s.${c.section}`);
      parts.push(`${c.act_title} (${c.act_citation}), section ${c.section}${c.heading ? ` (${c.heading})` : ''}\n${c.source_url} | current to ${c.current_to}\n\n${s.text}`);
      rules = s.answer_rules ?? rules;
      notices.add(s.notice);
    }
    if (parts.length === 0) return { words, sections, block: '' };
    const block =
      'Before this question, the Canada Law tool fetched the official text below (automatically; it may not be all that is relevant).\n\n' +
      parts.join('\n\n---\n\n') +
      `\n\n${[...notices].join('\n')}\n\nAnswer rules that come with this text:\n${rules.join('\n')}`;
    return { words, sections, block };
  } finally {
    await client.close();
  }
}

type Summary = {
  model: string;
  mcpConnected: boolean;
  toolsOffered: string[];
  toolCalls: string[];
  toolErrors: number;
  end: string;
  answer: string;
  costUsd: number;
  seconds: number;
};

/** Summarise a `claude -p --output-format stream-json --verbose` transcript. */
function readRun(jsonl: string): Summary {
  type Block = { type: string; id?: string; name?: string; input?: Record<string, unknown>; tool_use_id?: string; is_error?: boolean };
  type Event = {
    type: string;
    subtype?: string;
    model?: string;
    tools?: string[];
    mcp_servers?: { name: string; status: string }[];
    message?: { content?: Block[] | string };
    result?: string;
    total_cost_usd?: number;
    duration_ms?: number;
  };
  const events: Event[] = jsonl.split('\n').flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return [];
    }
  });
  const blocks = (type: string) => events.filter((e) => e.type === type).flatMap((e) => (Array.isArray(e.message?.content) ? e.message.content : []));
  const init = events.find((e) => e.type === 'system' && e.subtype === 'init');
  const result = events.find((e) => e.type === 'result');
  const uses = blocks('assistant').filter((b) => b.type === 'tool_use' || b.type === 'server_tool_use');
  return {
    model: init?.model ?? '?',
    mcpConnected: init?.mcp_servers?.some((s) => s.name === SERVER_NAME && s.status === 'connected') ?? false,
    toolsOffered: init?.tools ?? [],
    toolCalls: uses.map((b) => {
      const name = String(b.name ?? '?').replace(/^mcp__.*?___?/, 'canada-law:');
      const input = b.input ? JSON.stringify(b.input) : '';
      return `${name} ${input.length > 140 ? input.slice(0, 140) + '…' : input}`;
    }),
    toolErrors: blocks('user').filter((b) => b.type === 'tool_result' && b.is_error).length,
    end: result?.subtype ?? 'no result: crashed or timed out',
    answer: result?.result ?? '',
    costUsd: result?.total_cost_usd ?? 0,
    seconds: Math.round((result?.duration_ms ?? 0) / 1000),
  };
}

function findClaude(): string | null {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const native = join(homedir(), '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude');
  return existsSync(native) ? native : findOnPath('claude');
}

// Unlike Claude Desktop, Claude Code shows these five tools to the model from the start (ENABLE_TOOL_SEARCH=true made no
// visible difference with 2.1.281, 2026-09-27), so group C is a best case for "does the model use the tool".
function ask(exe: string, argv: string[], cwd: string): Promise<{ out: string; err: string }> {
  return new Promise((resolve) => {
    const child = spawn(exe, argv, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d.toString('utf8')));
    child.stderr.on('data', (d) => (err += d.toString('utf8')));
    const timer = setTimeout(() => child.kill(), 15 * 60 * 1000);
    child.on('close', () => {
      clearTimeout(timer);
      resolve({ out, err });
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ out, err: err + String(e) });
    });
  });
}

const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
const dir = join(root, '.local', 'compare-runs', stamp);
const mcpConfig = join(dir, 'mcp.json');
const exe = findClaude();

if (args.includes('--dry-run')) {
  console.log(`claude: ${exe ?? 'NOT FOUND'}\nquestions: ${questions.map((x) => x.n).join(', ')} | groups: ${arms.join(', ')}`);
  for (const arm of arms) console.log(`\n${arm}: claude ${claudeArgs(arm, '<question>', mcpConfig).map((a) => JSON.stringify(a)).join(' ')}`);
  if (arms.includes('D')) {
    for (const x of questions) {
      const ev = await evidenceFor(x.q);
      console.log(`\nD evidence for ${x.n}: words ${JSON.stringify(ev.words)} → ${ev.sections.join(', ') || 'none'} (${ev.block.length} chars)`);
    }
  }
  process.exit(0);
}
if (!exe) {
  console.error('claude not found: install Claude Code, or set CLAUDE_BIN to its path.');
  process.exit(2);
}
if (!existsSync(SERVER)) {
  console.error('No MCP bundle yet: run npm run bundle first.');
  process.exit(2);
}

for (const sub of ['runs', 'blind', 'evidence', 'work']) mkdirSync(join(dir, sub), { recursive: true });
writeFileSync(
  mcpConfig,
  JSON.stringify({ mcpServers: { [SERVER_NAME]: { command: process.execPath, args: [PROXY, SERVER] } } }, null, 2),
);
const planText = readFileSync(PLAN, 'utf8');
const planHash = (await import('node:crypto')).createHash('sha256').update(planText).digest('hex').slice(0, 16).toUpperCase();

// Group D's evidence, fetched once per question before anything is asked
const evidence = new Map<number, Awaited<ReturnType<typeof evidenceFor>>>();
if (arms.includes('D')) {
  for (const x of questions) {
    const ev = await evidenceFor(x.q);
    evidence.set(x.n, ev);
    writeFileSync(join(dir, 'evidence', `q${x.n}.md`), `words: ${JSON.stringify(ev.words)}\nsections: ${ev.sections.join(', ') || 'none'}\n\n${ev.block}\n`);
  }
}

type Job = { x: Question; arm: Arm; id: string };
const jobsList: Job[] = questions.flatMap((x) => arms.map((arm) => ({ x, arm, id: randomBytes(3).toString('hex') })));
// Shuffle so that no group always runs first or last
for (let i = jobsList.length - 1; i > 0; i--) {
  const j = randomBytes(1)[0] % (i + 1);
  [jobsList[i], jobsList[j]] = [jobsList[j], jobsList[i]];
}

const results: Record<string, Summary & { question: number; group: Arm }> = {};
let spent = 0;
let done = 0;
// Written after every answer, so that an interrupted run keeps what it has
const saveMapping = (complete: boolean) =>
  writeFileSync(
    join(dir, 'mapping.json'),
    JSON.stringify({ plan: PLAN.replace(root, ''), planHash, system: SYSTEM, date: today, complete, spentUsd: Number(spent.toFixed(2)), results }, null, 2),
  );
async function worker() {
  while (jobsList.length) {
    if (spent > MAX_TOTAL_USD) return;
    const job = jobsList.shift()!;
    const ev = evidence.get(job.x.n);
    const prompt = job.arm === 'D' && ev?.block ? `${ev.block}\n\n---\n\n${job.x.q}` : job.x.q;
    const work = join(dir, 'work', job.id); // an empty folder of its own: nothing to read, no CLAUDE.md
    mkdirSync(work);
    const r = await ask(exe!, claudeArgs(job.arm, prompt, mcpConfig), work);
    const base = join(dir, 'runs', `q${job.x.n}-${job.arm}`);
    writeFileSync(`${base}.jsonl`, r.out);
    if (r.err.trim()) writeFileSync(`${base}.err`, r.err);
    const s = readRun(r.out);
    results[job.id] = { ...s, question: job.x.n, group: job.arm };
    spent += s.costUsd;
    done++;
    writeFileSync(join(dir, 'blind', `${job.id}.md`), `# ${job.id} (question ${job.x.n})\n\n> ${job.x.q}\n\n${s.answer || '(no answer)'}\n`);
    saveMapping(false);
    console.log(`(${done}) ${job.id} done: ${s.end}, US$${s.costUsd.toFixed(2)}, ${s.seconds}s | spent US$${spent.toFixed(2)}`);
  }
}
await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker));

saveMapping(jobsList.length === 0);
console.log(`\n${Object.keys(results).length} answers, about US$${spent.toFixed(2)}. Plan hash ${planHash}.`);
console.log(`Grade blind/ first: ${join(dir, 'blind')}\nThen reveal the groups: ${join(dir, 'mapping.json')}`);
if (jobsList.length) console.log(`Stopped early at the US$${MAX_TOTAL_USD} cap: ${jobsList.length} left.`);
