#!/usr/bin/env node
// stdio entry point. Nothing may be written to stdout except MCP protocol messages.
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadGlossary } from './glossary.js';
import { createCachedFetcher } from './http.js';
import { createServer } from './server.js';

const cacheDir = fileURLToPath(new URL('../cache/', import.meta.url));
const server = createServer({ fetcher: createCachedFetcher({ cacheDir }), glossary: loadGlossary() });
await server.connect(new StdioServerTransport());
