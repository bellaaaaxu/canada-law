import { z } from 'zod';
import type { BcClient } from '../sources/bc.js';
import type { FederalClient } from '../sources/federal.js';
import { ToolError } from '../tool-error.js';

/** The official sources the tools read. */
export type Sources = { bc: BcClient; federal: FederalClient };

export const jurisdiction = z
  .enum(['bc', 'federal'])
  .describe('"bc" for British Columbia statutes and regulations (BC Laws); "federal" for acts and regulations of Canada (Justice Laws), such as the Canada Labour Code.');

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
    return fail(`Unexpected error while reading the official source: ${e instanceof Error ? e.message : String(e)}`);
  }
}
