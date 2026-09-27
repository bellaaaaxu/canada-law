// Activation test (npm run activation): does an AI model actually pick up the skill, and answer in its format?
// Asks Claude Code real questions in a throwaway folder that holds only the skill: no MCP servers, and none of
// the tester's own settings, skills or plugins (the set-up of the 2026-09-24 D1b test in SPEC-开源分发.md).
// It spends the tester's own Claude usage (D1b: about US$0.10 a question), so it is not part of npm test.
//
//   npm run activation                                       golden BC questions + two about the asker's own case
//   npm run activation -- --only zh-s40,en-own-laid-off --repeat 3 --model <model>
//   npm run activation -- --dry-run                          print the claude command; ask nothing
//   npm run activation -- --parse <run.jsonl> --case <id>    re-check a saved transcript
//
// The checks are pattern matches that point at problems; the verdict comes from reading answers.md.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyDir } from '../src/copy-dir.js';
import { quoteForCmd } from '../src/install/apply.js';
import { findOnPath } from '../src/install/env.js';

const SKILL = 'canada-employment-law';
const ESB_CONTACT = 'employment-standards-advice/employment-standards/contact-us';
const root = fileURLToPath(new URL('../', import.meta.url));
const isZh = (s: string) => /[一-鿿]/.test(s);
const cjkCount = (s: string) => (s.match(/[一-鿿]/g) ?? []).length;

type Case = { id: string; q: string; own: boolean; section: string };
const golden: Case[] = readFileSync(join(root, 'tests', 'golden.jsonl'), 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l))
  .filter((c) => c.expect.jurisdiction === 'bc')
  .map((c) => ({ id: `${isZh(c.q) ? 'zh' : 'en'}-s${c.expect.section}`, q: c.q, own: false, section: c.expect.section }));
// D1b's questions about the asker's own case, where the answer must not decide the case (SKILL.md answer format, part 3).
const own: Case[] = [
  { id: 'en-own-laid-off', q: 'I got laid off from my restaurant job in Vancouver after working there for 2 years. Am I owed severance?', own: true, section: '63' },
  { id: 'zh-own-laid-off', q: '我在温哥华的一家餐馆做了两年，被老板裁了，他要给我遣散费吗？', own: true, section: '63' },
];
const CASES = [...golden, ...own];

type Block = { type: string; id?: string; name?: string; input?: Record<string, unknown>; tool_use_id?: string; is_error?: boolean; content?: unknown };
type Event = {
  type: string;
  subtype?: string;
  model?: string;
  skills?: string[];
  mcp_servers?: unknown[];
  message?: { content?: Block[] | string };
  result?: string;
  num_turns?: number;
  total_cost_usd?: number;
  duration_ms?: number;
};
type Run = {
  model: string;
  skillListed: boolean;
  mcpServers: number;
  skillUsed: boolean;
  commands: string[];
  sections: string[];
  toolErrors: number;
  retrieved: string; // everything the tools returned, to tell a looked-up fact from a remembered one
  end: string;
  answer: string;
  turns: number;
  costUsd: number;
  seconds: number;
};

/** Summarise a `claude -p --output-format stream-json --verbose` transcript. */
function readRun(jsonl: string): Run {
  const events: Event[] = jsonl.split('\n').flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return []; // stray non-JSON output
    }
  });
  const blocks = (type: string) => events.filter((e) => e.type === type).flatMap((e) => (Array.isArray(e.message?.content) ? e.message.content : []));
  const failed = new Set(blocks('user').filter((b) => b.type === 'tool_result' && b.is_error).map((b) => b.tool_use_id));
  const uses = blocks('assistant').filter((b) => b.type === 'tool_use');
  const commands = uses
    .filter((b) => b.name === 'Bash')
    .flatMap((b) => [...String(b.input?.command ?? '').matchAll(/bclaw\.mjs["']?\s+(term|search|section|toc|find)\b([^&|;\n]*)/g)])
    .map((m) => `${m[1]}${m[2]}`.replace(/\s+\d?>&?\S*/g, '').trim());
  const sections = commands.flatMap((c) => {
    const m = /^section\s+"?([\w.-]+)"?\s+"?([\w.()]+)"?/.exec(c);
    return m ? [`${m[1]} s.${m[2]}`] : [];
  });
  const init = events.find((e) => e.type === 'system' && e.subtype === 'init');
  const result = events.find((e) => e.type === 'result');
  const textOf = (c: unknown): string =>
    typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => (x && typeof x === 'object' && 'text' in x ? String(x.text) : '')).join('\n') : '';
  return {
    model: init?.model ?? '?',
    skillListed: init?.skills?.includes(SKILL) ?? false,
    mcpServers: init?.mcp_servers?.length ?? 0,
    // A call with the wrong parameters fails, and does not count (D1b: the model first tried `skillName`).
    skillUsed: uses.some((b) => b.name === 'Skill' && b.input?.skill === SKILL && !failed.has(b.id)),
    commands,
    sections,
    toolErrors: failed.size,
    retrieved: blocks('user')
      .filter((b) => b.type === 'tool_result')
      .map((b) => textOf(b.content))
      .join('\n'),
    end: result?.subtype ?? 'no result: crashed or timed out',
    answer: result?.result ?? '',
    turns: result?.num_turns ?? 0,
    costUsd: result?.total_cost_usd ?? 0,
    seconds: Math.round((result?.duration_ms ?? 0) / 1000),
  };
}

type Check = [name: string, ok: boolean, note?: string];
const DATE = /20\d\d-\d\d-\d\d|20\d\d\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日|(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, 20\d\d/;
// The five parts of the SKILL.md answer format, looked for in heading lines; a Chinese answer translates them
// (2026-09-25 D3 answers: 这意味着什么, 影响结果的因素).
const PARTS: [string, RegExp][] = [
  ['law says', /what the law says|法律(原文|条文|怎么说|规定)|原文/i],
  ['means', /what it means|意思|意味|含义|解释/i],
  ['decides', /what decides|决定|取决|关键|影响/i],
  ['help', /where to get help|求助|帮助|咨询/i],
  ['sources', /sources|出处|来源/i],
];
// Phrases that decide the asker's own case. They only flag lines to read: explaining the rule is fine.
const VERDICT = [
  /\byou(?:'re| are) (?:entitled|owed|eligible)\b/i,
  /\byou (?:should|will|would) (?:get|receive|be paid)\b/i,
  /\byour (?:employer|boss) (?:must|owes|has to|is required to|needs to) (?:pay|give) you\b/i,
  /你(?:有权|应该|应当|可以|能)(?:得到|拿到|获得|领到|领取)/,
  /(?:他|老板|雇主)(?:必须|应该|应当|需要|要)给你/,
];

// Part 4 of the answer format holds whatever the tools did not return, labelled as not checked (D3 option A).
// (2026-09-26 run 3: one Chinese answer titled it 非来自官方文本的补充, so 文本 as well as 原文.)
const UNCHECKED_PART = /not from the official text|not checked|官方(原文|文本)(以外|之外)|不是(来自|出自)?官方(原文|文本)|非(来自)?官方(原文|文本)|未经?.{0,8}核(对|实)|没有.{0,8}核(对|实)/i;
// What the model has added from memory before (D1b; D3 rounds 1 and 2). A match in the other parts that the tools never
// returned is flagged. Only a pointer: the tools return English, so a looked-up fact that was translated is flagged too.
const KNOWN_SLIPS: [string, RegExp][] = [
  ['holiday date', /\b(first|second|third|fourth|last) Monday\b|\bMonday (before|preceding) May\b|\b(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}\b|第[一二三四]个?(星期|周)一|最后一个?(星期|周)一|\d{1,2}\s*月\s*\d{1,2}\s*日/i],
  ['common law', /common law|reasonable notice|普通法|合理通知/i],
  ['reading of just cause', /\bnot (?:considered )?just cause\b|不属于\s*(just cause|正当理由)|无正当理由|无故解雇|自身过错/i],
  ['who is excluded', /\bmanagers?\b[^.\n]{0,40}\bprofessionals?\b|经理[^。\n]{0,10}专业人士/i],
];
const HEADING = /^\s*(#{1,6}\s|\*\*|\d+[.)、]\s*\*\*)/;

function check(c: Case, run: Run): Check[] {
  const a = run.answer;
  const plain = a.replace(/\*/g, ''); // bold markers split phrases, e.g. 老板**需要给你补偿**
  const headings = a
    .split('\n')
    .filter((l) => HEADING.test(l))
    .join('\n');
  // The answer cut at its headings; parts 1-3 (and 5) = everything except part 4 and the sources.
  const sections: [string, string][] = [['', '']];
  for (const line of a.split('\n')) {
    if (HEADING.test(line)) sections.push([line, '']);
    else sections[sections.length - 1][1] += `${line}\n`;
  }
  const hasUncheckedPart = sections.some(([h]) => UNCHECKED_PART.test(h));
  const rest = sections
    .filter(([h]) => !UNCHECKED_PART.test(h) && !/sources|出处|来源/i.test(h))
    .map(([h, t]) => `${h}\n${t}`)
    .join('\n');
  const retrieved = run.retrieved.toLowerCase();
  const slips = KNOWN_SLIPS.flatMap(([name, re]) =>
    [...rest.matchAll(new RegExp(re.source, `${re.flags}g`))].filter((m) => !retrieved.includes(m[0].toLowerCase())).map((m) => `${name}: ${m[0]}`),
  );
  // Sections the answer cites that the model saw only as search results (a snippet cut short), never read in full
  // (D3 run 3: s.44 explained from "... or (b) worked under an..." and the rest made up).
  const fetched = new Set(run.sections.map((s) => s.split(' s.')[1]));
  const inResults = new Set([...run.retrieved.matchAll(/"section":\s*"([\w.]+)"/g)].map((m) => m[1]));
  const citedNums = new Set([...a.matchAll(/\b(?:s\.|ss\.|sections?)\s*(\d+(?:\.\d+)?)|第\s*(\d+(?:\.\d+)?)\s*条/gi)].map((m) => m[1] ?? m[2]));
  const fromSnippets = [...citedNums].filter((n) => inResults.has(n) && !fetched.has(n));
  // Part 4 (where to get help) is only asked for when the user describes their own situation (spec rule 6).
  const missing = PARTS.filter(([name, re]) => (c.own || name !== 'help') && !re.test(headings)).map(([name]) => name);
  const cited = new RegExp(`\\b(section|s\\.)\\s*${c.section}\\b|第\\s*${c.section}\\s*条`, 'i');
  const verdicts = VERDICT.flatMap((re) => [...plain.matchAll(new RegExp(re.source, `${re.flags}g`))])
    // "how much you are owed depends on…", "if you believe you are owed…" set out conditions; they decide nothing (run 4)
    .filter((m) => !/\b(if|whether|how much|believe|think)\b[^.\n]{0,20}$/i.test(plain.slice(Math.max(0, m.index - 25), m.index)) && !/^[^.\n]{0,20}\bdepends\b/i.test(plain.slice(m.index + m[0].length)))
    .slice(0, 3)
    .map((m) => plain.slice(Math.max(0, m.index - 15), m.index + m[0].length + 15).replace(/\s+/g, ' '));
  const checks: Check[] = [
    ['used the skill', run.skillUsed],
    ['ran the script', run.commands.length > 0],
    [`section ${c.section} read or cited`, run.sections.includes(`96113_01 s.${c.section}`) || cited.test(a)],
    ['same language as the question', isZh(c.q) ? cjkCount(a) >= 30 : cjkCount(a) === 0],
    ['five-part format', missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : undefined],
    ['source_url', /bclaws\.gov\.bc\.ca\/civix\/document\/id\/complete\/statreg\//.test(a)],
    ['current_to date', DATE.test(a)],
    ['licence line', /King.s Printer Licen[cs]e/i.test(a)],
    ['not legal advice', /not legal advice|不(是|构成)法律(意见|建议)|非法律(意见|建议)/i.test(a)],
    ['federal-law reminder', /federal|联邦/i.test(a)],
    [
      'nothing unchecked outside part 4 (known slips)',
      slips.length === 0,
      [slips.length ? `read: ${slips.slice(0, 4).join('; ')}` : '', hasUncheckedPart ? 'has a not-from-the-official-text part' : ''].filter(Boolean).join(' | ') || undefined,
    ],
    ['cited sections read in full', fromSnippets.length === 0, fromSnippets.length ? `only seen in search results: s.${fromSnippets.join(', s.')}` : undefined],
  ];
  if (c.own) {
    checks.push(['Employment Standards Branch link', a.includes(ESB_CONTACT)]);
    checks.push(['does not decide the case', verdicts.length === 0, verdicts.length ? `read: ${verdicts.map((v) => `"${v}"`).join('; ')}` : undefined]);
  }
  return checks;
}

function report(label: string, c: Case, run: Run, checks: Check[]): string {
  return [
    `[${label}] ${c.q}`,
    `  ${run.model} | skill ${run.skillUsed ? 'USED' : 'NOT USED'}${run.skillListed ? '' : ' (not even listed)'} | ${run.turns} turns, US$${run.costUsd.toFixed(2)}, ${run.seconds}s | end: ${run.end}` +
      (run.toolErrors ? ` | ${run.toolErrors} tool errors` : '') +
      (run.mcpServers ? ` | WRONG SET-UP: ${run.mcpServers} MCP servers connected` : ''),
    `  script: ${run.commands.map((x) => x.slice(0, 60)).join(' · ') || '(none)'}`,
    ...checks.map(([name, ok, note]) => `  ${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`),
  ].join('\n');
}

const args = process.argv.slice(2);
const KNOWN = new Set(['--only', '--repeat', '--model', '--dry-run', '--parse', '--case']);
const unknown = args.filter((a) => a.startsWith('--') && !KNOWN.has(a));
if (unknown.length) {
  console.error(`Unknown option ${unknown.join(', ')}; the options are at the top of scripts/activation.ts.`);
  process.exit(2);
}
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const caseById = (id: string | undefined): Case => {
  const c = CASES.find((x) => x.id === id);
  if (!c) {
    console.error(`Unknown case "${id}". Cases: ${CASES.map((x) => x.id).join(', ')}`);
    process.exit(2);
  }
  return c;
};

const saved = opt('--parse');
if (saved) {
  const c = caseById(opt('--case'));
  const run = readRun(readFileSync(saved, 'utf8'));
  console.log(report(c.id, c, run, check(c, run)));
  process.exit(0);
}

const cases = opt('--only')?.split(',').map((id) => caseById(id.trim())) ?? CASES;
const repeat = Number(opt('--repeat') ?? 1);
if (!Number.isInteger(repeat) || repeat < 1) {
  console.error('--repeat takes a whole number, 1 or more.');
  process.exit(2);
}
const model = opt('--model');
const claudeArgs = (q: string) => [
  '-p',
  q, // before --allowedTools, which would take it as one more tool name
  '--setting-sources',
  'project', // none of the tester's own settings, skills or plugins
  '--strict-mcp-config', // and no MCP servers: this tests the skill on its own
  '--allowedTools',
  'Bash(node:*)',
  'Bash(cd:*)',
  'Read',
  'Skill',
  '--no-session-persistence',
  '--max-budget-usd',
  '2',
  '--output-format',
  'stream-json',
  '--verbose',
  ...(model ? ['--model', model] : []),
];

function findClaude(): string | null {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const onPath = findOnPath('claude');
  if (onPath) return onPath;
  const native = join(homedir(), '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude'); // native installer
  return existsSync(native) ? native : null;
}

function ask(exe: string, argv: string[], cwd: string) {
  const viaShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(exe); // npm's claude.cmd
  const options = { cwd, encoding: 'utf8' as const, maxBuffer: 64 * 1024 * 1024, timeout: 10 * 60 * 1000 };
  const r = viaShell ? spawnSync([exe, ...argv].map(quoteForCmd).join(' '), { ...options, shell: true }) : spawnSync(exe, argv, options);
  return { out: r.stdout ?? '', err: `${r.stderr ?? ''}${r.error ? String(r.error) : ''}` };
}

const exe = findClaude();
if (args.includes('--dry-run')) {
  console.log(`claude: ${exe ?? 'NOT FOUND: install Claude Code, or set CLAUDE_BIN to its path'}`);
  console.log(`cases (${cases.length} x ${repeat}): ${cases.map((c) => c.id).join(', ')}`);
  console.log(`command: claude ${claudeArgs(cases[0].q).map((a) => JSON.stringify(a)).join(' ')}`);
  console.log(`runs in: a new folder under ${tmpdir()} that holds only .claude/skills/${SKILL}`);
  process.exit(0);
}
if (!exe) {
  console.error('claude not found: install Claude Code, or set CLAUDE_BIN to its path.');
  process.exit(2);
}
if (!existsSync(join(root, 'skills', SKILL, 'scripts', 'bclaw.mjs'))) {
  console.error('The skill has no script yet: run npm run bundle first.');
  process.exit(2);
}

const work = mkdtempSync(join(tmpdir(), 'canada-law-activation-'));
copyDir(join(root, 'skills', SKILL), join(work, '.claude', 'skills', SKILL)); // not fs.cpSync (see copy-dir.ts)
mkdirSync(join(work, 'runs'));
// answers.md may be published, so it names the folder without the tester's user name
let md = `# Activation test, ${new Date().toISOString().slice(0, 10)}\n\nFolder: ${work.replace(tmpdir(), process.platform === 'win32' ? '%TEMP%' : '$TMPDIR')}\n`;
let total = 0;
let used = 0;
let clean = 0;
let cost = 0;
for (const c of cases) {
  for (let n = 1; n <= repeat; n++) {
    total++;
    const label = repeat > 1 ? `${c.id} #${n}` : c.id;
    console.log(`\n(${total}/${cases.length * repeat}) asking ${label} ...`);
    const r = ask(exe, claudeArgs(c.q), work);
    const base = join(work, 'runs', repeat > 1 ? `${c.id}-${n}` : c.id);
    writeFileSync(`${base}.jsonl`, r.out);
    if (r.err.trim()) writeFileSync(`${base}.err`, r.err);
    const run = readRun(r.out);
    const checks = check(c, run);
    used += run.skillUsed ? 1 : 0;
    clean += checks.every(([, ok]) => ok) ? 1 : 0;
    cost += run.costUsd;
    const text = report(label, c, run, checks);
    console.log(text);
    if (run.end !== 'success' && r.err.trim()) console.log(`  stderr: ${r.err.trim().slice(0, 300)}`);
    md += `\n## ${label}\n\n\`\`\`\n${text}\n\`\`\`\n\n${run.answer || '(no answer)'}\n`;
  }
}
writeFileSync(join(work, 'answers.md'), md);
console.log(`\nSkill used in ${used}/${total} runs; every check passed in ${clean}/${total}; about US$${cost.toFixed(2)} of usage.`);
console.log(`Answers, word for word: ${join(work, 'answers.md')}`);
process.exit(used === total && clean === total ? 0 : 1);
