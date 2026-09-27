#!/usr/bin/env node

// src/install/bin.ts
import { dirname as dirname2 } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

// src/install/apply.ts
import { spawnSync } from "node:child_process";
import { copyFileSync as copyFileSync2, existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join as join4 } from "node:path";

// src/copy-dir.ts
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
function copyDir(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dst, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else if (entry.isFile()) copyFileSync(from, to);
  }
}

// src/install/plan.ts
import { join as join3 } from "node:path";

// src/install/json-config.ts
var SERVER_NAME = "canada-law";
var isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function shape(format, serverPath) {
  if (format === "opencode") return { container: "mcp", value: { type: "local", command: ["node", serverPath], enabled: true } };
  if (format === "copilot") return { container: "mcpServers", value: { type: "local", command: "node", args: [serverPath], tools: ["*"] } };
  return { container: "mcpServers", value: { command: "node", args: [serverPath] } };
}
function parse(text) {
  try {
    const v = JSON.parse(text.replace(/^﻿/, ""));
    return isObj(v) ? v : null;
  } catch {
    return null;
  }
}
var serialize = (o) => JSON.stringify(o, null, 2) + "\n";
function planJsonAdd(current, format, serverPath) {
  const { container, value } = shape(format, serverPath);
  if (current === null) {
    const fresh = format === "opencode" ? { $schema: "https://opencode.ai/config.json" } : {};
    fresh[container] = { [SERVER_NAME]: value };
    return { status: "create", next: serialize(fresh) };
  }
  const doc = parse(current);
  if (!doc) return { status: "unparseable" };
  const servers = doc[container] ?? {};
  if (!isObj(servers)) return { status: "unparseable" };
  if (JSON.stringify(servers[SERVER_NAME]) === JSON.stringify(value)) return { status: "unchanged" };
  doc[container] = { ...servers, [SERVER_NAME]: value };
  return { status: "update", next: serialize(doc) };
}
function planJsonRemove(current, format) {
  if (current === null) return { status: "absent" };
  const doc = parse(current);
  if (!doc) return { status: "unparseable" };
  const { container } = shape(format, "");
  const servers = doc[container];
  if (servers !== void 0 && !isObj(servers)) return { status: "unparseable" };
  if (!servers || !(SERVER_NAME in servers)) return { status: "absent" };
  const { [SERVER_NAME]: _ours, ...rest } = servers;
  doc[container] = rest;
  return { status: "remove", next: serialize(doc) };
}

// src/install/toml-config.ts
var OUR_HEADER = /^\s*\[\s*mcp_servers\s*\.\s*(?:"canada-law"|canada-law)\s*\]\s*(?:#.*)?$/;
var ANY_HEADER = /^\s*\[/;
var tomlString = (s) => s.includes("'") || /[\r\n]/.test(s) ? JSON.stringify(s) : `'${s}'`;
function ourTable(serverPath, eol) {
  return ["[mcp_servers.canada-law]", 'command = "node"', `args = [${tomlString(serverPath)}]`, ""].join(eol);
}
function findOurTable(lines) {
  const start = lines.findIndex((l) => OUR_HEADER.test(l));
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length && !ANY_HEADER.test(lines[end])) end++;
  let contentEnd = end;
  while (contentEnd > start + 1 && lines[contentEnd - 1].trim() === "") contentEnd--;
  return { start, end, contentEnd };
}
function planTomlAdd(current, serverPath) {
  if (current === null) return { status: "create", next: ourTable(serverPath, "\n") };
  const eol = current.includes("\r\n") ? "\r\n" : "\n";
  const table = ourTable(serverPath, eol);
  const lines = current.split(/\r?\n/);
  const found = findOurTable(lines);
  if (found) {
    const existing = lines.slice(found.start, found.contentEnd).join(eol) + eol;
    if (existing === table) return { status: "unchanged" };
    const next = [...lines.slice(0, found.start), ...table.split(eol).slice(0, -1), ...lines.slice(found.contentEnd)];
    return { status: "update", next: next.join(eol) };
  }
  const base = current === "" || current.endsWith(eol) ? current : current + eol;
  return { status: "update", next: base + (base === "" ? "" : eol) + table };
}
function planTomlRemove(current) {
  if (current === null) return { status: "absent" };
  const eol = current.includes("\r\n") ? "\r\n" : "\n";
  const lines = current.split(/\r?\n/);
  const found = findOurTable(lines);
  if (!found) return { status: "absent" };
  return { status: "remove", next: [...lines.slice(0, found.start), ...lines.slice(found.end)].join(eol) };
}

// src/install/tools.ts
import { existsSync } from "node:fs";
import { join as join2 } from "node:path";
var has = (e, ...p) => existsSync(join2(e.home, ...p));
var commandOrFolder = (cmd, ...folder) => (e) => e.which(cmd) !== null || has(e, ...folder);
var sharedSkills = (e) => [join2(e.home, ".agents", "skills")];
var json = (format, ...p) => (e) => ({ kind: "json", file: join2(e.home, ...p), format });
var CLAUDE_MSIX = ["Packages", "Claude_pzs8sxrjxfjjc", "LocalCache", "Roaming", "Claude"];
function claudeDesktopDir(e) {
  if (e.platform === "win32") {
    const msix = e.localAppData ? join2(e.localAppData, ...CLAUDE_MSIX) : null;
    if (msix && existsSync(msix)) return msix;
    return e.appData ? join2(e.appData, "Claude") : null;
  }
  if (e.platform === "darwin") return join2(e.home, "Library", "Application Support", "Claude");
  return null;
}
var TOOLS = [
  {
    id: "claude-code",
    name: "Claude Code",
    tested: true,
    detect: commandOrFolder("claude", ".claude"),
    skillDirs: (e) => [join2(e.home, ".claude", "skills")],
    mcp: (e, server) => {
      const exe = e.which("claude");
      return exe ? { kind: "command", exe, remove: ["mcp", "remove", "canada-law", "--scope", "user"], add: ["mcp", "add", "--scope", "user", "canada-law", "--", "node", server] } : { kind: "manual", text: `The claude command was not found. Once Claude Code is installed, run: claude mcp add --scope user canada-law -- node "${server}"` };
    }
  },
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    tested: false,
    detect: (e) => {
      const dir = claudeDesktopDir(e);
      return dir !== null && existsSync(dir);
    },
    skillDirs: () => [],
    mcp: (e) => {
      const dir = claudeDesktopDir(e);
      return dir ? { kind: "json", file: join2(dir, "claude_desktop_config.json"), format: "mcpServers" } : { kind: "manual", text: "Claude Desktop documents its config file for Windows and macOS only; on Linux, add canada-law by hand (see the README)." };
    }
  },
  { id: "codex", name: "OpenAI Codex", tested: false, detect: commandOrFolder("codex", ".codex"), skillDirs: sharedSkills, mcp: (e) => ({ kind: "toml", file: join2(e.home, ".codex", "config.toml") }) },
  {
    id: "vscode",
    name: "VS Code / GitHub Copilot",
    tested: false,
    detect: (e) => e.which("code") !== null,
    skillDirs: sharedSkills,
    mcp: (_e, server) => ({
      kind: "manual",
      text: `VS Code's user MCP file location is not documented, so run this yourself: code --add-mcp ${JSON.stringify(JSON.stringify({ name: "canada-law", command: "node", args: [server] }))}`
    })
  },
  { id: "cursor", name: "Cursor", tested: false, detect: (e) => has(e, ".cursor"), skillDirs: sharedSkills, mcp: json("mcpServers", ".cursor", "mcp.json") },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    tested: false,
    detect: (e) => e.which("gemini") !== null || has(e, ".gemini", "settings.json"),
    skillDirs: sharedSkills,
    mcp: json("mcpServers", ".gemini", "settings.json")
  },
  { id: "copilot-cli", name: "GitHub Copilot CLI", tested: false, detect: commandOrFolder("copilot", ".copilot"), skillDirs: sharedSkills, mcp: json("copilot", ".copilot", "mcp-config.json") },
  {
    id: "antigravity",
    name: "Google Antigravity",
    tested: false,
    detect: (e) => e.which("agy") !== null || has(e, ".gemini", "config") || has(e, ".gemini", "antigravity-cli"),
    skillDirs: (e) => [join2(e.home, ".gemini", "config", "skills"), join2(e.home, ".gemini", "antigravity-cli", "skills")],
    mcp: json("mcpServers", ".gemini", "config", "mcp_config.json")
  },
  { id: "kiro", name: "Kiro", tested: false, detect: commandOrFolder("kiro-cli", ".kiro"), skillDirs: (e) => [join2(e.home, ".kiro", "skills")], mcp: json("mcpServers", ".kiro", "settings", "mcp.json") },
  { id: "qwen-code", name: "Qwen Code", tested: false, detect: commandOrFolder("qwen", ".qwen"), skillDirs: (e) => [join2(e.home, ".qwen", "skills")], mcp: json("mcpServers", ".qwen", "settings.json") },
  { id: "opencode", name: "OpenCode", tested: false, detect: commandOrFolder("opencode", ".config", "opencode"), skillDirs: sharedSkills, mcp: json("opencode", ".config", "opencode", "opencode.json") },
  { id: "kimi-code", name: "Kimi Code CLI", tested: false, detect: commandOrFolder("kimi", ".kimi-code"), skillDirs: sharedSkills, mcp: json("mcpServers", ".kimi-code", "mcp.json") },
  {
    id: "cline",
    name: "Cline",
    tested: false,
    detect: commandOrFolder("cline", ".cline"),
    skillDirs: (e) => [join2(e.home, ".cline", "skills")],
    mcp: (_e, server) => ({
      kind: "manual",
      text: `Cline's documentation gives three different MCP file locations, so use its own wizard: run "cline mcp" and add a stdio server named canada-law that runs: node "${server}"`
    })
  },
  {
    id: "deepseek-harness",
    name: "DeepSeek Harness",
    tested: false,
    detect: commandOrFolder("dsh", ".dsh"),
    skillDirs: sharedSkills,
    mcp: () => ({
      kind: "manual",
      text: "DeepSeek Harness is a developer preview whose MCP config may change, so only the skill was installed (it works on its own). To add the MCP server, see https://github.com/deepseek-ai/deepseek-harness"
    })
  }
];

// src/install/plan.ts
var SKILL_NAME = "canada-employment-law";
var stableDir = (env) => join3(env.home, ".canada-law");
var serverPathFor = (env) => join3(stableDir(env), "canada-law-mcp.mjs");
var statePathFor = (env) => join3(stableDir(env), "install-state.json");
function toolsById(ids) {
  return ids.map((id) => {
    const tool = TOOLS.find((t) => t.id === id);
    if (!tool) throw new Error(`Unknown tool "${id}". Known tools: ${TOOLS.map((t) => t.id).join(", ")}`);
    return tool;
  });
}
var detectTools = (env) => TOOLS.filter((t) => t.detect(env));
function planInstall(ids, env, opts) {
  const tools = toolsById(ids);
  const server = serverPathFor(env);
  const actions = [{ type: "copy-file", from: join3(opts.pkgRoot, "mcp", "canada-law-mcp.mjs"), to: server }];
  const toolsByFolder = /* @__PURE__ */ new Map();
  for (const t of tools) for (const dir of t.skillDirs(env)) toolsByFolder.set(dir, [...toolsByFolder.get(dir) ?? [], t.id]);
  for (const [dir, ids2] of toolsByFolder) {
    actions.push({ type: "copy-dir", from: join3(opts.pkgRoot, "skills", SKILL_NAME), to: join3(dir, SKILL_NAME), tools: ids2 });
  }
  for (const t of tools) {
    const m = t.mcp(env, server);
    if (m.kind === "json" || m.kind === "toml") {
      const current = opts.read(m.file);
      const p = m.kind === "json" ? planJsonAdd(current, m.format, server) : planTomlAdd(current, server);
      if (p.status === "unchanged") actions.push({ type: "unchanged", tool: t.id, file: m.file });
      else if (p.status === "unparseable") {
        actions.push({ type: "manual", tool: t.id, text: `${m.file} could not be read, so it was left untouched. Add a server named canada-law that runs: node "${server}"` });
      } else actions.push({ type: "write-file", tool: t.id, file: m.file, next: p.next, status: p.status, backup: current !== null });
    } else if (m.kind === "command") {
      actions.push({ type: "command", tool: t.id, exe: m.exe, args: m.remove, ignoreFailure: true });
      actions.push({ type: "command", tool: t.id, exe: m.exe, args: m.add, ignoreFailure: false });
    } else actions.push({ type: "manual", tool: t.id, text: m.text });
  }
  const installed = [.../* @__PURE__ */ new Set([...opts.previous?.tools ?? [], ...ids])];
  actions.push({ type: "write-state", file: statePathFor(env), state: { version: 1, tools: installed } });
  return actions;
}
function planUninstall(ids, env, opts) {
  const installed = opts.state?.tools ?? [];
  const targets = toolsById(ids ?? installed);
  const remaining = toolsById(installed.filter((id) => !targets.some((t) => t.id === id)));
  const server = serverPathFor(env);
  const actions = [];
  for (const t of targets) {
    const m = t.mcp(env, server);
    if (m.kind === "json" || m.kind === "toml") {
      const current = opts.read(m.file);
      const p = m.kind === "json" ? planJsonRemove(current, m.format) : planTomlRemove(current);
      if (p.status === "remove") actions.push({ type: "write-file", tool: t.id, file: m.file, next: p.next, status: "remove", backup: true });
      else if (p.status === "unparseable") actions.push({ type: "manual", tool: t.id, text: `${m.file} could not be read; remove the canada-law server from it by hand.` });
    } else if (m.kind === "command") {
      actions.push({ type: "command", tool: t.id, exe: m.exe, args: m.remove, ignoreFailure: true });
    } else {
      actions.push({ type: "manual", tool: t.id, text: `If you added the canada-law MCP server to ${t.name} by hand, remove it in ${t.name}'s settings.` });
    }
  }
  const stillUsed = new Set(remaining.flatMap((t) => t.skillDirs(env)));
  const toolsByFolder = /* @__PURE__ */ new Map();
  for (const t of targets) for (const dir of t.skillDirs(env)) if (!stillUsed.has(dir)) toolsByFolder.set(dir, [...toolsByFolder.get(dir) ?? [], t.id]);
  for (const [dir, ids2] of toolsByFolder) actions.push({ type: "remove-dir", path: join3(dir, SKILL_NAME), tools: ids2 });
  if (remaining.length === 0) actions.push({ type: "remove-dir", path: stableDir(env), tools: [] });
  else actions.push({ type: "write-state", file: statePathFor(env), state: { version: 1, tools: remaining.map((t) => t.id) } });
  return actions;
}

// src/install/apply.ts
var quoteForCmd = (s) => /^[A-Za-z0-9_\-.:\\/=@]+$/.test(s) ? s : `"${s.replace(/"/g, '""')}"`;
function realIo() {
  return {
    read: (file) => {
      try {
        return readFileSync(file, "utf8");
      } catch {
        return null;
      }
    },
    write: (file, text) => {
      mkdirSync2(dirname(file), { recursive: true });
      writeFileSync(file, text);
    },
    exists: existsSync2,
    copyFile: (from, to) => {
      mkdirSync2(dirname(to), { recursive: true });
      copyFileSync2(from, to);
    },
    copyDir,
    // not fs.cpSync: it crashes on Chinese paths (see copy-dir.ts)
    removeDir: (path) => rmSync(path, { recursive: true, force: true }),
    run: (exe, args) => {
      const viaShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(exe);
      const r2 = viaShell ? spawnSync([exe, ...args].map(quoteForCmd).join(" "), { shell: true, encoding: "utf8" }) : spawnSync(exe, args, { encoding: "utf8" });
      return { code: r2.status ?? 1, out: `${r2.stdout ?? ""}${r2.stderr ?? ""}${r2.error ? String(r2.error) : ""}`.trim() };
    },
    now: () => /* @__PURE__ */ new Date()
  };
}
function readState(env, io) {
  const text = io.read(statePathFor(env));
  if (!text) return null;
  try {
    const s = JSON.parse(text);
    return Array.isArray(s.tools) ? s : null;
  } catch {
    return null;
  }
}
var isOurSkill = (dir, io) => /^name:\s*canada-employment-law\s*$/m.test(io.read(join4(dir, "SKILL.md")) ?? "");
var isOurFolder = (path, io) => basename(path) === ".canada-law" || basename(path) === SKILL_NAME && isOurSkill(path, io);
function applyActions(actions, io) {
  const stamp = io.now().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const backupPath = (file) => {
    let p = `${file}.bak-canada-law-${stamp}`;
    for (let n = 2; io.exists(p); n++) p = `${file}.bak-canada-law-${stamp}-${n}`;
    return p;
  };
  const run = (a) => {
    const ok = (message) => ({ action: a, ok: true, message });
    const fail = (message) => ({ action: a, ok: false, message });
    switch (a.type) {
      case "copy-file":
        io.copyFile(a.from, a.to);
        return ok(`copied ${a.to}`);
      case "copy-dir":
        if (io.exists(a.to)) {
          if (!isOurSkill(a.to, io)) return fail(`${a.to} already exists and is not this skill, so it was left untouched`);
          io.removeDir(a.to);
        }
        io.copyDir(a.from, a.to);
        return ok(`skill copied to ${a.to}`);
      case "write-file": {
        let backup = "";
        if (a.backup && io.exists(a.file)) {
          backup = backupPath(a.file);
          io.copyFile(a.file, backup);
        }
        io.write(a.file, a.next);
        return ok(`${a.status === "remove" ? "removed canada-law from" : a.status === "create" ? "created" : "updated"} ${a.file}${backup ? ` (backup: ${basename(backup)})` : ""}`);
      }
      case "unchanged":
        return ok(`${a.file} already up to date`);
      case "command": {
        const r2 = io.run(a.exe, a.args);
        if (r2.code !== 0 && !a.ignoreFailure) return fail(`${basename(a.exe)} ${a.args.join(" ")} failed: ${r2.out}`);
        return ok(`${basename(a.exe)} ${a.args.join(" ")}`);
      }
      case "manual":
        return ok(a.text);
      case "write-state":
        io.write(a.file, JSON.stringify(a.state, null, 2) + "\n");
        return ok(`recorded installed tools in ${a.file}`);
      case "remove-dir":
        if (!io.exists(a.path)) return ok(`${a.path} already gone`);
        if (!isOurFolder(a.path, io)) return fail(`${a.path} is not this skill, so it was left untouched`);
        io.removeDir(a.path);
        return ok(`removed ${a.path}`);
    }
  };
  return actions.map((a) => {
    try {
      return run(a);
    } catch (e) {
      return { action: a, ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  });
}

// src/install/env.ts
import { existsSync as existsSync3 } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join as join5 } from "node:path";
function findOnPath(cmd, pathVar = process.env.PATH ?? "", platform = process.platform) {
  const exts = platform === "win32" ? [".exe", ".cmd", ".bat"] : [""];
  for (const dir of pathVar.split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const p = join5(dir, cmd + ext);
      if (existsSync3(p)) return p;
    }
  }
  return null;
}
function realEnv() {
  return {
    home: homedir(),
    appData: process.env.APPDATA ?? null,
    localAppData: process.env.LOCALAPPDATA ?? null,
    platform: process.platform,
    which: (c) => findOnPath(c)
  };
}

// src/install/main.ts
import { basename as basename2 } from "node:path";
var USAGE = `Usage: canada-law <command> [tools...] [--yes] [--print]

  install [tools...]    add the BC employment-law skill and MCP server to your AI tools
                        (no tools named = every supported tool found on this computer)
  uninstall [tools...]  remove what install added (no tools named = everything)
  status                show what is installed
  list                  show the supported tools

  --print   only show what would change
  --yes     apply without asking

\u7528\u6CD5\uFF1Acanada-law install \u88C5\u8FDB\u7535\u8111\u4E0A\u627E\u5230\u7684\u6240\u6709 AI \u5DE5\u5177\uFF1B\u5148\u663E\u793A\u8981\u6539\u4EC0\u4E48\uFF0C\u786E\u8BA4\u540E\u624D\u52A8\u624B\u3002`;
var nameOf = (id) => TOOLS.find((t) => t.id === id)?.name ?? id;
function describe(a) {
  switch (a.type) {
    case "copy-file":
      return `copy the MCP server to ${a.to}`;
    case "copy-dir":
      return `[${a.tools.map(nameOf).join(", ")}] copy the skill to ${a.to}`;
    case "write-file":
      return `[${nameOf(a.tool)}] ${a.status === "remove" ? "remove canada-law from" : a.status} ${a.file}${a.backup ? " (backup first)" : ""}`;
    case "unchanged":
      return `[${nameOf(a.tool)}] ${a.file} is already up to date`;
    case "command":
      return `[${nameOf(a.tool)}] run: ${basename2(a.exe)} ${a.args.join(" ")}`;
    case "manual":
      return `[${nameOf(a.tool)}] do it yourself: ${a.text}`;
    case "write-state":
      return `record the installed tools in ${a.file}`;
    case "remove-dir":
      return `remove ${a.path}`;
  }
}
var outcomeLine = (o) => `  ${o.action.type === "manual" ? "[do it yourself]" : o.ok ? "[ok]" : "[FAILED]"} ${o.message}`;
async function runInstaller(argv, deps) {
  const lines = [];
  const say = (s = "") => lines.push(s);
  const done = (code) => ({ code, out: lines.join("\n") });
  const flags = new Set(argv.filter((a) => a.startsWith("-")));
  const [cmd, ...ids] = argv.filter((a) => !a.startsWith("-"));
  const { env, io } = deps;
  if (!cmd || cmd === "help" || flags.has("--help") || flags.has("-h")) {
    say(USAGE);
    return done(0);
  }
  if (cmd === "list") {
    say("Supported AI tools / \u652F\u6301\u7684 AI \u5DE5\u5177:");
    for (const t of TOOLS) say(`  ${t.id.padEnd(18)} ${t.name.padEnd(26)} ${(t.tested ? "tested" : "untested").padEnd(9)} ${t.detect(env) ? "found on this computer" : "-"}`);
    return done(0);
  }
  const state = readState(env, io);
  if (cmd === "status") {
    if (!state || state.tools.length === 0) {
      say("Nothing installed. / \u8FD8\u6CA1\u6709\u5B89\u88C5\u3002");
      return done(0);
    }
    say("Installed for / \u5DF2\u5B89\u88C5\u5230:");
    const server = serverPathFor(env);
    for (const t of toolsById(state.tools)) {
      const skills = t.skillDirs(env).map((d) => `${io.exists(`${d}/canada-employment-law/SKILL.md`) ? "ok" : "MISSING"} ${d}`);
      const m = t.mcp(env, server);
      const mcp = m.kind === "json" ? planJsonAdd(io.read(m.file), m.format, server).status === "unchanged" ? `ok ${m.file}` : `MISSING ${m.file}` : m.kind === "toml" ? planTomlAdd(io.read(m.file), server).status === "unchanged" ? `ok ${m.file}` : `MISSING ${m.file}` : m.kind === "command" ? `set with ${basename2(m.exe)} (check: ${basename2(m.exe)} mcp list)` : "manual";
      say(`  ${t.name} (${t.id})`);
      for (const s of skills) say(`    skill: ${s}`);
      say(`    MCP:   ${mcp}`);
    }
    return done(0);
  }
  if (cmd !== "install" && cmd !== "uninstall") {
    say(USAGE);
    return done(2);
  }
  let actions;
  try {
    if (cmd === "install") {
      const targets = ids.length > 0 ? ids : detectTools(env).map((t) => t.id);
      if (targets.length === 0) {
        say("No supported AI tool was found on this computer. / \u8FD9\u53F0\u7535\u8111\u4E0A\u6CA1\u627E\u5230\u652F\u6301\u7684 AI \u5DE5\u5177\u3002");
        say('Run "canada-law list" to see the supported tools, or name one: canada-law install <tool>');
        return done(1);
      }
      actions = planInstall(targets, env, { pkgRoot: deps.pkgRoot, read: io.read, previous: state ?? void 0 });
    } else {
      if (!state && ids.length === 0) {
        say("Nothing installed. / \u8FD8\u6CA1\u6709\u5B89\u88C5\u3002");
        return done(0);
      }
      actions = planUninstall(ids.length > 0 ? ids : null, env, { read: io.read, state });
    }
  } catch (e) {
    say(e instanceof Error ? e.message : String(e));
    return done(2);
  }
  say(`${cmd === "install" ? "Install" : "Uninstall"} plan / \u8BA1\u5212:`);
  for (const a of actions) say(`  ${describe(a)}`);
  say();
  if (flags.has("--print")) {
    say("Preview only: nothing was changed. / \u53EA\u662F\u9884\u89C8\uFF0C\u6CA1\u6709\u6539\u52A8\u4EFB\u4F55\u4E1C\u897F\u3002");
    return done(0);
  }
  if (!flags.has("--yes")) {
    if (!deps.isTTY) {
      say("Nothing was changed yet. Re-run with --yes to apply. / \u8FD8\u6CA1\u6709\u6539\u52A8\u3002\u52A0\u4E0A --yes \u518D\u8FD0\u884C\u4E00\u6B21\u624D\u4F1A\u6267\u884C\u3002");
      return done(0);
    }
    if (!await deps.ask("Apply these changes? / \u786E\u8BA4\u6267\u884C\uFF1F [y/N] ")) {
      say("Cancelled: nothing was changed. / \u5DF2\u53D6\u6D88\uFF0C\u6CA1\u6709\u6539\u52A8\u3002");
      return done(0);
    }
  }
  const outcomes = applyActions(actions, io);
  say("Result / \u7ED3\u679C:");
  for (const o of outcomes) say(outcomeLine(o));
  say();
  const failed = outcomes.filter((o) => !o.ok);
  if (failed.length > 0) say(`${failed.length} step(s) failed; see above. / \u6709 ${failed.length} \u6B65\u5931\u8D25\uFF0C\u89C1\u4E0A\u3002`);
  if (cmd === "install") {
    say("Restart your AI tools so they pick up the change. / \u91CD\u542F\u4F60\u7684 AI \u5DE5\u5177\u540E\u751F\u6548\u3002");
    if (actions.some((a) => a.type === "write-file" && a.tool === "claude-desktop")) {
      say("Claude Desktop: quit it completely, then reopen. / Claude \u684C\u9762\u7248\uFF1A\u5B8C\u5168\u9000\u51FA\u540E\u518D\u6253\u5F00\u3002");
    }
  }
  return done(failed.length > 0 ? 1 : 0);
}

// src/install/bin.ts
var pkgRoot = dirname2(dirname2(fileURLToPath(import.meta.url)));
async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await rl.question(question)).trim());
  } finally {
    rl.close();
  }
}
var r = await runInstaller(process.argv.slice(2), { env: realEnv(), io: realIo(), pkgRoot, isTTY: Boolean(process.stdin.isTTY), ask });
process.stdout.write(r.out + "\n");
process.exitCode = r.code;
