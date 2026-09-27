// Runs an MCP server over stdio and removes `instructions` from its initialize reply, as Claude Desktop reportedly
// never passes them to the model (anthropics/claude-ai-mcp#93). Used by the comparison test (scripts/compare.ts).
//   node scripts/strip-instructions.mjs <server.mjs>
import { spawn } from 'node:child_process';

const child = spawn(process.execPath, [process.argv[2]], { stdio: ['pipe', 'pipe', 'inherit'] });
process.stdin.pipe(child.stdin);

let buf = '';
child.stdout.on('data', (d) => {
  buf += d.toString('utf8');
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    let line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    try {
      const msg = JSON.parse(line);
      if (msg && msg.result && typeof msg.result === 'object' && 'instructions' in msg.result) {
        delete msg.result.instructions;
        line = JSON.stringify(msg);
      }
    } catch {
      // not JSON: pass it on unchanged
    }
    process.stdout.write(line + '\n');
  }
});
child.on('exit', (code) => process.exit(code ?? 0));
