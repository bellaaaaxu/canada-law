import { describe, expect, it } from 'vitest';
import { planJsonAdd, planJsonRemove } from '../../src/install/json-config.js';

const SERVER = 'C:\\Users\\张三\\.canada-law\\canada-law-mcp.mjs';

describe('planJsonAdd', () => {
  it('creates the file when it does not exist', () => {
    const r = planJsonAdd(null, 'mcpServers', SERVER);
    expect(r.status).toBe('create');
    expect(JSON.parse(r.next!)).toEqual({ mcpServers: { 'canada-law': { command: 'node', args: [SERVER] } } });
  });

  it('adds our server without touching the user’s other servers and settings', () => {
    const current = JSON.stringify({ theme: 'dark', mcpServers: { other: { command: 'x', args: [] } } });
    const r = planJsonAdd(current, 'mcpServers', SERVER);
    expect(r.status).toBe('update');
    expect(JSON.parse(r.next!)).toEqual({
      theme: 'dark',
      mcpServers: { other: { command: 'x', args: [] }, 'canada-law': { command: 'node', args: [SERVER] } },
    });
  });

  it('reports unchanged when our identical entry is already there', () => {
    const current = JSON.stringify({ mcpServers: { 'canada-law': { command: 'node', args: [SERVER] } } });
    expect(planJsonAdd(current, 'mcpServers', SERVER).status).toBe('unchanged');
  });

  it('refuses to touch a file it cannot parse', () => {
    for (const bad of ['{ "mcpServers": { ', '[1, 2]', '{ "mcpServers": "oops" }']) {
      const r = planJsonAdd(bad, 'mcpServers', SERVER);
      expect(r.status, bad).toBe('unparseable');
      expect(r.next).toBeUndefined();
    }
  });

  it('reads a file that starts with a UTF-8 byte-order mark', () => {
    expect(planJsonAdd('\ufeff{}', 'mcpServers', SERVER).status).toBe('update');
  });

  it('writes the Copilot CLI format', () => {
    const r = planJsonAdd(null, 'copilot', SERVER);
    expect(JSON.parse(r.next!)).toEqual({
      mcpServers: { 'canada-law': { type: 'local', command: 'node', args: [SERVER], tools: ['*'] } },
    });
  });

  it('writes the OpenCode format, with its schema for a new file', () => {
    const r = planJsonAdd(null, 'opencode', SERVER);
    expect(JSON.parse(r.next!)).toEqual({
      $schema: 'https://opencode.ai/config.json',
      mcp: { 'canada-law': { type: 'local', command: ['node', SERVER], enabled: true } },
    });
  });
});

describe('planJsonRemove', () => {
  it('removes only our server', () => {
    const current = JSON.stringify({ mcpServers: { other: { command: 'x' }, 'canada-law': { command: 'node', args: [SERVER] } } });
    const r = planJsonRemove(current, 'mcpServers');
    expect(r.status).toBe('remove');
    expect(JSON.parse(r.next!)).toEqual({ mcpServers: { other: { command: 'x' } } });
  });

  it('reports absent when there is nothing to remove', () => {
    expect(planJsonRemove(null, 'mcpServers').status).toBe('absent');
    expect(planJsonRemove('{"mcpServers":{}}', 'mcpServers').status).toBe('absent');
  });

  it('refuses to touch a file it cannot parse', () => {
    expect(planJsonRemove('not json', 'mcpServers').status).toBe('unparseable');
  });

  it('removes from the OpenCode "mcp" key', () => {
    const current = JSON.stringify({ mcp: { 'canada-law': { type: 'local' } } });
    expect(JSON.parse(planJsonRemove(current, 'opencode').next!)).toEqual({ mcp: {} });
  });
});
