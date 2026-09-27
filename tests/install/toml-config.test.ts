import { describe, expect, it } from 'vitest';
import { planTomlAdd, planTomlRemove } from '../../src/install/toml-config.js';

const SERVER = 'C:\\Users\\张三\\.canada-law\\canada-law-mcp.mjs';
const BLOCK = `[mcp_servers.canada-law]\ncommand = "node"\nargs = ['${SERVER}']\n`;

describe('planTomlAdd (Codex ~/.codex/config.toml)', () => {
  it('creates the file with our table when it does not exist', () => {
    expect(planTomlAdd(null, SERVER)).toEqual({ status: 'create', next: BLOCK });
  });

  it('appends our table and keeps everything else, comments included', () => {
    const current = '# my settings\nmodel = "o5"\n\n[mcp_servers.other]\ncommand = "x"\n';
    const r = planTomlAdd(current, SERVER);
    expect(r.status).toBe('update');
    expect(r.next).toBe(`${current}\n${BLOCK}`);
  });

  it('replaces an older copy of our table in place', () => {
    const current = `a = 1\n\n[mcp_servers.canada-law]\ncommand = "node"\nargs = ['C:\\old\\path.mjs']\n\n[mcp_servers.other]\ncommand = "x"\n`;
    const r = planTomlAdd(current, SERVER);
    expect(r.status).toBe('update');
    expect(r.next).toBe(`a = 1\n\n${BLOCK}\n[mcp_servers.other]\ncommand = "x"\n`);
  });

  it('reports unchanged when our identical table is already there', () => {
    expect(planTomlAdd(`x = 1\n\n${BLOCK}`, SERVER).status).toBe('unchanged');
  });

  it('keeps Windows line endings', () => {
    const r = planTomlAdd('model = "o5"\r\n', SERVER);
    expect(r.next).toBe(`model = "o5"\r\n\r\n${BLOCK.replace(/\n/g, '\r\n')}`);
  });

  it('uses an escaped basic string when the path contains a single quote', () => {
    const r = planTomlAdd(null, "C:\\Users\\O'Neil\\x.mjs");
    expect(r.next).toContain('args = ["C:\\\\Users\\\\O\'Neil\\\\x.mjs"]');
  });
});

describe('planTomlRemove', () => {
  it('removes only our table', () => {
    const current = `a = 1\n\n${BLOCK}\n[mcp_servers.other]\ncommand = "x"\n`;
    expect(planTomlRemove(current)).toEqual({ status: 'remove', next: 'a = 1\n\n[mcp_servers.other]\ncommand = "x"\n' });
  });

  it('recognises the quoted form of our table name', () => {
    const current = `[mcp_servers."canada-law"]\ncommand = "node"\n`;
    expect(planTomlRemove(current).status).toBe('remove');
  });

  it('reports absent when our table is not there', () => {
    expect(planTomlRemove(null).status).toBe('absent');
    expect(planTomlRemove('[mcp_servers.other]\ncommand = "x"\n').status).toBe('absent');
  });
});
