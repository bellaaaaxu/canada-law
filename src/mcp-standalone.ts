// Entry point of the single-file MCP server (mcp/canada-law-mcp.mjs and the .mcpb bundle).
// The glossary is embedded at build time; the cache lives in the OS temp folder.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Glossary } from './glossary.js';
import { createCachedFetcher } from './http.js';
import { createServer } from './server.js';

declare const __GLOSSARY__: Glossary; // replaced with data/glossary.json by scripts/build.ts

const server = createServer({
  fetcher: createCachedFetcher({ cacheDir: join(tmpdir(), 'canada-law-cache') }),
  glossary: __GLOSSARY__,
});
await server.connect(new StdioServerTransport());
