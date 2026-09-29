/** An error whose message is meant for the caller (shown as the tool result, or on stderr by the script). */
export class ToolError extends Error {}

/** What the AI must do when the official text could not be fetched. Also in the answer rules (src/answer-rules.ts). */
export const NOT_FETCHED_ADVICE =
  'Tell the user that the official text could not be fetched here, and give them the official website. Do not supply the wording, a "current to" date or a version from another website or from memory, and do not download the whole act page some other way.';

const NETWORK_CODES = /^(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|UND_ERR_\w+|CERT_\w+|SELF_SIGNED_CERT\w*|UNABLE_TO_\w+)$/;

/**
 * A fetch that threw before any HTTP response: DNS failure, no route, refused, timed out, TLS failure. Seen in
 * sandboxes whose network allows package managers only (claude.ai code execution, 2026-09-29): the script printed
 * "fetch failed" and the model then answered with a wrong "current to" date from elsewhere.
 */
export function unreachable(url: string, error: unknown): ToolError {
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  })();
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  const code = typeof cause?.code === 'string' && NETWORK_CODES.test(cause.code) ? cause.code : null;
  const detail = code ?? (error instanceof Error ? error.message : String(error));
  return new ToolError(
    `Could not reach ${host} from this environment (${detail}): the network may be blocked or offline. ${NOT_FETCHED_ADVICE} Official website: https://${host}/`,
  );
}
