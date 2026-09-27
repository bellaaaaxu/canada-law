// Add or remove our MCP server in a tool's JSON config, as text in → text out (so the installer can preview it).
// Anything we cannot parse is left alone: the user gets a manual instruction instead.
export const SERVER_NAME = 'canada-law';

/** mcpServers: Claude Desktop, Cursor, Gemini CLI, Antigravity, Kiro, Qwen Code, Kimi Code. copilot / opencode: their own shapes. */
export type JsonFormat = 'mcpServers' | 'copilot' | 'opencode';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function shape(format: JsonFormat, serverPath: string): { container: string; value: Obj } {
  if (format === 'opencode') return { container: 'mcp', value: { type: 'local', command: ['node', serverPath], enabled: true } };
  if (format === 'copilot') return { container: 'mcpServers', value: { type: 'local', command: 'node', args: [serverPath], tools: ['*'] } };
  return { container: 'mcpServers', value: { command: 'node', args: [serverPath] } };
}

function parse(text: string): Obj | null {
  try {
    const v = JSON.parse(text.replace(/^﻿/, ''));
    return isObj(v) ? v : null;
  } catch {
    return null;
  }
}

const serialize = (o: Obj) => JSON.stringify(o, null, 2) + '\n';

export type AddPlan = { status: 'create' | 'update' | 'unchanged' | 'unparseable'; next?: string };
export type RemovePlan = { status: 'remove' | 'absent' | 'unparseable'; next?: string };

export function planJsonAdd(current: string | null, format: JsonFormat, serverPath: string): AddPlan {
  const { container, value } = shape(format, serverPath);
  if (current === null) {
    const fresh: Obj = format === 'opencode' ? { $schema: 'https://opencode.ai/config.json' } : {};
    fresh[container] = { [SERVER_NAME]: value };
    return { status: 'create', next: serialize(fresh) };
  }
  const doc = parse(current);
  if (!doc) return { status: 'unparseable' };
  const servers = doc[container] ?? {};
  if (!isObj(servers)) return { status: 'unparseable' };
  if (JSON.stringify(servers[SERVER_NAME]) === JSON.stringify(value)) return { status: 'unchanged' };
  doc[container] = { ...servers, [SERVER_NAME]: value };
  return { status: 'update', next: serialize(doc) };
}

export function planJsonRemove(current: string | null, format: JsonFormat): RemovePlan {
  if (current === null) return { status: 'absent' };
  const doc = parse(current);
  if (!doc) return { status: 'unparseable' };
  const { container } = shape(format, '');
  const servers = doc[container];
  if (servers !== undefined && !isObj(servers)) return { status: 'unparseable' };
  if (!servers || !(SERVER_NAME in servers)) return { status: 'absent' };
  const { [SERVER_NAME]: _ours, ...rest } = servers;
  doc[container] = rest;
  return { status: 'remove', next: serialize(doc) };
}
