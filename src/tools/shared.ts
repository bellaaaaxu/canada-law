import { z } from 'zod';
import { ToolError } from '../sources/bc.js';

export const FEDERAL_NOT_YET =
  'Federal legislation is not available yet (planned for milestone M2). Only jurisdiction "bc" works for now.';

export const jurisdiction = z
  .enum(['bc', 'federal'])
  .describe('"bc" for British Columbia statutes and regulations; "federal" for federal law (not available until M2).');

export const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;

type Result = { content: { type: 'text'; text: string }[]; isError?: boolean };

const ok = (value: unknown): Result => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
export const fail = (message: string): Result => ({ isError: true, content: [{ type: 'text', text: message }] });

/** Runs a tool body; ToolError messages go back to the caller as-is, anything else is labelled unexpected. */
export async function run(body: () => Promise<unknown>): Promise<Result> {
  try {
    return ok(await body());
  } catch (e) {
    if (e instanceof ToolError) return fail(e.message);
    return fail(`Unexpected error while reading BC Laws: ${e instanceof Error ? e.message : String(e)}`);
  }
}
