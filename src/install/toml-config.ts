// Codex keeps MCP servers in ~/.codex/config.toml. We only ever touch our own [mcp_servers.canada-law] table,
// as text: everything else in the file (other tables, comments, line endings) stays byte-for-byte.
const OUR_HEADER = /^\s*\[\s*mcp_servers\s*\.\s*(?:"canada-law"|canada-law)\s*\]\s*(?:#.*)?$/;
const ANY_HEADER = /^\s*\[/;

/** TOML literal string ('…', no escapes) unless the path itself contains a quote or newline. */
const tomlString = (s: string) => (s.includes("'") || /[\r\n]/.test(s) ? JSON.stringify(s) : `'${s}'`);

function ourTable(serverPath: string, eol: string): string {
  return ['[mcp_servers.canada-law]', 'command = "node"', `args = [${tomlString(serverPath)}]`, ''].join(eol);
}

/** Our table: from its header up to the next table header (or the end of the file). */
function findOurTable(lines: string[]): { start: number; end: number; contentEnd: number } | null {
  const start = lines.findIndex((l) => OUR_HEADER.test(l));
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length && !ANY_HEADER.test(lines[end])) end++;
  let contentEnd = end;
  while (contentEnd > start + 1 && lines[contentEnd - 1].trim() === '') contentEnd--;
  return { start, end, contentEnd };
}

export type TomlAddPlan = { status: 'create' | 'update' | 'unchanged'; next?: string };
export type TomlRemovePlan = { status: 'remove' | 'absent'; next?: string };

export function planTomlAdd(current: string | null, serverPath: string): TomlAddPlan {
  if (current === null) return { status: 'create', next: ourTable(serverPath, '\n') };
  const eol = current.includes('\r\n') ? '\r\n' : '\n';
  const table = ourTable(serverPath, eol);
  const lines = current.split(/\r?\n/);
  const found = findOurTable(lines);
  if (found) {
    const existing = lines.slice(found.start, found.contentEnd).join(eol) + eol;
    if (existing === table) return { status: 'unchanged' };
    const next = [...lines.slice(0, found.start), ...table.split(eol).slice(0, -1), ...lines.slice(found.contentEnd)];
    return { status: 'update', next: next.join(eol) };
  }
  const base = current === '' || current.endsWith(eol) ? current : current + eol;
  return { status: 'update', next: base + (base === '' ? '' : eol) + table };
}

export function planTomlRemove(current: string | null): TomlRemovePlan {
  if (current === null) return { status: 'absent' };
  const eol = current.includes('\r\n') ? '\r\n' : '\n';
  const lines = current.split(/\r?\n/);
  const found = findOurTable(lines);
  if (!found) return { status: 'absent' };
  return { status: 'remove', next: [...lines.slice(0, found.start), ...lines.slice(found.end)].join(eol) };
}
